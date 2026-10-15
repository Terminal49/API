import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

async function table(args: string[], document: unknown): Promise<string> {
  stubApi(() => document);
  const result = await runProgram(['--table', ...args]);
  expect(result.status).toBe(0);
  return result.stdout;
}

const customFieldResource = {
  id: 'cf-1',
  type: 'custom_field',
  attributes: {
    api_slug: 'priority',
    value: 'high',
    display_value: 'High',
    updated_at: '2026-10-01T00:00:00Z',
  },
  relationships: {
    definition: { data: { id: 'def-1', type: 'custom_field_definition' } },
  },
};

describe('table columns', () => {
  it('webhooks list shows the URL, active flag, and event count', async () => {
    const output = await table(['webhooks', 'list'], {
      data: [
        {
          id: 'wh-1',
          type: 'webhook',
          attributes: {
            url: 'https://example.com/hook',
            active: false,
            events: ['container.transport.vessel_arrived', 'shipment.created'],
            secret: 's3cret',
          },
        },
      ],
    });

    expect(output).toBe(
      [
        '┌──────┬──────────────────────────┬────────┬────────┐',
        '│ ID   │ URL                      │ Active │ Events │',
        '├──────┼──────────────────────────┼────────┼────────┤',
        '│ wh-1 │ https://example.com/hook │ false  │ 2      │',
        '└──────┴──────────────────────────┴────────┴────────┘',
        '',
      ].join('\n'),
    );
  });

  const customFieldsDocument = {
    data: [customFieldResource],
    included: [
      {
        id: 'def-1',
        type: 'custom_field_definition',
        attributes: {
          api_slug: 'priority',
          display_name: 'Priority',
          data_type: 'enum',
        },
      },
    ],
  };
  const customFieldsTable = [
    '┌──────┬──────────┬──────────┬───────┬───────────┐',
    '│ ID   │ Slug     │ Name     │ Value │ Data Type │',
    '├──────┼──────────┼──────────┼───────┼───────────┤',
    '│ cf-1 │ priority │ Priority │ High  │ enum      │',
    '└──────┴──────────┴──────────┴───────┴───────────┘',
    '',
  ].join('\n');

  it('containers custom-fields shows the slug, name, value, and type', async () => {
    const output = await table(
      ['containers', 'custom-fields', 'c-1'],
      customFieldsDocument,
    );

    expect(output).toBe(customFieldsTable);
  });

  it('shipments custom-fields --format raw reads the name and type from the included definition', async () => {
    const output = await table(
      ['--format', 'raw', 'shipments', 'custom-fields', 's-1'],
      customFieldsDocument,
    );

    expect(output).toBe(customFieldsTable);
  });

  it('custom-fields list shows the slug and value', async () => {
    const output = await table(['custom-fields', 'list'], {
      data: [customFieldResource],
    });

    expect(output).toBe(
      [
        '┌──────┬──────────┬───────┬──────────────────────┐',
        '│ ID   │ Slug     │ Value │ Updated              │',
        '├──────┼──────────┼───────┼──────────────────────┤',
        '│ cf-1 │ priority │ High  │ 2026-10-01T00:00:00Z │',
        '└──────┴──────────┴───────┴──────────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('custom-field-options list shows the label, value, and position', async () => {
    const output = await table(['custom-field-options', 'list', 'def-1'], {
      data: [
        {
          id: 'opt-1',
          type: 'custom_field_option',
          attributes: { label: 'High', value: 'high', position: 1 },
        },
      ],
    });

    expect(output).toBe(
      [
        '┌───────┬───────┬───────┬──────────┐',
        '│ ID    │ Label │ Value │ Position │',
        '├───────┼───────┼───────┼──────────┤',
        '│ opt-1 │ High  │ high  │ 1        │',
        '└───────┴───────┴───────┴──────────┘',
        '',
      ].join('\n'),
    );
  });

  it('shipments list shows the POD instead of an always-empty status', async () => {
    const output = await table(['shipments', 'list'], {
      data: [
        {
          id: 's-1',
          type: 'shipment',
          attributes: {
            bill_of_lading_number: 'BL1',
            shipping_line_scac: 'MAEU',
            customer_name: 'Acme',
            port_of_discharge_name: 'Los Angeles',
            pod_eta_at: '2026-10-20T00:00:00Z',
            line_tracking_stopped_reason: 'expired',
          },
        },
      ],
    });

    expect(output).toBe(
      [
        '┌─────┬─────┬──────┬──────────┬─────────────┬──────────────────────┬──────────────────┐',
        '│ ID  │ BOL │ SCAC │ Customer │ POD         │ POD ETA              │ Tracking Stopped │',
        '├─────┼─────┼──────┼──────────┼─────────────┼──────────────────────┼──────────────────┤',
        '│ s-1 │ BL1 │ MAEU │ Acme     │ Los Angeles │ 2026-10-20T00:00:00Z │ expired          │',
        '└─────┴─────┴──────┴──────────┴─────────────┴──────────────────────┴──────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('--fields picks the table columns instead of the command defaults', async () => {
    const output = await table(
      ['shipments', 'list', '--fields', 'id,billOfLading'],
      {
        data: [
          {
            id: 's-1',
            type: 'shipment',
            attributes: {
              bill_of_lading_number: 'BL1',
              shipping_line_scac: 'MAEU',
              customer_name: 'Acme',
            },
          },
        ],
      },
    );

    expect(output).toBe(
      [
        '┌─────┬──────────────┐',
        '│ id  │ billOfLading │',
        '├─────┼──────────────┤',
        '│ s-1 │ BL1          │',
        '└─────┴──────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('--fields keeps nested paths as columns for raw custom field options', async () => {
    const output = await table(
      [
        'custom-field-options',
        'list',
        'def-1',
        '--fields',
        'id,attributes.label',
      ],
      {
        data: [
          {
            id: 'opt-1',
            type: 'custom_field_option',
            attributes: { label: 'High', value: 'high', position: 1 },
          },
        ],
      },
    );

    expect(output).toBe(
      [
        '┌───────┬──────────────────┐',
        '│ id    │ attributes.label │',
        '├───────┼──────────────────┤',
        '│ opt-1 │ High             │',
        '└───────┴──────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('--fields on containers route prints one row per port', async () => {
    const output = await table(
      ['--fields', 'ports.name', 'containers', 'route', 'c-1'],
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [100.88, 13.08] },
            properties: {
              feature_type: 'port',
              name: 'Laem Chabang',
              location_type: 'port_of_lading',
            },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-81.1, 32.1] },
            properties: {
              feature_type: 'port',
              name: 'Savannah',
              location_type: 'port_of_discharge',
            },
          },
        ],
      },
    );

    expect(output).toBe(
      [
        '┌──────────────┐',
        '│ ports.name   │',
        '├──────────────┤',
        '│ Laem Chabang │',
        '├──────────────┤',
        '│ Savannah     │',
        '└──────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('--fields on vessels future-positions prints one row per position', async () => {
    const output = await table(
      [
        '--fields',
        'positions.timestamp,positions.latitude',
        'vessels',
        'future-positions',
        'v-1',
        '--port-id',
        'p-2',
        '--previous-port-id',
        'p-1',
      ],
      {
        data: {
          id: 'v-1',
          type: 'vessel',
          attributes: {
            name: 'EVER GIVEN',
            positions: [
              {
                latitude: 13.07,
                longitude: -100.84,
                timestamp: '2026-10-15T00:00:00Z',
              },
              {
                latitude: 14.1,
                longitude: -101.2,
                timestamp: '2026-10-16T00:00:00Z',
              },
            ],
          },
        },
      },
    );

    expect(output).toBe(
      [
        '┌──────────────────────┬────────────────────┐',
        '│ positions.timestamp  │ positions.latitude │',
        '├──────────────────────┼────────────────────┤',
        '│ 2026-10-15T00:00:00Z │ 13.07              │',
        '├──────────────────────┼────────────────────┤',
        '│ 2026-10-16T00:00:00Z │ 14.1               │',
        '└──────────────────────┴────────────────────┘',
        '',
      ].join('\n'),
    );
  });

  const shipmentsDocument = {
    data: [
      {
        id: 's-1',
        type: 'shipment',
        attributes: { bill_of_lading_number: 'BL1' },
      },
      {
        id: 's-2',
        type: 'shipment',
        attributes: { bill_of_lading_number: 'BL2' },
      },
    ],
    links: {},
    meta: {},
  };

  it('--format both prints the default columns from the mapped rows', async () => {
    const output = await table(
      ['--format', 'both', 'shipments', 'list'],
      shipmentsDocument,
    );

    expect(output).toBe(
      [
        '┌─────┬─────┬──────┬──────────┬─────┬─────────┬──────────────────┐',
        '│ ID  │ BOL │ SCAC │ Customer │ POD │ POD ETA │ Tracking Stopped │',
        '├─────┼─────┼──────┼──────────┼─────┼─────────┼──────────────────┤',
        '│ s-1 │ BL1 │      │          │     │         │                  │',
        '├─────┼─────┼──────┼──────────┼─────┼─────────┼──────────────────┤',
        '│ s-2 │ BL2 │      │          │     │         │                  │',
        '└─────┴─────┴──────┴──────────┴─────┴─────────┴──────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('--format both --fields mapped.id prints one row per mapped row', async () => {
    const output = await table(
      [
        '--format',
        'both',
        '--fields',
        'mapped.id,mapped.billOfLading',
        'shipments',
        'list',
      ],
      shipmentsDocument,
    );

    expect(output).toBe(
      [
        '┌───────────┬─────────────────────┐',
        '│ mapped.id │ mapped.billOfLading │',
        '├───────────┼─────────────────────┤',
        '│ s-1       │ BL1                 │',
        '├───────────┼─────────────────────┤',
        '│ s-2       │ BL2                 │',
        '└───────────┴─────────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('--fields that match nothing print no rows', async () => {
    const output = await table(
      ['--format', 'both', '--fields', 'id', 'shipments', 'list'],
      shipmentsDocument,
    );

    expect(output).toBe('No rows.\n');
  });

  it('--format raw --fields names each column by the path as typed', async () => {
    const output = await table(
      [
        '--format',
        'raw',
        '--fields',
        'data.id,data.attributes.bill_of_lading_number',
        'shipments',
        'list',
      ],
      shipmentsDocument,
    );

    expect(output).toBe(
      [
        '┌─────────┬───────────────────────────────────────┐',
        '│ data.id │ data.attributes.bill_of_lading_number │',
        '├─────────┼───────────────────────────────────────┤',
        '│ s-1     │ BL1                                   │',
        '├─────────┼───────────────────────────────────────┤',
        '│ s-2     │ BL2                                   │',
        '└─────────┴───────────────────────────────────────┘',
        '',
      ].join('\n'),
    );
  });
});
