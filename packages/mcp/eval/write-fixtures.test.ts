import { describe, expect, it } from 'vite-plus/test';
import {
  evalPartyNameIsFree,
  selectEvalDefinition,
  selectEvalParty,
  selectFixtureDocument,
  selectFixtureShipment,
} from './write-fixtures.js';

describe('selectFixtureShipment', () => {
  it('picks the one shipment that carries MCP-EVAL-FIXTURE', () => {
    expect(
      selectFixtureShipment([
        { id: 'demo-1', refNumbers: ['PO-1'] },
        {
          id: 'fixture',
          refNumbers: ['PO-2', 'MCP-EVAL-FIXTURE'],
          billOfLading: 'BOL-9',
        },
      ]),
    ).toEqual({ id: 'fixture', billOfLading: 'BOL-9' });
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

describe('selectEvalParty', () => {
  it('picks the party named exactly "MCP Eval (do not use)"', () => {
    expect(
      selectEvalParty([
        { id: 'demo-party', name: 'Acme Logistics' },
        { id: 'eval-party', name: 'MCP Eval (do not use)' },
      ]),
    ).toBe('eval-party');
  });

  it.each([
    ['only a demo party exists', [{ id: 'demo', name: 'Acme Logistics' }]],
    ['the name is a prefix', [{ id: 'near', name: 'MCP Eval' }]],
    [
      'the name differs in case',
      [{ id: 'near', name: 'mcp eval (do not use)' }],
    ],
    [
      'two parties have the name',
      [
        { id: 'one', name: 'MCP Eval (do not use)' },
        { id: 'two', name: 'MCP Eval (do not use)' },
      ],
    ],
    ['the payload has no parties', undefined],
  ])('refuses to pick a party when %s', (_case, parties) => {
    expect(selectEvalParty(parties)).toBeUndefined();
  });
});

describe('evalPartyNameIsFree', () => {
  it('lets the first run create the eval party when the search finds no party', () => {
    expect(evalPartyNameIsFree([])).toBe(true);
  });

  it.each([
    ['differs only in punctuation', 'MCP Eval do not use'],
    ['differs only in case', 'mcp eval (do not use)'],
    ['contains the name', 'MCP Eval (do not use) archive'],
    ['is the eval party', 'MCP Eval (do not use)'],
  ])('refuses when the search found a party that %s', (_case, name) => {
    expect(evalPartyNameIsFree([{ id: 'near', name }])).toBe(false);
  });

  it('refuses when the payload has no party list', () => {
    expect(evalPartyNameIsFree(undefined)).toBe(false);
  });
});

describe('selectEvalDefinition', () => {
  it('picks the short_text definition mcp_eval_fixture', () => {
    expect(
      selectEvalDefinition([
        { api_slug: 'po_number', data_type: 'short_text', archived: false },
        {
          api_slug: 'mcp_eval_fixture',
          data_type: 'short_text',
          archived: false,
        },
      ]),
    ).toBe('mcp_eval_fixture');
  });

  it.each([
    [
      'only another short_text definition exists',
      [{ api_slug: 'po_number', data_type: 'short_text', archived: false }],
    ],
    [
      'the slug matches but the type is not short_text',
      [{ api_slug: 'mcp_eval_fixture', data_type: 'number', archived: false }],
    ],
    [
      'the definition is archived',
      [
        {
          api_slug: 'mcp_eval_fixture',
          data_type: 'short_text',
          archived: true,
        },
      ],
    ],
    ['the account has no definitions', null],
  ])('refuses to pick a definition when %s', (_case, definitions) => {
    expect(selectEvalDefinition(definitions)).toBeUndefined();
  });
});

describe('selectFixtureDocument', () => {
  it('picks a document attached to the fixture shipment', () => {
    expect(
      selectFixtureDocument(
        [
          { id: 'demo-doc', shipment_ids: ['demo-1'] },
          { id: 'fixture-doc', shipment_ids: ['demo-1', 'fixture'] },
        ],
        'fixture',
      ),
    ).toBe('fixture-doc');
  });

  it('refuses a document attached only to other shipments', () => {
    expect(
      selectFixtureDocument(
        [
          { id: 'demo-doc', shipment_ids: ['demo-1'] },
          { id: 'loose-doc', shipment_ids: null },
        ],
        'fixture',
      ),
    ).toBeUndefined();
  });
});
