/**
 * Shared pieces for the document tools: parsing a JSON:API document record
 * into a compact summary, and the soft result for accounts without documents.
 */

import { z } from 'zod';
import {
  nullableNumber,
  nullableString,
  relationshipList,
  relationshipRef,
} from './api-fields.js';
import type { SoftResult } from './soft-results.js';

export const DOCUMENTS_NOT_ENABLED: SoftResult<'FeatureNotEnabled'> = {
  error: 'FeatureNotEnabled',
  message:
    'Document processing is not enabled for this Terminal49 account. Contact sales@terminal49.com to enable it.',
  alternative:
    'Use get_shipment_details or get_container for the data Terminal49 tracks from carriers and terminals.',
};

/** The soft-result fields every document tool's output schema allows. */
export const softResultFields = {
  error: z.string().optional(),
  message: z.string().optional(),
  alternative: z.string().optional(),
};

export const documentSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  document_type: z.string().nullable(),
  document_type_source: z.string().nullable(),
  source: z.string().nullable(),
  file_name: z.string().nullable(),
  file_content_type: z.string().nullable(),
  file_size_bytes: z.number().nullable(),
  pages: z.object({ start: z.number(), end: z.number() }).nullable(),
  parent_document_id: z.string().nullable(),
  shipment_ids: z.array(z.string()).nullable(),
  container_ids: z.array(z.string()).nullable(),
  has_extracted_data: z.boolean().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type DocumentSummary = z.infer<typeof documentSummarySchema>;

/**
 * Names, file names and classification notes are cut to this many characters.
 * Whoever sent a file picks its name, so it is outside text like the file.
 */
export const MAX_DOCUMENT_TEXT_CHARS = 256;

const boundedString = nullableString.transform(
  (value) => value?.slice(0, MAX_DOCUMENT_TEXT_CHARS) ?? null,
);

const packetSegmentSchema = z
  .object({
    packetSegment: z.object({ startPage: z.number(), endPage: z.number() }),
  })
  .nullable()
  .catch(null);

/**
 * A document record as the API sends it. Only these attributes are read, so a
 * file URL the API adds to a record never reaches tool output.
 */
export const rawDocumentSchema = z.object({
  id: z.string(),
  attributes: z
    .object({
      name: boundedString,
      document_type: nullableString,
      document_type_source: nullableString,
      classification_notes: boundedString,
      source: nullableString,
      file_name: boundedString,
      file_content_type: nullableString,
      file_size_bytes: nullableNumber,
      parsed: packetSegmentSchema,
      created_at: nullableString,
      updated_at: nullableString,
    })
    .catch({
      name: null,
      document_type: null,
      document_type_source: null,
      classification_notes: null,
      source: null,
      file_name: null,
      file_content_type: null,
      file_size_bytes: null,
      parsed: null,
      created_at: null,
      updated_at: null,
    }),
  relationships: z
    .object({
      shipments: relationshipList,
      cargos: relationshipList,
      parent_document: relationshipRef,
      email_submission: relationshipRef,
      last_document_representation: relationshipRef,
    })
    .catch({
      shipments: null,
      cargos: null,
      parent_document: null,
      email_submission: null,
      last_document_representation: null,
    }),
});

export type RawDocument = z.infer<typeof rawDocumentSchema>;

export function toDocumentSummary(document: RawDocument): DocumentSummary {
  const { attributes, relationships } = document;
  const segment = attributes.parsed?.packetSegment;
  const extraction = relationships.last_document_representation;
  return {
    id: document.id,
    name: attributes.name,
    document_type: attributes.document_type,
    document_type_source: attributes.document_type_source,
    source: attributes.source,
    file_name: attributes.file_name,
    file_content_type: attributes.file_content_type,
    file_size_bytes: attributes.file_size_bytes,
    pages: segment ? { start: segment.startPage, end: segment.endPage } : null,
    parent_document_id: relationships.parent_document?.data?.id ?? null,
    shipment_ids:
      relationships.shipments?.data.map((shipment) => shipment.id) ?? null,
    container_ids:
      relationships.cargos?.data.map((container) => container.id) ?? null,
    has_extracted_data: extraction ? extraction.data !== null : null,
    created_at: attributes.created_at,
    updated_at: attributes.updated_at,
  };
}
