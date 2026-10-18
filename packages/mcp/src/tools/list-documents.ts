/**
 * list_documents tool
 * Finds documents (Bills of Lading, arrival notices, delivery orders, ...) on
 * the account. Rows are compact and never carry extracted data or file URLs;
 * get_document returns those on request.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { stringLinks } from './api-fields.js';
import {
  DOCUMENTS_NOT_ENABLED,
  documentSummarySchema,
  type DocumentSummary,
  rawDocumentSchema,
  REPRESENTATION_INCLUDE,
  softResultFields,
  toDocumentSummary,
} from './documents.js';
import { isFeatureNotEnabled, type SoftResult } from './soft-results.js';

const MAX_PAGE_SIZE = 25;

export const DOCUMENT_SORTS = [
  '-created_at',
  'created_at',
  'document_type',
  '-document_type',
  'added_by',
  '-added_by',
] as const;

export const documentTypeCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,64}$/);

export const listDocumentsInputSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional()
    .describe(
      'Text to match in the file name (maximum 128 characters). Never pass conversation text.',
    ),
  reference: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe(
      'One reference to match, such as a Bill of Lading, booking, container, or PO number (maximum 64 characters). Identifier only; never pass conversation text.',
    ),
  document_types: z
    .array(documentTypeCodeSchema)
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Document type codes to match, such as arrival_notice or delivery_order. Set include_types to get every code.',
    ),
  sort: z
    .enum(DOCUMENT_SORTS)
    .optional()
    .default('-created_at')
    .describe(
      'Sort by created_at, document_type, or added_by; a leading - sorts descending. Default: -created_at (newest first).',
    ),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Page number (1-based)'),
  page_size: z
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(MAX_PAGE_SIZE)
    .describe(`Page size (default 25; maximum ${MAX_PAGE_SIZE})`),
  include_types: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Also return document_types: every document type code with its label. Default: false',
    ),
});

export type ListDocumentsArgs = z.input<typeof listDocumentsInputSchema>;

const documentTypeSchema = z.object({ code: z.string(), label: z.string() });
type DocumentType = z.infer<typeof documentTypeSchema>;

const listDocumentsSchema = z.object({
  items: z.array(documentSummarySchema),
  links: z.record(z.string(), z.string()),
  meta: z.record(z.string(), z.unknown()),
  document_types: z.array(documentTypeSchema).optional(),
});

export const listDocumentsOutputSchema = listDocumentsSchema
  .partial()
  .extend(softResultFields);

export type ListDocumentsResult = z.infer<typeof listDocumentsSchema>;

const rawListSchema = z.object({
  data: z.array(z.unknown()).catch([]),
  included: z.array(z.unknown()).catch([]),
  links: z.record(z.string(), z.unknown()).catch({}),
  meta: z.record(z.string(), z.unknown()).catch({}),
});

const rawTypesSchema = z.object({
  document_types: z.array(z.unknown()).catch([]),
});

function toDocumentTypes(entries: readonly unknown[]): DocumentType[] {
  return entries.flatMap((entry) => {
    const parsed = documentTypeSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function toRows(
  records: readonly unknown[],
  included: readonly unknown[],
): DocumentSummary[] {
  return records.flatMap((record) => {
    const parsed = rawDocumentSchema.safeParse(record);
    return parsed.success ? [toDocumentSummary(parsed.data, included)] : [];
  });
}

export async function executeListDocuments(
  args: ListDocumentsArgs,
  client: Terminal49Client,
): Promise<ListDocumentsResult | SoftResult<'FeatureNotEnabled'>> {
  const input = listDocumentsInputSchema.parse(args);
  let raw: unknown;
  let types: unknown;
  try {
    [raw, types] = await Promise.all([
      client.documents.list(
        {
          filename: input.filename,
          reference: input.reference,
          documentTypes: input.document_types,
          sort: input.sort,
          include: REPRESENTATION_INCLUDE,
        },
        { format: 'raw', page: input.page, pageSize: input.page_size },
      ),
      input.include_types
        ? client.documents.types({ format: 'raw' })
        : Promise.resolve(undefined),
    ]);
  } catch (error) {
    if (isFeatureNotEnabled(error)) {
      return { ...DOCUMENTS_NOT_ENABLED };
    }
    throw error;
  }

  const list = rawListSchema.parse(raw ?? {});
  const result: ListDocumentsResult = {
    items: toRows(list.data, list.included),
    links: stringLinks(list.links),
    meta: list.meta,
  };
  if (types !== undefined) {
    result.document_types = toDocumentTypes(
      rawTypesSchema.parse(types ?? {}).document_types,
    );
  }
  return result;
}
