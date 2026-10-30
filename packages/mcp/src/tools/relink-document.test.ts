import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import {
  DOCUMENT_ID,
  DOCUMENT_SHIPMENT_ID,
  documentBody,
  documentsGated,
  documentState,
} from '../test/document-fixtures.js';
import { fakeApiClient } from '../test/fake-api.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';
import { DOCUMENTS_NOT_ENABLED } from './documents.js';
import {
  executeRelinkDocument,
  RELINK_ACCEPTED_MESSAGE,
  RELINK_REACH,
  relinkDocumentOutputSchema,
} from './relink-document.js';

const DOCUMENT_PATH = `/documents/${DOCUMENT_ID}`;
const RELINK_ACCEPTED = { status: 202, body: { status: 'accepted' } };

describe('relink_document', () => {
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

  it('previews the current links, then relinks with the token and audits both calls', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: {
        body: documentBody({ shipmentIds: [DOCUMENT_SHIPMENT_ID] }),
      },
      [`POST ${DOCUMENT_PATH}/relink`]: RELINK_ACCEPTED,
    });
    const before = documentState({ shipmentIds: [DOCUMENT_SHIPMENT_ID] });

    const preview = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );

    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: before,
        proposed: { rerun: 'matching' },
        reach: RELINK_REACH,
      },
    });
    expect(relinkDocumentOutputSchema.parse(preview)).toEqual(preview);
    expect(requests.map((request) => request.method)).toEqual(['GET']);

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'accepted',
      message: RELINK_ACCEPTED_MESSAGE,
      document_before_relink: before,
    });
    expect(relinkDocumentOutputSchema.parse(result)).toEqual(result);
    expect(
      requests.map((request) => `${request.method} ${request.path}`),
    ).toEqual([
      `GET ${DOCUMENT_PATH}`,
      `GET ${DOCUMENT_PATH}`,
      `POST ${DOCUMENT_PATH}/relink`,
    ]);
    expect(
      auditEvents(logged).map((event) => [
        event.tool,
        event.tier,
        event.phase,
        event.outcome,
        event.entity_type,
        event.entity_id,
      ]),
    ).toEqual([
      [
        'relink_document',
        'C',
        'preview',
        'confirmation_required',
        'document',
        DOCUMENT_ID,
      ],
      ['relink_document', 'C', 'execute', 'accepted', 'document', DOCUMENT_ID],
    ]);
    expect(logged.join('\n')).not.toMatch(/an\.pdf|Arrival notice/);
  });

  it('asks again and does not relink when the links changed after the preview', async () => {
    let shipmentIds: string[] = [];
    const { client, requests } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: () => ({ body: documentBody({ shipmentIds }) }),
      [`POST ${DOCUMENT_PATH}/relink`]: RELINK_ACCEPTED,
    });

    const preview = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );
    shipmentIds = [DOCUMENT_SHIPMENT_ID];

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: {
        current: documentState({ shipmentIds: [DOCUMENT_SHIPMENT_ID] }),
      },
    });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);
  });

  it('returns noop and keeps the token usable when Terminal49 refuses the relink with 422', async () => {
    const { client } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
      [`POST ${DOCUMENT_PATH}/relink`]: { status: 422 },
    });
    const preview = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );
    const confirmed = {
      id: DOCUMENT_ID,
      confirmation_token: tokenOf(preview),
    };

    const result = await executeRelinkDocument(
      confirmed,
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'noop',
      message: expect.stringMatching(/Nothing was changed/),
      document_before_relink: documentState(),
    });
    expect(relinkDocumentOutputSchema.parse(result)).toEqual(result);
    await expect(
      executeRelinkDocument(confirmed, client, writeContext(client)),
    ).resolves.toMatchObject({ status: 'noop' });
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'confirmation_required',
      'noop',
      'noop',
    ]);
  });

  it('returns FeatureNotEnabled and no token when documents are gated', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: documentsGated,
    });

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toEqual(DOCUMENTS_NOT_ENABLED);
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('returns rate_limited with retry_after_s when the confirmed relink gets a 429', async () => {
    const { client } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
      [`POST ${DOCUMENT_PATH}/relink`]: {
        status: 429,
        headers: { 'Retry-After': '30' },
      },
    });
    const preview = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'rate_limited',
      retry_after_s: 30,
    });
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'confirmation_required',
      'rate_limited',
    ]);
  });

  it('fails closed without a confirmation secret', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
    });

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(result).toMatchObject({ error: 'not_permitted' });
    expect(requests.some((request) => request.method !== 'GET')).toBe(false);
  });

  it('rejects an id that is not a UUID before any request', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeRelinkDocument({ id: 'BL 123' }, client, writeContext(client)),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});
