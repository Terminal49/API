import { ToolInputError } from './soft-results.js';

/** Refuse results that the API could not scope to every requested filter. */
export function assertNoIgnoredFilters(ignored: unknown): void {
  if (ignored === undefined) return;
  if (
    !Array.isArray(ignored) ||
    !ignored.every(
      (key) => typeof key === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(key),
    )
  ) {
    throw new Error(
      'Invalid ignored_filters diagnostics from the container API; results were withheld.',
    );
  }
  if (ignored.length > 0) {
    // Only validated filter identifiers are exposed, never upstream error text.
    throw new ToolInputError(
      `The container API did not apply these filters: ${ignored.join(', ')}. Results were withheld to avoid presenting unfiltered data. Correct the filter names or account-specific custom field slugs and retry; do not silently remove the requested constraints.`,
    );
  }
}
