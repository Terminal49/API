import { describe, expect, it } from 'vitest';
import { renderTable } from '../src/output/table.js';

describe('renderTable', () => {
  it('prints useful search columns and normalized result info', () => {
    const output = renderTable('search', [
      {
        type: 'search_result',
        id: '22f754cd-0979-45ea-9da6-f14da90ea218',
        resourceType: 'shipment',
        resourceId: 'shp-123',
        score: 0.97,
        billOfLading: 'ABC123',
        shippingLineScac: 'HLCU',
        containersCount: 2,
        origin: 'Itajai',
        destination: 'Ad Dammam',
      },
    ]);

    expect(output).toContain('Match');
    expect(output).toContain('Result Type');
    expect(output).toContain('Result ID');
    expect(output).toContain('Details');
    expect(output).toContain('Score');
    expect(output).toContain('shipment');
    expect(output).toContain('shp-123');
    expect(output).toContain('ABC123');
    expect(output).toContain('SCAC HLCU');
    expect(output).toContain('2 containers');
    expect(output).toContain('Itajai -> Ad Dammam');
    expect(output).toContain('0.97');
  });

  it('reads search results from hits envelope', () => {
    const output = renderTable('search', {
      hits: [
        {
          type: 'search_result',
          id: '22f754cd-0979-45ea-9da6-f14da90ea218',
          score: 0.74,
          requestNumber: 'HAMU4017834',
        },
      ],
    });

    expect(output).toContain('HAMU4017834');
    expect(output).toContain('0.74');
  });

  it('extracts nested search fields when top-level keys are missing', () => {
    const output = renderTable('search', {
      hits: [
        {
          type: 'search_result',
          _id: 'deep-id-1',
          data: {
            referenceNumber: 'BL987654321',
            status: 'open',
            _score: 0.91,
          },
          nested: {
            attributes: {
              title: 'Container HLCUIT1251213429',
            },
          },
        },
      ],
    });

    expect(output).toContain('0.91');
    expect(output).toContain('Container HLCUIT1251213429');
    expect(output).toContain('open');
  });

  it('does not use wrapper id as result id when result type is unknown', () => {
    const output = renderTable('search', {
      hits: [
        {
          _id: 'deep-id-2',
          type: 'search_result',
          _score: 0.55,
          reference: 'CONTAINER-2',
        },
      ],
    });

    expect(output).toContain('CONTAINER-2');
    expect(output).toContain('0.55');
    expect(output).toContain('unknown');
  });

  it('supports elasticsearch-style hit envelopes', () => {
    const output = renderTable('search', {
      hits: {
        hits: [
          {
            _id: 'es-id-100',
            _score: 0.44,
            _source: {
              type: 'search_result',
              request_number: 'REQ-9001',
              container_number: 'MSC123',
              status: 'in_transit',
              title: 'REQ-9001',
            },
          },
        ],
      },
    });

    expect(output).toContain('REQ-9001');
    expect(output).toContain('0.44');
    expect(output).toContain('in_transit');
    expect(output).toContain('unknown');
  });
});
