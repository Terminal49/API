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
import { auditEvents, writeContext } from '../test/write-context.js';
import { DOCUMENTS_NOT_ENABLED } from './documents.js';
import {
  executeRelinkDocument,
  RELINK_ACCEPTED_MESSAGE,
  relinkDocumentOutputSchema,
} from './relink-document.js';

const DOCUMENT_PATH = `/documents/${DOCUMENT_ID}`;

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

  it('reads the document, asks Terminal49 to relink it and audits the call', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: {
        body: documentBody({ shipmentIds: [DOCUMENT_SHIPMENT_ID] }),
      },
      [`POST ${DOCUMENT_PATH}/relink`]: {
        status: 202,
        body: { status: 'accepted' },
      },
    });

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'accepted',
      message: RELINK_ACCEPTED_MESSAGE,
      document_before_relink: documentState({
        shipmentIds: [DOCUMENT_SHIPMENT_ID],
      }),
    });
    expect(relinkDocumentOutputSchema.parse(result)).toEqual(result);
    expect(
      requests.map((request) => `${request.method} ${request.path}`),
    ).toEqual([`GET ${DOCUMENT_PATH}`, `POST ${DOCUMENT_PATH}/relink`]);
    expect(requests[0]?.query.get('include')).toBeNull();
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'relink_document',
        tier: 'A',
        phase: 'execute',
        outcome: 'accepted',
        entity_type: 'document',
        entity_id: DOCUMENT_ID,
      }),
    ]);
    expect(logged.join('\n')).not.toMatch(/an\.pdf|Arrival notice/);
  });

  it('returns noop when Terminal49 refuses the relink with 422', async () => {
    const { client } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
      [`POST ${DOCUMENT_PATH}/relink`]: { status: 422 },
    });

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'noop',
      message: expect.stringMatching(/Nothing was changed/),
      document_before_relink: documentState(),
    });
    expect(relinkDocumentOutputSchema.parse(result)).toEqual(result);
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual(['noop']);
  });

  it('returns FeatureNotEnabled without relinking when documents are gated', async () => {
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

  it('returns rate_limited with retry_after_s on a 429', async () => {
    const { client } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
      [`POST ${DOCUMENT_PATH}/relink`]: {
        status: 429,
        headers: { 'Retry-After': '30' },
      },
    });

    const result = await executeRelinkDocument(
      { id: DOCUMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'rate_limited',
      retry_after_s: 30,
    });
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'rate_limited',
    ]);
  });

  it('rejects an id that is not a UUID before any request', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeRelinkDocument({ id: 'BL 123' }, client, writeContext(client)),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});
