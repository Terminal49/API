import { describe, expect, it, vi } from 'vite-plus/test';
import {
  RateLimitError,
  Terminal49Client,
  Terminal49Error,
  TimeoutError,
  UpstreamError,
} from './client.js';
import { Transport } from './client/transport.js';
import { jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';
const EMPTY_ROUTE = { type: 'FeatureCollection', features: [] };

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
        return jsonResponse(EMPTY_ROUTE);
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

      expect(result).toEqual(EMPTY_ROUTE);
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

  it('normalizes a network error thrown by a response-triggered retry', async () => {
    // First response is a retryable 5xx; the retry fetch then throws a raw
    // network error. openapi-fetch does not route an onResponse throw back
    // through onError, so without normalization the caller would see a bare
    // TypeError instead of a Terminal49Error.
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const fetchImpl = vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          return jsonResponse({ errors: [{ detail: 'server error' }] }, 503);
        }
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
      expect(attempt).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still retries a 5xx after recovering from an initial network error', async () => {
    // A transient sequence of network failure -> 500 -> success must succeed:
    // recovering from the thrown error in onError must not discard the replay
    // state that onResponse needs to retry the subsequent 500.
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const fetchImpl = vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('fetch failed');
        if (attempt === 2) {
          return jsonResponse({ errors: [{ detail: 'server error' }] }, 500);
        }
        return jsonResponse(EMPTY_ROUTE);
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRetries: 2,
      });

      const resultPromise = client.getContainerRoute('abc');
      await vi.advanceTimersByTimeAsync(2000);
      const result = await resultPromise;

      expect(result).toEqual(EMPTY_ROUTE);
      expect(attempt).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts network and 5xx retries against one maxRetries budget', async () => {
    vi.useFakeTimers();
    try {
      const outcomes = ['throw', 'throw', 503, 503, 200] as const;
      let attempt = 0;
      const fetchImpl = vi.fn(async () => {
        const outcome = outcomes[attempt++];
        if (outcome === 'throw') throw new TypeError('fetch failed');
        if (outcome === 503) {
          return jsonResponse({ error: 'Data source error' }, 503);
        }
        return jsonResponse({ results: [] });
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxRetries: 2,
      });

      const resultPromise = client.tradeIntel.searchCommodities({
        query: 'office chairs',
      });
      const assertion =
        expect(resultPromise).rejects.toBeInstanceOf(UpstreamError);
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(3);
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
        return jsonResponse(EMPTY_ROUTE);
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
      expect(result).toEqual(EMPTY_ROUTE);
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
    // `maxPages` is type-reachable via ListOptions, so no cast is needed.
    for await (const shipment of client.shipments.iterate(
      {},
      { pageSize: 1, maxPages: 3 },
    )) {
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

describe('SDK cancellation boundaries', () => {
  it.each([
    ['typed', 200],
    ['manual', 200],
    ['typed', 503],
    ['manual', 503],
  ] as const)(
    'times out %s status %i body consumption',
    async (kind, status) => {
      vi.useFakeTimers();
      try {
        const cancel = vi.fn();
        const client = new Terminal49Client({
          apiToken: 'dummy',
          apiBaseUrl: baseUrl,
          maxRetries: 0,
          timeoutMs: 50,
          fetchImpl: async () =>
            new Response(new ReadableStream({ cancel }), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
        });
        const pending =
          kind === 'manual'
            ? client.getContainerRoute('dummy')
            : client.listShippingLines();
        const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
        expect(cancel).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

it.each(['response', 'network'] as const)(
  'stops %s retry backoff immediately when the caller aborts',
  async (failure) => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => {
        if (failure === 'network') throw new TypeError('fetch failed');
        return jsonResponse({ errors: [] }, 503);
      });
      const transport = new Transport({
        apiToken: 'dummy',
        baseUrl,
        fetchImpl,
        maxRetries: 3,
      });
      const controller = new AbortController();
      const pending = transport.executeManual(
        new Request(`${baseUrl}/containers`, { signal: controller.signal }),
      );
      const assertion = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
      await assertion;
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  },
);

it('honors a typed caller signal while reading a body', async () => {
  const transport = new Transport({
    apiToken: 'dummy',
    baseUrl,
    maxRetries: 0,
    fetchImpl: async () =>
      new Response(new ReadableStream(), {
        headers: { 'content-type': 'application/json' },
      }),
  });
  const controller = new AbortController();
  const pending = transport.client.GET('/shipping_lines', {
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assertion;
});
