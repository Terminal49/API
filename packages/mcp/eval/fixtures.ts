import { redactSignedUrls } from '../src/signed-urls.js';
import { isRecord, type ToolResult } from './client.js';

// Fixture discovery must not depend on shipments still being actively tracked.
export const fixtureListArgs = {
  page_size: 10,
  include_stopped_tracking: true,
};

export function fixtureItems(tool: string, result: ToolResult): unknown[] {
  if (result.http !== 200 || result.isError) {
    throw new Error(
      `Fixture discovery ${tool} failed (HTTP ${result.http}, tool error: ${result.isError}): ${describeFailure(result)}; check eval credentials and upstream availability.`,
    );
  }
  if (!isRecord(result.payload) || !Array.isArray(result.payload.items)) {
    throw new Error(
      `Fixture discovery ${tool} returned no items array; check the tool response contract.`,
    );
  }
  return result.payload.items;
}

const MAX_FAILURE_TEXT = 300;

// Tool error text is the server's client-facing message, which already hides
// upstream detail. It is still redacted because CI logs are public.
function describeFailure(result: ToolResult): string {
  const text = (result.errorMessage ?? result.rawText).trim();
  if (!text) return 'no error text';
  return redactSignedUrls(text)
    .replace(/\b(Bearer|Token)\s+\S+/gi, '$1 [REDACTED]')
    .replace(/[A-Za-z0-9_\-+/=.]{24,}/g, '[REDACTED]')
    .slice(0, MAX_FAILURE_TEXT);
}
