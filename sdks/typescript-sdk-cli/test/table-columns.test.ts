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
});
