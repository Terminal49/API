/**
 * Automatic page iteration for --all flag.
 *
 * Iterates through all pages of a list endpoint,
 * emitting NDJSON (one JSON object per line) for
 * streaming into LLM context or processing pipelines.
 */

export interface PaginationRequest<T> {
  fetchPage: (page: number) => Promise<T>;
  isLastPage: (response: T, page: number) => boolean;
}

export interface NDJSONSink {
  write(line: string): void;
}

export async function collectAllPages<T>(
  request: PaginationRequest<T>,
  startPage = 1,
): Promise<T[]> {
  const results: T[] = [];
  let page = startPage;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pageResult = await request.fetchPage(page);
    results.push(pageResult);
    if (request.isLastPage(pageResult, page)) break;
    page += 1;
  }
  return results;
}

export async function emitAllPagesAsNdjson<T>(
  request: PaginationRequest<T>,
  sink: NDJSONSink,
  startPage = 1,
): Promise<void> {
  const pageResults = await collectAllPages(request, startPage);
  pageResults.forEach((result) => {
    sink.write(`${JSON.stringify(result)}\n`);
  });
}
