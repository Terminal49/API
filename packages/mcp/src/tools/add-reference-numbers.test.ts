import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  REF_CONTAINER_ID,
  refContainer,
  storedRefNumbers,
} from '../test/reference-record.js';
import { auditEvents, writeContext } from '../test/write-context.js';
import {
  addReferenceNumbersOutputSchema,
  executeAddReferenceNumbers,
} from './add-reference-numbers.js';
import { READ_BACK_NOTE } from './reference-numbers.js';

const CONTAINER_ID = REF_CONTAINER_ID;
const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';
const container = refContainer;

describe('add_reference_numbers', () => {
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

  it('sends the union of the current and new numbers and reads it back', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    const { client, requests } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: stored.get,
      [`PATCH /containers/${CONTAINER_ID}`]: stored.patch,
    });

    const result = await executeAddReferenceNumbers(
      {
        entity_type: 'container',
        entity_id: CONTAINER_ID,
        add: ['PO-2', ' PO-3 ', 'PO-3'],
      },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'added',
      message: 'Reference numbers added.',
      record: {
        entity_type: 'container',
        entity_id: CONTAINER_ID,
        label: 'MSCU1234565',
      },
      previous: ['PO-1', 'PO-2'],
      ref_numbers: ['PO-1', 'PO-2', 'PO-3'],
      added: ['PO-3'],
      already_present: ['PO-2'],
      concurrent_change_detected: false,
      undo: 'remove_reference_numbers',
    });
    expect(addReferenceNumbersOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(requests[1]?.body).toEqual({
      data: {
        type: 'container',
        id: CONTAINER_ID,
        attributes: { ref_numbers: ['PO-1', 'PO-2', 'PO-3'] },
      },
    });
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'add_reference_numbers',
        tier: 'A',
        phase: 'execute',
        outcome: 'added',
        entity_type: 'container',
        entity_id: CONTAINER_ID,
      }),
    ]);
    expect(logged.join('\n')).not.toMatch(/PO-/);
  });

  it('changes nothing when every number is already there', async () => {
    const stored = storedRefNumbers(['PO-1']);
    const { client, requests } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: stored.get,
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-1'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_present',
      previous: ['PO-1'],
      ref_numbers: ['PO-1'],
      added: [],
      already_present: ['PO-1'],
      concurrent_change_detected: false,
    });
    expect(result).not.toHaveProperty('undo');
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('treats a stored number with surrounding spaces as already there', async () => {
    const stored = storedRefNumbers([' PO-1 ']);
    const { client, requests } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: stored.get,
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-1'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_present',
      ref_numbers: [' PO-1 '],
      added: [],
      already_present: ['PO-1'],
    });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('converges: a repeated call returns already_present', async () => {
    const stored = storedRefNumbers([]);
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: stored.get,
      [`PATCH /containers/${CONTAINER_ID}`]: stored.patch,
    });
    const args = {
      entity_type: 'container' as const,
      entity_id: CONTAINER_ID,
      add: ['PO-9'],
    };

    const first = await executeAddReferenceNumbers(
      args,
      client,
      writeContext(client),
    );
    const second = await executeAddReferenceNumbers(
      args,
      client,
      writeContext(client),
    );

    expect(first).toMatchObject({ status: 'added', ref_numbers: ['PO-9'] });
    expect(second).toMatchObject({
      status: 'already_present',
      ref_numbers: ['PO-9'],
    });
  });

  it('reports a concurrent change when the list read back differs', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: () => {
        reads += 1;
        return {
          body: container(reads === 1 ? ['PO-1'] : ['PO-1', 'PO-2', 'OTHER']),
        };
      },
      [`PATCH /containers/${CONTAINER_ID}`]: {
        body: container(['PO-1', 'PO-2']),
      },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-2'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'added',
      previous: ['PO-1'],
      ref_numbers: ['PO-1', 'PO-2', 'OTHER'],
      concurrent_change_detected: true,
    });
    expect(result).toHaveProperty(
      'message',
      expect.stringMatching(/someone else changed/),
    );
  });

  it('reports the sent list when the read-back fails after the write', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: () => {
        reads += 1;
        return reads === 1 ? { body: container([]) } : { status: 429 };
      },
      [`PATCH /containers/${CONTAINER_ID}`]: { body: container(['PO-1']) },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-1'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'added',
      ref_numbers: ['PO-1'],
      concurrent_change_detected: null,
      read_back_note: READ_BACK_NOTE,
    });
  });

  it.each([
    [
      'shipment',
      SHIPMENT_ID,
      `/shipments/${SHIPMENT_ID}`,
      { bill_of_lading_number: 'MAEU123456789' },
      'MAEU123456789',
    ],
    [
      'tracking_request',
      REQUEST_ID,
      `/tracking_requests/${REQUEST_ID}`,
      { request_number: 'MAEU123456780' },
      'MAEU123456780',
    ],
  ] as const)(
    'patches ref_numbers on a %s',
    async (entityType, id, path, labelAttributes, label) => {
      const body = (refNumbers: string[]) => ({
        data: {
          id,
          type: entityType,
          attributes: { ...labelAttributes, ref_numbers: refNumbers },
        },
      });
      const stored = storedRefNumbers(['A'], body);
      const { client, requests } = fakeApiClient({
        [`GET ${path}`]: stored.get,
        [`PATCH ${path}`]: stored.patch,
      });

      const result = await executeAddReferenceNumbers(
        { entity_type: entityType, entity_id: id, add: ['B'] },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({
        status: 'added',
        record: { entity_type: entityType, entity_id: id, label },
        ref_numbers: ['A', 'B'],
      });
      expect(requests[0]?.query.get('include')).toBeNull();
      expect(requests[1]).toMatchObject({
        method: 'PATCH',
        body: {
          data: { attributes: { ref_numbers: ['A', 'B'] } },
        },
      });
    },
  );

  it('keeps every number on a shipment whose list has a null entry', async () => {
    const path = `/shipments/${SHIPMENT_ID}`;
    const { client, requests } = fakeApiClient({
      [`GET ${path}`]: {
        body: {
          data: {
            id: SHIPMENT_ID,
            type: 'shipment',
            attributes: { ref_numbers: ['PO-1', null, 'PO-2'] },
          },
        },
      },
      [`PATCH ${path}`]: { body: {} },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'shipment', entity_id: SHIPMENT_ID, add: ['PO-3'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'added',
      previous: ['PO-1', 'PO-2'],
    });
    expect(requests[1]).toMatchObject({
      method: 'PATCH',
      body: { data: { attributes: { ref_numbers: ['PO-1', 'PO-2', 'PO-3'] } } },
    });
  });

  it.each([
    ['an entry that is not a string', { ref_numbers: ['PO-1', 42] }],
    ['a list that is not an array', { ref_numbers: 'PO-1' }],
    ['no ref_numbers attribute', { number: 'MSCU1234565' }],
  ])('writes nothing when the record has %s', async (_case, attributes) => {
    const { client, requests } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: {
        body: { data: { id: CONTAINER_ID, type: 'container', attributes } },
      },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-3'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'unreadable_reference_numbers',
      message: expect.stringMatching(/Nothing was changed/),
      record: { entity_type: 'container', entity_id: CONTAINER_ID },
    });
    expect(addReferenceNumbersOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual(['GET']);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'unreadable_reference_numbers' }),
    ]);
  });

  it('reports the sent list when the list read back cannot be read', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: () => {
        reads += 1;
        return {
          body:
            reads === 1
              ? container([])
              : {
                  data: {
                    id: CONTAINER_ID,
                    type: 'container',
                    attributes: { ref_numbers: [7] },
                  },
                },
        };
      },
      [`PATCH /containers/${CONTAINER_ID}`]: { body: {} },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-1'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'added',
      ref_numbers: ['PO-1'],
      concurrent_change_detected: null,
      read_back_note: READ_BACK_NOTE,
    });
  });

  it('returns noop when Terminal49 refuses the list', async () => {
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: { body: container([]) },
      [`PATCH /containers/${CONTAINER_ID}`]: { status: 422 },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-1'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'noop', previous: [] });
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'noop' }),
    ]);
  });

  it('returns rate_limited when the first read is limited', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: {
        status: 429,
        headers: { 'Retry-After': '7' },
      },
    });

    const result = await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-1'] },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ error: 'rate_limited', retry_after_s: 7 });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('rejects an empty list, a long value and extra keys', async () => {
    const { client } = fakeApiClient({});
    const context = writeContext(client);

    for (const args of [
      { entity_type: 'container', entity_id: CONTAINER_ID, add: [] },
      {
        entity_type: 'container',
        entity_id: CONTAINER_ID,
        add: ['x'.repeat(65)],
      },
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['  '] },
      {
        entity_type: 'container',
        entity_id: CONTAINER_ID,
        add: ['PO-1'],
        replace: true,
      },
      { entity_type: 'party', entity_id: CONTAINER_ID, add: ['PO-1'] },
    ]) {
      await expect(
        // @ts-expect-error each case breaks the input schema
        executeAddReferenceNumbers(args, client, context),
      ).rejects.toThrow();
    }
  });
});
