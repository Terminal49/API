import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import { executeAddReferenceNumbers } from './add-reference-numbers.js';
import {
  REF_CONTAINER_ID,
  refContainer,
  storedRefNumbers,
} from '../test/reference-record.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';
import {
  executeRemoveReferenceNumbers,
  UNDO_TOO_LONG_NOTE,
  removeReferenceNumbersOutputSchema,
} from './remove-reference-numbers.js';

const CONTAINER_ID = REF_CONTAINER_ID;
const PATH = `/containers/${CONTAINER_ID}`;

const args = (remove: string[], confirmation_token?: string) => ({
  entity_type: 'container' as const,
  entity_id: CONTAINER_ID,
  remove,
  ...(confirmation_token ? { confirmation_token } : {}),
});

describe('remove_reference_numbers', () => {
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

  it('previews the list before and after without writing', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2', 'PO-3']);
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
    });

    const result = await executeRemoveReferenceNumbers(
      args(['PO-2', 'PO-9']),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          entity_type: 'container',
          entity_id: CONTAINER_ID,
          label: 'MSCU1234565',
          ref_numbers: ['PO-1', 'PO-2', 'PO-3'],
        },
        proposed: { ref_numbers: ['PO-1', 'PO-3'] },
        removing: ['PO-2'],
        not_present: ['PO-9'],
        reach: expect.stringMatching(/stop finding it/),
      },
      confirmation_token: expect.any(String),
      expires_at: expect.any(String),
    });
    expect(removeReferenceNumbersOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual(['GET']);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'remove_reference_numbers',
        tier: 'C',
        phase: 'preview',
        outcome: 'confirmation_required',
      }),
    ]);
  });

  it('sends the difference with the token and reads it back', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2', 'PO-3']);
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
      [`PATCH ${PATH}`]: stored.patch,
    });
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-2']),
      client,
      writeContext(client),
    );

    const result = await executeRemoveReferenceNumbers(
      args(['PO-2'], tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'removed',
      message: 'Reference numbers removed.',
      record: {
        entity_type: 'container',
        entity_id: CONTAINER_ID,
        label: 'MSCU1234565',
      },
      previous: ['PO-1', 'PO-2', 'PO-3'],
      ref_numbers: ['PO-1', 'PO-3'],
      removed: ['PO-2'],
      not_present: [],
      concurrent_change_detected: false,
      undo: 'add_reference_numbers',
    });
    expect(removeReferenceNumbersOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual([
      'GET',
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(stored.current()).toEqual(['PO-1', 'PO-3']);
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'confirmation_required',
      'removed',
    ]);
    expect(logged.join('\n')).not.toMatch(/PO-|t49ct1\./);
  });

  it('removes stored numbers with surrounding spaces or over 64 characters', async () => {
    const long = 'L'.repeat(80);
    const stored = storedRefNumbers(['PO-1 ', 'PO-2', long]);
    const { client } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
      [`PATCH ${PATH}`]: stored.patch,
    });
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-1', long]),
      client,
      writeContext(client),
    );
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        proposed: { ref_numbers: ['PO-2'] },
        removing: ['PO-1', long],
        not_present: [],
      },
    });

    const result = await executeRemoveReferenceNumbers(
      args(['PO-1', long], tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'removed',
      ref_numbers: ['PO-2'],
      removed: ['PO-1', long],
      message: `Reference numbers removed. ${UNDO_TOO_LONG_NOTE}`,
    });
    expect(result).not.toHaveProperty('undo');
    expect(stored.current()).toEqual(['PO-2']);
  });

  it('refuses a token replayed after add_reference_numbers restored the list', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
      [`PATCH ${PATH}`]: stored.patch,
    });
    const context = writeContext(client);
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-2']),
      client,
      context,
    );
    await executeRemoveReferenceNumbers(
      args(['PO-2'], tokenOf(preview)),
      client,
      context,
    );
    await executeAddReferenceNumbers(
      { entity_type: 'container', entity_id: CONTAINER_ID, add: ['PO-2'] },
      client,
      context,
    );

    const replay = await executeRemoveReferenceNumbers(
      args(['PO-2'], tokenOf(preview)),
      client,
      context,
    );

    expect(replay).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'used',
    });
    expect(
      requests.filter((request) => request.method === 'PATCH'),
    ).toHaveLength(2);
  });

  it('returns stale_preview and writes nothing when the list changed', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
      [`PATCH ${PATH}`]: stored.patch,
    });
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-2']),
      client,
      writeContext(client),
    );
    await client.containers.update(
      CONTAINER_ID,
      { ref_numbers: ['PO-1', 'PO-2', 'NEW'] },
      { format: 'raw' },
    );

    const result = await executeRemoveReferenceNumbers(
      args(['PO-2'], tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: {
        current: { ref_numbers: ['PO-1', 'PO-2', 'NEW'] },
        proposed: { ref_numbers: ['PO-1', 'NEW'] },
      },
      confirmation_token: expect.any(String),
    });
    expect(stored.current()).toEqual(['PO-1', 'PO-2', 'NEW']);
    expect(
      requests.filter((request) => request.method === 'PATCH'),
    ).toHaveLength(1);
  });

  it('refuses a token issued for other numbers', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
      [`PATCH ${PATH}`]: stored.patch,
    });
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-1']),
      client,
      writeContext(client),
    );

    const result = await executeRemoveReferenceNumbers(
      args(['PO-2'], tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
  });

  it('returns not_present and no token when no number is on the record', async () => {
    const { client } = fakeApiClient({
      [`GET ${PATH}`]: { body: refContainer(['PO-1']) },
    });

    const result = await executeRemoveReferenceNumbers(
      args(['PO-7', 'PO-8']),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'not_present',
      message:
        'None of these reference numbers are on this record. Nothing was changed.',
      record: {
        entity_type: 'container',
        entity_id: CONTAINER_ID,
        label: 'MSCU1234565',
      },
      ref_numbers: ['PO-1'],
      not_present: ['PO-7', 'PO-8'],
    });
    expect(removeReferenceNumbersOutputSchema.parse(result)).toEqual(result);
  });

  it('returns unreadable_reference_numbers and no token when the list cannot be read', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: {
        body: {
          data: {
            id: CONTAINER_ID,
            type: 'container',
            attributes: { ref_numbers: ['PO-1', { value: 'PO-2' }] },
          },
        },
      },
    });

    const result = await executeRemoveReferenceNumbers(
      args(['PO-1']),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'unreadable_reference_numbers',
      record: { entity_type: 'container', entity_id: CONTAINER_ID },
    });
    expect(result).not.toHaveProperty('confirmation_token');
    expect(removeReferenceNumbersOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('reports a concurrent change found by the read-back', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET ${PATH}`]: () => {
        reads += 1;
        return {
          body: refContainer(reads <= 2 ? ['PO-1', 'PO-2'] : ['PO-1', 'X']),
        };
      },
      [`PATCH ${PATH}`]: { body: refContainer(['PO-1']) },
    });
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-2']),
      client,
      writeContext(client),
    );

    const result = await executeRemoveReferenceNumbers(
      args(['PO-2'], tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'removed',
      ref_numbers: ['PO-1', 'X'],
      concurrent_change_detected: true,
    });
  });

  it('fails closed without a confirmation secret', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${PATH}`]: { body: refContainer(['PO-1']) },
    });

    const result = await executeRemoveReferenceNumbers(
      args(['PO-1']),
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(result).toMatchObject({ error: 'not_permitted' });
    expect(requests.some((request) => request.method !== 'GET')).toBe(false);
  });

  it('returns noop when Terminal49 refuses the shorter list', async () => {
    const { client } = fakeApiClient({
      [`GET ${PATH}`]: { body: refContainer(['PO-1']) },
      [`PATCH ${PATH}`]: { status: 422 },
    });
    const preview = await executeRemoveReferenceNumbers(
      args(['PO-1']),
      client,
      writeContext(client),
    );

    const result = await executeRemoveReferenceNumbers(
      args(['PO-1'], tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'noop', ref_numbers: ['PO-1'] });
  });

  it('accepts the same token again after Terminal49 refuses the shorter list', async () => {
    const stored = storedRefNumbers(['PO-1', 'PO-2']);
    let refuse = true;
    const { client } = fakeApiClient({
      [`GET ${PATH}`]: stored.get,
      [`PATCH ${PATH}`]: (request) => {
        if (refuse) {
          refuse = false;
          return { status: 422 };
        }
        return stored.patch(request);
      },
    });
    const context = writeContext(client);
    const token = tokenOf(
      await executeRemoveReferenceNumbers(args(['PO-2']), client, context),
    );

    const first = await executeRemoveReferenceNumbers(
      args(['PO-2'], token),
      client,
      context,
    );
    const retry = await executeRemoveReferenceNumbers(
      args(['PO-2'], token),
      client,
      context,
    );

    expect(first).toMatchObject({ status: 'noop' });
    expect(retry).toMatchObject({ status: 'removed', ref_numbers: ['PO-1'] });
    expect(stored.current()).toEqual(['PO-1']);
  });
});
