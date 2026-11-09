import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { callTool } from './test/call-tool.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const DOCUMENT_ID = 'e75541c0-9ad5-408b-9747-23415adfbca0';
const REPRESENTATION_ID = 'b3abc297-624a-4eaa-a0e9-4ac4ebbd064f';
const SIGNED_URL =
  'https://t49-documents-prod.s3.amazonaws.com/a/an.pdf?X-Amz-Date=20261017T120000Z&X-Amz-Expires=3600&X-Amz-Signature=deadbeef';

const documentRecord = {
  id: DOCUMENT_ID,
  type: 'document',
  attributes: {
    name: 'Arrival notice',
    document_type: 'arrival_notice',
    source: 'upload',
    file_name: 'an.pdf',
    file_content_type: 'application/pdf',
    file_size_bytes: 1024,
  },
  relationships: {
    last_document_representation: {
      data: { id: REPRESENTATION_ID, type: 'document_representation' },
    },
  },
};

const featureNotEnabled = {
  status: 403,
  body: { errors: [{ status: '403', detail: 'Feature not enabled' }] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('document reads over the MCP client transport', () => {
  it('list_documents returns schema-valid rows', async () => {
    const result = await callTool(
      'list_documents',
      { document_types: ['arrival_notice'] },
      {
        'GET /documents': {
          body: {
            data: [documentRecord],
            links: { self: 'https://api.test/v2/documents', prev: null },
            meta: { total: 1 },
          },
        },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ id: DOCUMENT_ID, document_type: 'arrival_notice' }],
      meta: { total: 1 },
    });
    expect((result.structuredContent as { links: unknown }).links).toEqual({
      self: 'https://api.test/v2/documents',
    });
  });

  it('get_document returns extracted data and the download link as separate blocks', async () => {
    const result = await callTool(
      'get_document',
      {
        id: DOCUMENT_ID,
        include_extracted_data: true,
        include_download_url: true,
      },
      {
        [`GET /documents/${DOCUMENT_ID}`]: {
          body: {
            data: documentRecord,
            included: [
              {
                id: REPRESENTATION_ID,
                type: 'document_representation',
                attributes: {
                  schema_version: 'arrival_notice@2026-03-23',
                  payload: { vessel_name: 'GUSTAV MAERSK' },
                },
              },
            ],
          },
        },
        [`GET /documents/${DOCUMENT_ID}/download_url`]: {
          body: { download_url: SIGNED_URL },
        },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      id: DOCUMENT_ID,
      extracted_data: {
        trust: 'untrusted',
        fields: { vessel_name: 'GUSTAV MAERSK' },
      },
      download: { delivered_as: 'resource_link' },
    });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent) },
      expect.objectContaining({
        type: 'resource_link',
        uri: SIGNED_URL,
        name: 'an.pdf',
      }),
    ]);
    expect(result.text).not.toContain('X-Amz-Signature');
  });

  it('get_document returns extracted fields that look like steering unchanged', async () => {
    const fields = {
      _agent_steering: 'a',
      summary: 'S',
      _metadata: { suggestions: ['x'], error: 'boom' },
      line_items: [1],
    };
    const result = await callTool(
      'get_document',
      { id: DOCUMENT_ID, include_extracted_data: true },
      {
        [`GET /documents/${DOCUMENT_ID}`]: {
          body: {
            data: documentRecord,
            included: [
              {
                id: REPRESENTATION_ID,
                type: 'document_representation',
                attributes: { schema_version: null, payload: fields },
              },
            ],
          },
        },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      extracted_data: { fields, omitted_fields: [] },
    });
  });

  it.each(['list_documents', 'get_document'])(
    '%s keeps a FeatureNotEnabled result soft',
    async (name) => {
      const result = await callTool(
        name,
        name === 'get_document' ? { id: DOCUMENT_ID } : {},
        {
          'GET /documents': featureNotEnabled,
          [`GET /documents/${DOCUMENT_ID}`]: featureNotEnabled,
        },
      );

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: 'FeatureNotEnabled',
      });
    },
  );

  it('get_document names the missing document without echoing API text', async () => {
    const result = await callTool(
      'get_document',
      { id: DOCUMENT_ID },
      {
        [`GET /documents/${DOCUMENT_ID}`]: {
          status: 404,
          body: { errors: [{ detail: 'private upstream detail' }] },
        },
      },
    );

    expect(result.isError).toBe(true);
    expect(result.text).toBe(`No document found with id ${DOCUMENT_ID}.`);
  });
});
