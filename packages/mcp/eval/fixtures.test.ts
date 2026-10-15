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
    expect(() =>
      fixtureItems(
        'list_shipments',
        result({ payload: { error: 'PRIVATE_VALUE' } }),
      ),
    ).toThrow('returned no items array');
    try {
      fixtureItems(
        'list_shipments',
        result({ isError: true, rawText: 'PRIVATE_VALUE' }),
      );
    } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_VALUE');
    }
  });
  it('preserves discovered rows', () => {
    const items = [{ id: 'fixture-id' }];
    expect(fixtureItems('list_shipments', result({ payload: { items } }))).toBe(
      items,
    );
  });
});
