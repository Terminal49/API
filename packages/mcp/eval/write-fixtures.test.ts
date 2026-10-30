import { describe, expect, it } from 'vite-plus/test';
import { selectFixtureShipment } from './write-fixtures.js';

describe('selectFixtureShipment', () => {
  it('picks the one shipment that carries MCP-EVAL-FIXTURE', () => {
    expect(
      selectFixtureShipment([
        { id: 'demo-1', refNumbers: ['PO-1'] },
        { id: 'fixture', refNumbers: ['PO-2', 'MCP-EVAL-FIXTURE'] },
      ]),
    ).toBe('fixture');
  });

  it.each([
    ['no shipment carries a reference', [{ id: 'demo-1', refNumbers: [] }]],
    [
      'the reference only starts with the fixture reference',
      [{ id: 'demo-1', refNumbers: ['MCP-EVAL-FIXTURE-2'] }],
    ],
    [
      'the reference differs in case',
      [{ id: 'demo-1', refNumbers: ['mcp-eval-fixture'] }],
    ],
    [
      'the fixture reference is only in another field',
      [{ id: 'demo-1', refNumbers: [], billOfLading: 'MCP-EVAL-FIXTURE' }],
    ],
    [
      'two shipments carry the fixture reference',
      [
        { id: 'demo-1', refNumbers: ['MCP-EVAL-FIXTURE'] },
        { id: 'demo-2', refNumbers: ['MCP-EVAL-FIXTURE'] },
      ],
    ],
    ['the page is empty', []],
  ])('refuses to pick a shipment when %s', (_case, items) => {
    expect(selectFixtureShipment(items)).toBeUndefined();
  });
});
