import { isRecord, type ToolResult } from './client.js';

// Fixture discovery must not depend on shipments still being actively tracked.
export const fixtureListArgs = {
  page_size: 10,
  include_stopped_tracking: true,
};

export function fixtureItems(tool: string, result: ToolResult): unknown[] {
  if (result.http !== 200 || result.isError) {
    // Never print upstream messages or payloads: they may contain customer data.
    throw new Error(
      `Fixture discovery ${tool} failed (HTTP ${result.http}, tool error: ${result.isError}); check eval credentials and upstream availability.`,
    );
  }
  if (!isRecord(result.payload) || !Array.isArray(result.payload.items)) {
    throw new Error(
      `Fixture discovery ${tool} returned no items array; check the tool response contract.`,
    );
  }
  return result.payload.items;
}
