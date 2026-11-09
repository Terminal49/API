import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient, type FakeRequest } from '../test/fake-api.js';
import {
  REF_CONTAINER_ID,
  refContainer,
  storedRefNumbers,
} from '../test/reference-record.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';
import {
  executeUpdateRecord,
  updateRecordInputSchema,
  updateRecordOutputSchema,
} from './update-record.js';

const CONTAINER = `/containers/${REF_CONTAINER_ID}`;
const SHIPMENT_ID = '7b1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SHIPMENT = `/shipments/${SHIPMENT_ID}`;

const container = (
  ref_numbers: { add?: string[]; remove?: string[] },
  confirmation_token?: string,
) => ({
  entity_type: 'container' as const,
  entity_id: REF_CONTAINER_ID,
  ref_numbers,
  ...(confirmation_token ? { confirmation_token } : {}),
});

/** A shipment whose ref_numbers and tags follow every PATCH, like the API. */
function storedShipment(initial: { ref_numbers: string[]; tags: string[] }) {
  let lists = initial;
  const body = () => ({
    data: {
      id: SHIPMENT_ID,
      type: 'shipment',
      attributes: { bill_of_lading_number: 'MEDU1234567', ...lists },
    },
  });
  return {
    get: () => ({ body: body() }),
    patch: (request: FakeRequest) => {
      const attributes = (
        request.body as { data: { attributes: Partial<typeof lists> } }
      ).data.attributes;
      lists = { ...lists, ...attributes };
      return { body: body() };
    },
    current: () => lists,
  };
}

describe('update_record', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds reference numbers at once and keeps the ones already there', async () => {
    const stored = storedRefNumbers(['PO-1']);
    const { client } = fakeApiClient({
      [`GET ${CONTAINER}`]: stored.get,
      [`PATCH ${CONTAINER}`]: stored.patch,
    });

    const result = await executeUpdateRecord(
      container({ add: ['PO-2', 'PO-1'] }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'updated',
      previous: { ref_numbers: ['PO-1'] },
      current: { ref_numbers: ['PO-1', 'PO-2'] },
      changes: {
        ref_numbers: {
          adding: ['PO-2'],
          removing: [],
          already_present: ['PO-1'],
          not_present: [],
        },
      },
      concurrent_change_detected: false,
    });
    expect(updateRecordOutputSchema.parse(result)).toEqual(result);
    expect(stored.current()).toEqual(['PO-1', 'PO-2']);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'update_record',
        phase: 'execute',
        outcome: 'updated',
      }),
    ]);
  });

  it('changes nothing when every value is already in place', async () => {
    const stored = storedRefNumbers(['PO-1']);
    const { client, requests } = fakeApiClient({
      [`GET ${CONTAINER}`]: stored.get,
    });

    const result = await executeUpdateRecord(
      container({ add: ['PO-1'], remove: ['PO-9'] }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'unchanged',
      changes: {
        ref_numbers: { already_present: ['PO-1'], not_present: ['PO-9'] },
      },
    });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('previews a removal, then writes it with the token', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    const { client } = fakeApiClient({
      [`GET ${CONTAINER}`]: stored.get,
      [`PATCH ${CONTAINER}`]: stored.patch,
    });
    const context = writeContext(client);

    const preview = await executeUpdateRecord(
      container({ add: ['PO-3'], remove: ['PO-2'] }),
      client,
      context,
    );
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: { ref_numbers: ['PO-1', 'PO-2'] },
        proposed: { ref_numbers: ['PO-1', 'PO-3'] },
        changes: {
          ref_numbers: { adding: ['PO-3'], removing: ['PO-2'] },
        },
        reach: expect.stringMatching(/stop finding it/),
      },
    });
    expect(stored.current()).toEqual(['PO-1', 'PO-2']);

    const done = await executeUpdateRecord(
      container({ add: ['PO-3'], remove: ['PO-2'] }, tokenOf(preview)),
      client,
      context,
    );
    expect(done).toMatchObject({
      status: 'updated',
      current: { ref_numbers: ['PO-1', 'PO-3'] },
    });
    expect(stored.current()).toEqual(['PO-1', 'PO-3']);
  });

  it('returns stale_preview and writes nothing when the list changed', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    const { client, requests } = fakeApiClient({
      [`GET ${CONTAINER}`]: stored.get,
      [`PATCH ${CONTAINER}`]: stored.patch,
    });
    const context = writeContext(client);

    const preview = await executeUpdateRecord(
      container({ remove: ['PO-2'] }),
      client,
      context,
    );
    await executeUpdateRecord(container({ add: ['PO-4'] }), client, context);
    const patches = requests.filter((r) => r.method === 'PATCH').length;

    const stale = await executeUpdateRecord(
      container({ remove: ['PO-2'] }, tokenOf(preview)),
      client,
      context,
    );

    expect(stale).toMatchObject({ status: 'stale_preview' });
    expect(requests.filter((r) => r.method === 'PATCH').length).toBe(patches);
    expect(stored.current()).toEqual(['PO-1', 'PO-2', 'PO-4']);
  });

  it('adds and removes shipment tags alongside reference numbers', async () => {
    const stored = storedShipment({ ref_numbers: ['PO-1'], tags: ['hot'] });
    const { client } = fakeApiClient({
      [`GET ${SHIPMENT}`]: stored.get,
      [`PATCH ${SHIPMENT}`]: stored.patch,
    });
    const context = writeContext(client);
    const args = {
      entity_type: 'shipment' as const,
      entity_id: SHIPMENT_ID,
      ref_numbers: { add: ['PO-2'] },
      tags: { add: ['priority'], remove: ['hot'] },
    };

    const preview = await executeUpdateRecord(args, client, context);
    const done = await executeUpdateRecord(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      context,
    );

    expect(done).toMatchObject({
      status: 'updated',
      record: { label: 'MEDU1234567' },
      previous: { ref_numbers: ['PO-1'], tags: ['hot'] },
      current: { ref_numbers: ['PO-1', 'PO-2'], tags: ['priority'] },
    });
    expect(stored.current()).toEqual({
      ref_numbers: ['PO-1', 'PO-2'],
      tags: ['priority'],
    });
  });

  it('writes nothing when the record has a list it cannot read', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${CONTAINER}`]: {
        body: {
          data: {
            id: REF_CONTAINER_ID,
            type: 'container',
            attributes: { number: 'MSCU1234565', ref_numbers: 'PO-1' },
          },
        },
      },
    });

    const result = await executeUpdateRecord(
      container({ add: ['PO-2'] }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'unreadable_list',
      field: 'ref_numbers',
    });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('returns noop when Terminal49 refuses the list', async () => {
    const { client } = fakeApiClient({
      [`GET ${CONTAINER}`]: { body: refContainer([]) },
      [`PATCH ${CONTAINER}`]: { status: 422, body: { errors: [] } },
    });

    const result = await executeUpdateRecord(
      container({ add: ['PO-1'] }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'noop',
      current: { ref_numbers: [] },
    });
  });

  it('rejects tags on a container, an empty change, and extra keys', () => {
    expect(
      updateRecordInputSchema.safeParse({
        entity_type: 'container',
        entity_id: REF_CONTAINER_ID,
        tags: { add: ['hot'] },
      }).success,
    ).toBe(false);
    expect(
      updateRecordInputSchema.safeParse({
        entity_type: 'shipment',
        entity_id: SHIPMENT_ID,
        ref_numbers: { add: [] },
      }).success,
    ).toBe(false);
    expect(
      updateRecordInputSchema.safeParse({
        ...container({ add: ['PO-1'] }),
        extra: true,
      }).success,
    ).toBe(false);
  });
});
