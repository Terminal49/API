import { TimeoutError } from './errors.js';

/**
 * Wrap a `fetch` implementation so every request is bounded by an
 * AbortController-based timeout. If `timeoutMs <= 0` the original fetch is
 * returned untouched (no signal is injected), which keeps timeouts opt-out and
 * preserves any caller-provided `signal`.
 *
 * When the timeout fires the in-flight request is aborted and the returned
 * promise rejects with a {@link TimeoutError}. A caller `signal` is honored too:
 * if it aborts first we forward that abort to the underlying request.
 */
export function withTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): typeof fetch {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetchImpl;
  }

  return async function timedFetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Forward a caller-supplied signal so an external cancel still works.
    const callerSignal = init?.signal ?? undefined;
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
      }
    }

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (callerSignal) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    }
  };
}
