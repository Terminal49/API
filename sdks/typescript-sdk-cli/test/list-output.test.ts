import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

const document = {
  data: [
    {
      id: 'row-1',
      type: 'shipment',
      attributes: { bill_of_lading_number: 'BL1', scac: 'MSCU' },
      relationships: {
        containers: { data: [{ id: 'inc-1', type: 'container' }] },
      },
    },
  ],
  included: [
    { id: 'inc-1', type: 'container', attributes: { number: 'MSCU1234567' } },
  ],
  links: { self: 'https://api.test/v2/x?page[number]=1' },
  meta: { total: 1 },
};

/** The request path each list command sends, and the rows it prints in the mapped format for `document`. */
const listCommands: Array<[string[], string, unknown[]]> = [
  [
    ['containers', 'list'],
    '/v2/containers',
    [
      {
        id: 'row-1',
        billOfLadingNumber: 'BL1',
        scac: 'MSCU',
        equipment: {},
        location: {},
        demurrage: {},
        terminals: { podTerminal: null, destinationTerminal: null },
        rail: {},
        events: [],
        shipment: null,
      },
    ],
  ],
  [
    ['shipments', 'list'],
    '/v2/shipments',
    [
      {
        id: 'row-1',
        billOfLading: 'BL1',
        containers: [{ id: 'inc-1', number: 'MSCU1234567' }],
        billOfLadingNumber: 'BL1',
        scac: 'MSCU',
        vesselAtPod: {},
        ports: { portOfLading: null, portOfDischarge: null, destination: null },
        tracking: {},
      },
    ],
  ],
  [
    ['tracking-requests', 'list'],
    '/v2/tracking_requests',
    [{ id: 'row-1', scac: 'MSCU', shipment: null, billOfLadingNumber: 'BL1' }],
  ],
  [['parties', 'list'], '/v2/parties', document.data],
  [['custom-fields', 'list'], '/v2/custom_fields', document.data],
  [
    ['custom-field-definitions', 'list'],
    '/v2/accounts/current/custom_field_definitions',
    document.data,
  ],
  [
    ['custom-field-options', 'list', 'def-1'],
    '/v2/custom_field_definitions/def-1/options',
    document.data,
  ],
  [['webhooks', 'list'], '/v2/webhooks', document.data],
  [
    ['webhook-notifications', 'list'],
    '/v2/webhook_notifications',
    document.data,
  ],
  [
    ['shipping-lines', 'list'],
    '/v2/shipping_lines',
    [{ scac: 'MSCU', name: 'MSCU' }],
  ],
];

const pagination = { links: document.links, meta: document.meta };

describe('list output', () => {
  it.each(listCommands)(
    '%s --format raw prints the whole JSON:API document',
    async (command) => {
      stubApi(() => document);

      const result = await runProgram([
        '--json',
        '--format',
        'raw',
        ...command,
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: true,
        command: `${command[0]}.list`,
        data: document,
        pagination,
      });
    },
  );

  it.each(listCommands)(
    '%s prints the mapped rows by default',
    async (command, path, rows) => {
      const requests = stubApi(() => document);

      const result = await runProgram(['--json', ...command]);

      expect(result.status).toBe(0);
      expect(requests.map(({ url }) => url.pathname)).toEqual([path]);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: true,
        command: `${command[0]}.list`,
        data: rows,
        ...(command[0] === 'shipping-lines' ? {} : { pagination }),
      });
    },
  );

  it.each(listCommands)(
    '%s --format both pairs the whole document with the mapped rows',
    async (command, _path, rows) => {
      stubApi(() => document);

      const result = await runProgram([
        '--json',
        '--format',
        'both',
        ...command,
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: true,
        command: `${command[0]}.list`,
        data: { raw: document, mapped: rows },
        pagination,
      });
    },
  );
});

describe('shipping-lines list --search', () => {
  it('fetches every line and keeps the matches', async () => {
    const line = (scac: string, name: string) => ({
      id: scac,
      type: 'shipping_line',
      attributes: { scac, name, short_name: null, alternative_scacs: [] },
    });
    const requests = stubApi(() => ({
      data: [line('HLCU', 'Hapag-Lloyd'), line('MAEU', 'Maersk')],
    }));

    const result = await runProgram([
      '--json',
      'shipping-lines',
      'list',
      '--search',
      'HAPAG',
    ]);

    expect(result.status).toBe(0);
    expect(requests.map(({ url }) => url.href)).toEqual([
      'https://api.test/v2/shipping_lines',
    ]);
    expect(JSON.parse(result.stdout).data).toEqual([
      { scac: 'HLCU', name: 'Hapag-Lloyd', alternativeScacs: [] },
    ]);
  });
});
