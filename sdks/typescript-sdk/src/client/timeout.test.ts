import { describe, expect, it, vi } from 'vitest';
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
