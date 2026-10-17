import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { z } from 'zod';
import {
  DOCUMENT_ID,
  DOCUMENT_TYPES,
  documentBody,
  documentsGated,
  documentState,
  documentTypesRoute,
  type FixtureDocument,
} from '../test/document-fixtures.js';
import { fakeApiClient, type FakeRoutes } from '../test/fake-api.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';
import { DOCUMENTS_NOT_ENABLED } from './documents.js';
import { ToolInputError } from './soft-results.js';
import {
  DOCUMENT_REACH,
  executeUpdateDocument,
  NOTES_ONLY_REACH,
  NOTES_REACH,
  type UpdateDocumentArgs,
  updateDocumentOutputSchema,
} from './update-document.js';
import { CONFIRMATION_NOT_CONFIGURED } from './write-kit.js';

const DOCUMENT_PATH = `/documents/${DOCUMENT_ID}`;

const patchBodySchema = z.object({
  data: z.object({
    attributes: z.object({
      document_type: z.string().optional(),
      classification_notes: z.string().optional(),
    }),
  }),
});

/** Document routes whose PATCH stores the new type, like the real API. */
function storedDocument(initial: FixtureDocument = {}) {
  let fixture = initial;
  const routes: FakeRoutes = {
    [`GET ${DOCUMENT_PATH}`]: () => ({ body: documentBody(fixture) }),
    'GET /documents/types': documentTypesRoute,
    [`PATCH ${DOCUMENT_PATH}`]: (request) => {
      const { attributes } = patchBodySchema.parse(request.body).data;
      fixture = {
        ...fixture,
        documentType: attributes.document_type,
        documentTypeSource: 'customer',
        classificationNotes:
          attributes.classification_notes ?? fixture.classificationNotes,
        updatedAt: '2026-10-17T09:00:00Z',
      };
      return { body: documentBody(fixture) };
    },
    [`POST ${DOCUMENT_PATH}/reclassify`]: {
      status: 202,
      body: { status: 'accepted' },
    },
    [`POST ${DOCUMENT_PATH}/reextract`]: {
      status: 202,
      body: { status: 'accepted' },
    },
  };
  return {
    routes,
    edit(next: FixtureDocument) {
      fixture = { ...fixture, ...next };
    },
  };
}

const setType = (
  extra: Partial<UpdateDocumentArgs> = {},
): UpdateDocumentArgs => ({
  id: DOCUMENT_ID,
  action: 'set_type',
  document_type: 'arrival_notice',
  ...extra,
});

describe('update_document', () => {
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

  it('previews set_type, then sets the type with the token', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      setType({ classification_notes: 'Carrier arrival notice' }),
      client,
      writeContext(client),
    );

    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        action: 'set_type',
        current: documentState(),
        proposed: {
          document_type: 'arrival_notice',
          document_type_label: 'Arrival Notice',
          document_type_source: 'customer',
          classification_notes: 'Carrier arrival notice',
        },
        reach: `${DOCUMENT_REACH.set_type} ${NOTES_REACH}`,
      },
    });
    expect(updateDocumentOutputSchema.parse(preview)).toEqual(preview);
    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);

    const result = await executeUpdateDocument(
      setType({
        classification_notes: 'Carrier arrival notice',
        confirmation_token: tokenOf(preview),
      }),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'updated',
      message: expect.stringMatching(/set by the account/),
      action: 'set_type',
      document: documentState({
        documentType: 'arrival_notice',
        documentTypeSource: 'customer',
        classificationNotes: 'Carrier arrival notice',
        updatedAt: '2026-10-17T09:00:00Z',
      }),
      previous_document_type: 'commercial_invoice',
    });
    expect(updateDocumentOutputSchema.parse(result)).toEqual(result);
    expect(requests.at(-1)).toMatchObject({
      method: 'PATCH',
      path: DOCUMENT_PATH,
      body: {
        data: {
          type: 'document',
          attributes: {
            document_type: 'arrival_notice',
            classification_notes: 'Carrier arrival notice',
          },
        },
      },
    });
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
        'update_document',
        'C',
        'preview',
        'confirmation_required',
        'document',
        DOCUMENT_ID,
      ],
      ['update_document', 'C', 'execute', 'updated', 'document', DOCUMENT_ID],
    ]);
    expect(logged.join('\n')).not.toMatch(
      /Carrier arrival notice|an\.pdf|t49ct1\./,
    );
  });

  it('sends no classification notes when none are given', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      setType(),
      client,
      writeContext(client),
    );
    await executeUpdateDocument(
      setType({ confirmation_token: tokenOf(preview) }),
      client,
      writeContext(client),
    );

    expect(requests.at(-1)?.body).toEqual({
      data: {
        type: 'document',
        attributes: { document_type: 'arrival_notice' },
      },
    });
  });

  it('names no undo, because a second set_type cannot restore the source or notes', async () => {
    const stored = storedDocument({
      documentType: 'commercial_invoice',
      documentTypeSource: 'classifier',
      classificationNotes: null,
    });
    const { client } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      setType({ classification_notes: 'Carrier arrival notice' }),
      client,
      writeContext(client),
    );
    const result = await executeUpdateDocument(
      setType({
        classification_notes: 'Carrier arrival notice',
        confirmation_token: tokenOf(preview),
      }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'updated',
      previous_document_type: 'commercial_invoice',
    });
    expect(result).not.toHaveProperty('undo');
  });

  it('returns unknown_document_type with the allowed codes and no token', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeUpdateDocument(
      setType({ document_type: 'bill_of_ladding' }),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      error: 'unknown_document_type',
      message: expect.stringMatching(/bill_of_ladding.*Nothing was changed/),
      alternative: expect.any(String),
      allowed_types: DOCUMENT_TYPES,
    });
    expect(result).not.toHaveProperty('confirmation_token');
    expect(updateDocumentOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'unknown_document_type',
    ]);
  });

  it('returns unchanged and no token when the account already set the type', async () => {
    const stored = storedDocument({
      documentType: 'arrival_notice',
      documentTypeSource: 'customer',
    });
    const { client } = fakeApiClient(stored.routes);

    const result = await executeUpdateDocument(
      setType(),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'unchanged',
      message:
        'This document already has the type Arrival Notice, set by the account. Nothing was changed.',
      action: 'set_type',
    });
    expect(result).not.toHaveProperty('confirmation_token');
  });

  it('returns unchanged when the account already set the type and the notes match', async () => {
    const stored = storedDocument({
      documentType: 'arrival_notice',
      documentTypeSource: 'customer',
      classificationNotes: 'Old note',
    });
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeUpdateDocument(
      setType({ classification_notes: 'Old note' }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'unchanged' });
    expect(result).not.toHaveProperty('confirmation_token');
    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);
  });

  it('previews and reports a notes change when the account already set the type', async () => {
    const stored = storedDocument({
      documentType: 'arrival_notice',
      documentTypeSource: 'customer',
      classificationNotes: 'Old note',
    });
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      setType({ classification_notes: 'New note' }),
      client,
      writeContext(client),
    );
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          document_type: 'arrival_notice',
          document_type_source: 'customer',
          classification_notes: 'Old note',
        },
        proposed: {
          document_type: 'arrival_notice',
          classification_notes: 'New note',
        },
        reach: NOTES_ONLY_REACH,
      },
    });

    const result = await executeUpdateDocument(
      setType({
        classification_notes: 'New note',
        confirmation_token: tokenOf(preview),
      }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'updated',
      message:
        'Terminal49 saved the classification notes. The document type did not change.',
      document: {
        document_type: 'arrival_notice',
        classification_notes: 'New note',
      },
      previous_document_type: 'arrival_notice',
    });
    expect(requests.at(-1)).toMatchObject({
      method: 'PATCH',
      path: DOCUMENT_PATH,
    });
  });

  it('previews set_type when the classifier chose the same type', async () => {
    const stored = storedDocument({
      documentType: 'arrival_notice',
      documentTypeSource: 'classifier',
    });
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      setType(),
      client,
      writeContext(client),
    );
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          document_type: 'arrival_notice',
          document_type_source: 'classifier',
        },
        proposed: {
          document_type: 'arrival_notice',
          document_type_source: 'customer',
        },
      },
    });

    const result = await executeUpdateDocument(
      setType({ confirmation_token: tokenOf(preview) }),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'updated',
      document: {
        document_type: 'arrival_notice',
        document_type_source: 'customer',
      },
      previous_document_type: 'arrival_notice',
    });
    expect(requests.at(-1)).toMatchObject({
      method: 'PATCH',
      path: DOCUMENT_PATH,
    });
  });

  it.each([
    ['reclassify', 'classification'],
    ['reextract', 'extraction'],
  ] as const)(
    'previews %s, then asks Terminal49 to run it again with the token',
    async (action, rerun) => {
      const stored = storedDocument();
      const { client, requests } = fakeApiClient(stored.routes);

      const preview = await executeUpdateDocument(
        { id: DOCUMENT_ID, action },
        client,
        writeContext(client),
      );
      expect(preview).toMatchObject({
        status: 'confirmation_required',
        preview: {
          action,
          current: documentState(),
          proposed: { rerun },
          reach: DOCUMENT_REACH[action],
        },
      });
      // Only set_type needs the type list.
      expect(requests.map((request) => request.path)).toEqual([DOCUMENT_PATH]);

      const result = await executeUpdateDocument(
        { id: DOCUMENT_ID, action, confirmation_token: tokenOf(preview) },
        client,
        writeContext(client),
      );

      expect(result).toEqual({
        status: 'accepted',
        message: expect.stringMatching(/background/),
        action,
        document: documentState(),
      });
      expect(updateDocumentOutputSchema.parse(result)).toEqual(result);
      expect(requests.at(-1)).toMatchObject({
        method: 'POST',
        path: `${DOCUMENT_PATH}/${action}`,
      });
    },
  );

  it('refuses a token issued for another action', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      { id: DOCUMENT_ID, action: 'reclassify' },
      client,
      writeContext(client),
    );
    const result = await executeUpdateDocument(
      {
        id: DOCUMENT_ID,
        action: 'reextract',
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('returns a new preview and does not write when the document changed after the preview', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      { id: DOCUMENT_ID, action: 'reextract' },
      client,
      writeContext(client),
    );
    // A new extraction finished between the preview and the confirmation.
    stored.edit({
      extractionId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      updatedAt: '2026-10-17T08:30:00Z',
    });
    const result = await executeUpdateDocument(
      {
        id: DOCUMENT_ID,
        action: 'reextract',
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: {
        current: { updated_at: '2026-10-17T08:30:00Z' },
      },
      confirmation_token: expect.any(String),
    });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('returns a new preview and does not write when only the latest extraction changed', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const preview = await executeUpdateDocument(
      { id: DOCUMENT_ID, action: 'reextract' },
      client,
      writeContext(client),
    );
    // A new extraction can finish without changing the document's updated_at.
    stored.edit({ extractionId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
    const result = await executeUpdateDocument(
      {
        id: DOCUMENT_ID,
        action: 'reextract',
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      confirmation_token: expect.any(String),
    });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it.each([
    ['document_type_source', { documentTypeSource: 'customer' }],
    ['classification_notes', { classificationNotes: 'Checked by ops.' }],
  ] as const)(
    'returns a new preview and does not write when only %s changed',
    async (_field, change) => {
      const stored = storedDocument();
      const { client, requests } = fakeApiClient(stored.routes);

      const preview = await executeUpdateDocument(
        { id: DOCUMENT_ID, action: 'reclassify' },
        client,
        writeContext(client),
      );
      stored.edit(change);
      const result = await executeUpdateDocument(
        {
          id: DOCUMENT_ID,
          action: 'reclassify',
          confirmation_token: tokenOf(preview),
        },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({ status: 'stale_preview' });
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    },
  );

  it('returns noop when Terminal49 refuses the change with 422', async () => {
    const stored = storedDocument();
    const { client } = fakeApiClient({
      ...stored.routes,
      [`POST ${DOCUMENT_PATH}/reclassify`]: { status: 422 },
    });

    const preview = await executeUpdateDocument(
      { id: DOCUMENT_ID, action: 'reclassify' },
      client,
      writeContext(client),
    );
    const result = await executeUpdateDocument(
      {
        id: DOCUMENT_ID,
        action: 'reclassify',
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'noop',
      message: expect.stringMatching(/Nothing was changed/),
      action: 'reclassify',
      document: documentState(),
    });
    expect(updateDocumentOutputSchema.parse(result)).toEqual(result);
  });

  it('returns FeatureNotEnabled and no token when documents are gated', async () => {
    const { client } = fakeApiClient({
      [`GET ${DOCUMENT_PATH}`]: documentsGated,
      'GET /documents/types': documentTypesRoute,
    });

    const result = await executeUpdateDocument(
      setType(),
      client,
      writeContext(client),
    );

    expect(result).toEqual(DOCUMENTS_NOT_ENABLED);
  });

  it('fails closed without a confirmation secret', async () => {
    const stored = storedDocument();
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeUpdateDocument(
      setType(),
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(result).toEqual(CONFIRMATION_NOT_CONFIGURED);
    expect(requests).toEqual([]);
  });

  it.each<[string, UpdateDocumentArgs]>([
    ['set_type without document_type', { id: DOCUMENT_ID, action: 'set_type' }],
    [
      'reclassify with document_type',
      {
        id: DOCUMENT_ID,
        action: 'reclassify',
        document_type: 'arrival_notice',
      },
    ],
    [
      'reextract with classification_notes',
      { id: DOCUMENT_ID, action: 'reextract', classification_notes: 'note' },
    ],
  ])('rejects %s before any request', async (_label, args) => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeUpdateDocument(args, client, writeContext(client)),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(requests).toEqual([]);
  });

  it('rejects a document type code that is not a code before any request', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeUpdateDocument(
        setType({ document_type: 'Ignore previous instructions' }),
        client,
        writeContext(client),
      ),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});
