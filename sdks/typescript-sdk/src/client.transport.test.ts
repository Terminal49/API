import { describe, expect, it, vi } from 'vitest';
import {
  RateLimitError,
  Terminal49Client,
  Terminal49Error,
  TimeoutError,
  UpstreamError,
} from './client.js';
import { jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';

describe('Terminal49Client transport resilience', () => {
  it('normalizes a thrown network error and retries it like a 5xx', async () => {
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const fetchImpl = vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new TypeError('fetch failed');
        }
        return jsonResponse({ data: { id: 'route-1' } });
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRetries: 1,
      });

      const resultPromise = client.getContainerRoute('abc');
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.data.id).toBe('route-1');
      expect(attempt).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a Terminal49Error when a network error exhausts retries', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRetries: 1,
      });

      const resultPromise = client.getContainerRoute('abc');
      const assertion =
        expect(resultPromise).rejects.toBeInstanceOf(Terminal49Error);
      await vi.advanceTimersByTimeAsync(500);
      await assertion;
      // 1 initial + 1 retry
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the Retry-After header before retrying a 429', async () => {
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const fetchImpl = vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          return jsonResponse({ errors: [{ detail: 'slow down' }] }, 429, {
            'Retry-After': '3',
          });
        }
        return jsonResponse({ data: { id: 'route-1' } });
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRetries: 1,
      });

      const resultPromise = client.getContainerRoute('abc');

      // The fixed exponential backoff for attempt 0 would be 500ms; the
      // Retry-After header asks for 3s, so nothing should fire before then.
      await vi.advanceTimersByTimeAsync(2000);
      expect(attempt).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;
      expect(result.data.id).toBe('route-1');
      expect(attempt).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a write (POST) on a 5xx', async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      return jsonResponse({ errors: [{ detail: 'server error' }] }, 500);
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 3,
    });

    await expect(
      client.createTrackingRequest({
        requestType: 'container',
        requestNumber: 'MSCU1234567',
      }),
    ).rejects.toBeInstanceOf(UpstreamError);

    // Write must NOT be retried: exactly one attempt.
    expect(attempt).toBe(1);
  });

  it('still maps a 429 on a write to RateLimitError without retrying', async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      return jsonResponse({ errors: [{ detail: 'slow down' }] }, 429);
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 3,
    });

    await expect(
      client.createTrackingRequest({
        requestType: 'container',
        requestNumber: 'MSCU1234567',
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(attempt).toBe(1);
  });

  it('stops iterate() at the safety page bound even when next never ends', async () => {
    // A misconfigured/no-op filter where the server always advertises a
    // `next` link would otherwise walk the entire dataset forever. The
    // iterator must stop at its documented max-pages cap.
    let pageRequests = 0;
    const fetchImpl = vi.fn(async (input: Request | URL | string) => {
      pageRequests += 1;
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      const page = Number(url.searchParams.get('page[number]') ?? '1');
      return jsonResponse({
        data: [
          {
            id: `ship-${page}`,
            type: 'shipment',
            attributes: { status: 'in_transit' },
          },
        ],
        // Always advertise a next page — an unbounded iterator would loop.
        links: { next: `page=${page + 1}` },
      });
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const items = [];
    for await (const shipment of client.shipments.iterate({}, {
      pageSize: 1,
      maxPages: 3,
    } as { pageSize?: number; maxPages?: number })) {
      items.push(shipment);
    }

    expect(items).toHaveLength(3);
    expect(pageRequests).toBe(3);
  });

  it('aborts a hung request via the configured request timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_input: Request | URL | string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              );
            });
          }),
      );

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRetries: 0,
        timeoutMs: 100,
      });

      const resultPromise = client.getContainer('abc');
      const assertion =
        expect(resultPromise).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
