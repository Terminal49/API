import { describe, expect, it, vi } from 'vite-plus/test';
import { TimeoutError } from './errors.js';
import { withTimeout } from './timeout.js';

describe('withTimeout', () => {
  it('passes through a fast response unchanged', async () => {
    const inner = vi.fn(async () => new Response('ok'));
    const fetchImpl = withTimeout(inner, 1000);

    const res = await fetchImpl(new Request('https://api.test/v2/ping'));
    expect(await res.text()).toBe('ok');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('aborts a hung request once the timeout elapses', async () => {
    vi.useFakeTimers();
    try {
      const inner = vi.fn(
        (input: Request | URL | string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () => {
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              );
            });
          }),
      );
      const fetchImpl = withTimeout(inner, 50);

      const promise = fetchImpl(new Request('https://api.test/v2/hang'));
      const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not wrap with a timeout when timeoutMs is 0', async () => {
    const inner = vi.fn(async (_input, init?: RequestInit) => {
      // No timeout signal should be injected.
      expect(init?.signal).toBeUndefined();
      return new Response('ok');
    });
    const fetchImpl = withTimeout(inner, 0);
    await fetchImpl(new Request('https://api.test/v2/ping'));
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('request cancellation and body lifetime', () => {
  it('rejects an already aborted Request before fetching', async () => {
    const controller = new AbortController();
    controller.abort();
    const inner = vi.fn(async () => new Response('ok'));
    await expect(
      withTimeout(
        inner,
        1000,
      )(
        new Request('https://api.test', {
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow();
    expect(inner).not.toHaveBeenCalled();
  });
  it('keeps the timeout active while consuming a stalled body', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const inner = vi.fn(
        async () => new Response(new ReadableStream({ cancel })),
      );
      const response = await withTimeout(inner, 50)('https://api.test');
      const assertion = expect(response.text()).rejects.toBeInstanceOf(
        TimeoutError,
      );
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      expect(cancel).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

it('forwards Request cancellation during a pending fetch', async () => {
  const controller = new AbortController();
  const inner: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(init.signal?.reason),
      );
    });
  const pending = withTimeout(
    inner,
    1000,
  )(new Request('https://api.test', { signal: controller.signal }));
  controller.abort(new Error('caller stopped'));
  await expect(pending).rejects.toThrow('caller stopped');
});

it('lets init.signal override an aborted Request signal', async () => {
  const inputController = new AbortController();
  inputController.abort();
  const inner = vi.fn(async () => new Response('ok'));
  const response = await withTimeout(inner, 1000)(
    new Request('https://api.test', {
      signal: inputController.signal,
    }),
    { signal: new AbortController().signal },
  );
  expect(await response.text()).toBe('ok');
});

it('preserves fetched metadata on a streaming response and its clone', async () => {
  const source = new Response('payload', {
    status: 201,
    statusText: 'Created',
    headers: { 'x-test': 'yes' },
  });
  Object.defineProperties(source, {
    url: { value: 'https://api.test/final' },
    redirected: { value: true },
    type: { value: 'cors' },
  });
  const response = await withTimeout(
    async () => source,
    1000,
  )('https://api.test');
  const clone = response.clone();
  for (const item of [response, clone]) {
    expect(item).toBeInstanceOf(Response);
    expect(item.url).toBe(source.url);
    expect(item.redirected).toBe(true);
    expect(item.type).toBe('cors');
    expect(item.status).toBe(201);
    expect(item.statusText).toBe('Created');
    expect(item.headers.get('x-test')).toBe('yes');
    expect(await item.text()).toBe('payload');
    expect(item.bodyUsed).toBe(true);
  }
});

it('cancels the upstream stream and releases a deadline on body cancellation', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const response = await withTimeout(
      async () => new Response(new ReadableStream({ cancel })),
      50,
    )('https://api.test');
    await response.body?.cancel('done');
    expect(cancel).toHaveBeenCalledWith('done');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
