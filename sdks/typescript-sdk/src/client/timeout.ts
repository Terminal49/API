import { TimeoutError } from './errors.js';

export function withTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): typeof fetch {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetchImpl;

  return async function timedFetch(input, init): Promise<Response> {
    const controller = new AbortController();
    const callerSignal =
      init?.signal !== undefined
        ? init.signal
        : input instanceof Request
          ? input.signal
          : undefined;
    callerSignal?.throwIfAborted();

    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      controller.abort(
        new TimeoutError(`Request timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    };

    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (!response.body) {
        cleanup();
        return response;
      }
      const reader = response.body.getReader();
      let finishBody = cleanup;
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          const onAbort = () => {
            stream.error(controller.signal.reason);
            void reader.cancel(controller.signal.reason).catch(() => {});
            dispose();
          };
          const dispose = () => {
            cleanup();
            controller.signal.removeEventListener('abort', onAbort);
          };
          controller.signal.addEventListener('abort', onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
          else {
            finishBody = dispose;
          }
        },
        async pull(stream) {
          try {
            const { value, done } = await reader.read();
            if (done) {
              finishBody();
              stream.close();
            } else stream.enqueue(value);
          } catch (error) {
            finishBody();
            stream.error(
              controller.signal.aborted ? controller.signal.reason : error,
            );
          }
        },
        async cancel(reason) {
          finishBody();
          await reader.cancel(reason);
        },
      });
      return preserveResponseMetadata(
        new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
        response,
      );
    } catch (error) {
      cleanup();
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    }
  };
}

/** Response constructors do not preserve fetch-only metadata, including on clone. */
function preserveResponseMetadata(
  response: Response,
  source: Response,
): Response {
  const clone = response.clone.bind(response);
  Object.defineProperties(response, {
    url: { value: source.url },
    redirected: { value: source.redirected },
    type: { value: source.type },
    clone: { value: () => preserveResponseMetadata(clone(), source) },
  });
  return response;
}
