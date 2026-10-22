/** Refuse results that the API could not scope to every requested filter. */
export function assertNoIgnoredFilters(ignored: unknown): void {
  if (ignored === undefined) return;
  if (
    !Array.isArray(ignored) ||
    !ignored.every((key) => typeof key === 'string')
  ) {
    throw new Error(
      'Invalid ignored_filters diagnostics from the container API; results were withheld.',
    );
  }
  if (ignored.length > 0) {
    throw new Error(
      `The container API did not apply these filters: ${ignored.join(', ')}. Results were withheld to avoid presenting unfiltered data. Correct the filter names or account-specific custom field slugs and retry; do not silently remove the requested constraints.`,
    );
  }
}
