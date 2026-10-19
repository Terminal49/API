import { describe, expect, it } from 'vite-plus/test';
import type { ToolResult } from './client.js';
import { fixtureItems, fixtureListArgs } from './fixtures.js';

const result = (overrides: Partial<ToolResult> = {}): ToolResult => ({
  http: 200,
  isError: false,
  latencyMs: 1,
  bytes: 0,
  blocks: [],
  payload: { items: [] },
  errorMessage: undefined,
  rawText: '',
  ...overrides,
});

describe('fixture discovery', () => {
  it('includes historical shipments instead of requiring active tracking', () => {
    expect(fixtureListArgs.include_stopped_tracking).toBe(true);
  });
  it('keeps a genuine empty list distinct from a failed request', () => {
    expect(fixtureItems('list_shipments', result())).toEqual([]);
    expect(() => fixtureItems('list_shipments', result({ http: 401 }))).toThrow(
      'HTTP 401',
    );
    expect(() =>
      fixtureItems('list_containers', result({ isError: true })),
    ).toThrow('tool error: true');
  });
  it('rejects malformed payloads without exposing their contents', () => {
    let message = '';
    try {
      fixtureItems(
        'list_shipments',
        result({ payload: { error: 'PRIVATE_VALUE' } }),
      );
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('returned no items array');
    expect(message).not.toContain('PRIVATE_VALUE');
  });
  it('reports the server tool error text so CI shows the cause', () => {
    expect(() =>
      fixtureItems(
        'list_shipments',
        result({
          isError: true,
          rawText:
            'The Terminal49 request could not be completed. Contact support if the problem persists.',
        }),
      ),
    ).toThrow(
      'Fixture discovery list_shipments failed (HTTP 200, tool error: true): The Terminal49 request could not be completed. Contact support if the problem persists.; check eval credentials and upstream availability.',
    );
    expect(() =>
      fixtureItems(
        'list_shipments',
        result({ http: 500, isError: true, errorMessage: 'Internal error' }),
      ),
    ).toThrow('(HTTP 500, tool error: true): Internal error;');
  });
  it('redacts token-like values and signed URLs from the printed error text', () => {
    let message = '';
    try {
      fixtureItems(
        'list_shipments',
        result({
          isError: true,
          rawText:
            'denied for Token abc123 key FAKEKEY0123456789abcdefghijABCDEF at https://files.example/doc.pdf?X-Amz-Signature=deadbeef',
        }),
      );
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain(
      'denied for Token [REDACTED] key [REDACTED] at [REDACTED_URL];',
    );
  });
  it('preserves discovered rows', () => {
    const items = [{ id: 'fixture-id' }];
    expect(fixtureItems('list_shipments', result({ payload: { items } }))).toBe(
      items,
    );
  });
});
