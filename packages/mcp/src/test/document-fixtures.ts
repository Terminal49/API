import type { FakeResponse } from './fake-api.js';

export const DOCUMENT_ID = 'e75541c0-9ad5-408b-9747-23415adfbca0';
export const DOCUMENT_SHIPMENT_ID = '3f7c9e2a-1b4d-4c8e-9a6f-2d5b8e1c7a90';
export const EXTRACTION_ID = '9d4e2b1a-6c3f-4a8e-b7d5-0e1f2a3b4c5d';

export interface FixtureDocument {
  documentType?: string | null;
  documentTypeSource?: string | null;
  classificationNotes?: string | null;
  extractionId?: string | null;
  shipmentIds?: string[];
  updatedAt?: string;
}

/** A raw GET or PATCH /documents/{id} body. */
export function documentBody(fixture: FixtureDocument = {}) {
  const extractionId =
    fixture.extractionId === undefined ? EXTRACTION_ID : fixture.extractionId;
  return {
    data: {
      id: DOCUMENT_ID,
      type: 'document',
      attributes: {
        name: 'Arrival notice',
        document_type:
          fixture.documentType === undefined
            ? 'commercial_invoice'
            : fixture.documentType,
        document_type_source:
          fixture.documentTypeSource === undefined
            ? 'classifier'
            : fixture.documentTypeSource,
        classification_notes: fixture.classificationNotes ?? null,
        source: 'email',
        file_name: 'an.pdf',
        file_content_type: 'application/pdf',
        file_size_bytes: 52_000,
        parsed: null,
        created_at: '2026-10-15T10:00:00Z',
        updated_at: fixture.updatedAt ?? '2026-10-15T10:05:00Z',
      },
      relationships: {
        shipments: {
          data: (fixture.shipmentIds ?? []).map((id) => ({
            id,
            type: 'shipment',
          })),
        },
        cargos: { data: [] },
        parent_document: { data: null },
        email_submission: { data: null },
        last_document_representation: {
          data: extractionId
            ? { id: extractionId, type: 'document_representation' }
            : null,
        },
      },
    },
  };
}

export const DOCUMENT_TYPES = [
  { code: 'arrival_notice', label: 'Arrival Notice' },
  { code: 'commercial_invoice', label: 'Commercial Invoice' },
  { code: 'delivery_order', label: 'Delivery Order' },
];

export const documentTypesRoute: FakeResponse = {
  body: { document_types: DOCUMENT_TYPES },
};

/** The document state the tools return for {@link documentBody}. */
export function documentState(fixture: FixtureDocument = {}) {
  const extractionId =
    fixture.extractionId === undefined ? EXTRACTION_ID : fixture.extractionId;
  return {
    id: DOCUMENT_ID,
    name: 'Arrival notice',
    document_type:
      fixture.documentType === undefined
        ? 'commercial_invoice'
        : fixture.documentType,
    document_type_source:
      fixture.documentTypeSource === undefined
        ? 'classifier'
        : fixture.documentTypeSource,
    classification_notes: fixture.classificationNotes ?? null,
    source: 'email',
    file_name: 'an.pdf',
    file_content_type: 'application/pdf',
    file_size_bytes: 52_000,
    pages: null,
    parent_document_id: null,
    shipment_ids: fixture.shipmentIds ?? [],
    container_ids: [],
    // The write tools never load the extraction, so its payload is unknown.
    has_extracted_data: extractionId === null ? false : null,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: fixture.updatedAt ?? '2026-10-15T10:05:00Z',
  };
}

/** A 403 that names the document processing feature. */
export const documentsGated: FakeResponse = {
  status: 403,
  body: {
    errors: [
      {
        status: '403',
        title: 'Feature not enabled',
        detail: 'Document processing is not enabled for this account.',
      },
    ],
  },
};
