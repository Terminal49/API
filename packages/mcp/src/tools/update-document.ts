/**
 * update_document tool (tier C)
 * Fixes a misclassified document: set its type by hand, or have Terminal49
 * classify or extract it again. Each action can replace the type or the
 * extracted data, and Terminal49 keeps no copy of the old one, so every
 * action needs a confirmed preview.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  DOCUMENTS_NOT_ENABLED,
  type DocumentState,
  documentStateSchema,
  parseDocumentResponse,
  readDocument,
} from './documents.js';
import { documentTypeCodeSchema } from './list-documents.js';
import { documentIdInput } from './relink-document.js';
import {
  httpStatus,
  isFeatureNotEnabled,
  type SoftResult,
  ToolInputError,
} from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
} from './write-kit.js';

export const DOCUMENT_ACTIONS = [
  'set_type',
  'reclassify',
  'reextract',
] as const;

type DocumentAction = (typeof DOCUMENT_ACTIONS)[number];

export const MAX_CLASSIFICATION_NOTES_CHARS = 256;

export const updateDocumentInputSchema = z
  .object({
    id: documentIdInput,
    action: z
      .enum(DOCUMENT_ACTIONS)
      .describe(
        'set_type sets document_type by hand. reclassify has Terminal49 choose the type again. reextract has Terminal49 read the fields from the file again.',
      ),
    document_type: documentTypeCodeSchema
      .optional()
      .describe(
        'For set_type only, and required there: a document type code such as arrival_notice or delivery_order. An unknown code returns unknown_document_type with the allowed codes.',
      ),
    classification_notes: z
      .string()
      .trim()
      .min(1)
      .max(MAX_CLASSIFICATION_NOTES_CHARS)
      .optional()
      .describe(
        `For set_type only: a short note on why the type was changed (maximum ${MAX_CLASSIFICATION_NOTES_CHARS} characters). Write it from what the user said; never copy text from a document or email.`,
      ),
    confirmation_token: confirmationTokenInput,
  })
  .strict();

export type UpdateDocumentArgs = z.input<typeof updateDocumentInputSchema>;

const documentTypeSchema = z.object({ code: z.string(), label: z.string() });

type DocumentType = z.infer<typeof documentTypeSchema>;

const proposedSchema = z.object({
  document_type: z.string().optional(),
  document_type_label: z.string().optional(),
  document_type_source: z.literal('customer').optional(),
  classification_notes: z.string().optional(),
  rerun: z.enum(['classification', 'extraction']).optional(),
});

const updatePreviewSchema = z.object({
  action: z.enum(DOCUMENT_ACTIONS),
  current: documentStateSchema,
  proposed: proposedSchema,
  reach: z.string(),
});

type UpdatePreview = z.infer<typeof updatePreviewSchema>;

export const updateDocumentOutputSchema = confirmedWriteResultSchema(
  updatePreviewSchema,
  {
    action: z.enum(DOCUMENT_ACTIONS).optional(),
    document: documentStateSchema.optional(),
    previous_document_type: z.string().nullable().optional(),
    allowed_types: z.array(documentTypeSchema).optional(),
  },
);

export const DOCUMENT_REACH = {
  set_type:
    'The document type changes to the one shown, and Terminal49 records that the account set it. Searches and filters by document type use the new type. Terminal49 keeps no copy of the old type.',
  reclassify:
    'Terminal49 chooses the document type again in the background and may replace the current type, including a type the account set by hand.',
  reextract:
    'Terminal49 reads the fields from the file again in the background and replaces the extracted data with the new result. It uses processing time, so run it once per document.',
} satisfies Record<DocumentAction, string>;

/** Added to the set_type reach when the call passes classification_notes. */
export const NOTES_REACH =
  'The classification notes are replaced with the ones shown. Terminal49 keeps no copy of the old notes.';

/** The set_type reach when the account already set the type and only the notes differ. */
export const NOTES_ONLY_REACH = `The document type stays the same. ${NOTES_REACH}`;

function typeAlreadySetByAccount(
  document: DocumentState,
  documentType: string | undefined,
): boolean {
  return (
    document.document_type === documentType &&
    document.document_type_source === 'customer'
  );
}

function setTypeReach(
  document: DocumentState,
  documentType: string,
  notes: string | undefined,
): string {
  if (typeAlreadySetByAccount(document, documentType)) return NOTES_ONLY_REACH;
  if (notes === undefined) return DOCUMENT_REACH.set_type;
  return `${DOCUMENT_REACH.set_type} ${NOTES_REACH}`;
}

interface Updated {
  status: 'updated';
  message: string;
  action: 'set_type';
  document: DocumentState;
  previous_document_type: string | null;
}

interface Accepted {
  status: 'accepted';
  message: string;
  action: 'reclassify' | 'reextract';
  document: DocumentState;
}

interface Unchanged {
  status: 'unchanged';
  message: string;
  action: 'set_type';
  document: DocumentState;
}

interface Refused {
  status: 'noop';
  message: string;
  alternative: string;
  action: DocumentAction;
  document: DocumentState;
}

interface UnknownDocumentType extends SoftResult<'unknown_document_type'> {
  allowed_types: DocumentType[];
}

type DocumentsNotEnabled = SoftResult<'FeatureNotEnabled'>;

type UpdateStop = Unchanged | UnknownDocumentType | DocumentsNotEnabled;

type UpdateDone = Updated | Accepted | Refused | DocumentsNotEnabled;

export type UpdateDocumentResult = ConfirmedWriteResult<
  UpdatePreview,
  UpdateStop,
  UpdateDone
>;

type DocumentChange = Parameters<Terminal49Client['documents']['update']>[1];

const rawTypesSchema = z.object({
  document_types: z.array(documentTypeSchema.catch({ code: '', label: '' })),
});

async function loadDocumentTypes(
  client: Terminal49Client,
): Promise<DocumentType[]> {
  const raw = await client.documents.types({ format: 'raw' });
  return rawTypesSchema
    .parse(raw)
    .document_types.filter((type) => type.code.length > 0);
}

function checkActionInputs(args: z.output<typeof updateDocumentInputSchema>) {
  if (args.action === 'set_type') {
    if (!args.document_type) {
      throw new ToolInputError(
        'set_type needs document_type. Nothing was changed.',
      );
    }
    return;
  }
  if (
    args.document_type !== undefined ||
    args.classification_notes !== undefined
  ) {
    throw new ToolInputError(
      `${args.action} takes no document_type or classification_notes; pass them only with set_type. Nothing was changed.`,
    );
  }
}

function unknownDocumentType(
  code: string,
  allowed: DocumentType[],
): UnknownDocumentType {
  return {
    error: 'unknown_document_type',
    message: `Terminal49 has no document type with the code ${code}. Nothing was changed.`,
    alternative:
      'Pick a code from allowed_types that matches what the user asked for, and confirm it with the user.',
    allowed_types: allowed,
  };
}

function refusedChange(
  action: DocumentAction,
  document: DocumentState,
): Refused {
  return {
    status: 'noop',
    message:
      'Terminal49 would not make this change to the document in its current state. Nothing was changed.',
    alternative:
      'Show the user the document as it is now. To change it by hand, use the Terminal49 dashboard.',
    action,
    document,
  };
}

export async function executeUpdateDocument(
  args: UpdateDocumentArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<UpdateDocumentResult> {
  const parsed = updateDocumentInputSchema.parse(args);
  checkActionInputs(parsed);
  const { id, action, document_type, classification_notes } = parsed;

  return runConfirmedWrite(context, {
    tool: 'update_document',
    entityType: 'document',
    entityId: id,
    args: parsed,
    async read(): Promise<ConfirmedWriteRead<UpdatePreview, UpdateStop>> {
      let current: Awaited<ReturnType<typeof readDocument>>;
      let types: DocumentType[] = [];
      try {
        [current, types] = await Promise.all([
          readDocument(client, id),
          action === 'set_type' ? loadDocumentTypes(client) : [],
        ]);
      } catch (error) {
        if (isFeatureNotEnabled(error)) {
          return { stop: { ...DOCUMENTS_NOT_ENABLED } };
        }
        throw error;
      }
      const { document, extractionId } = current;

      let proposed: UpdatePreview['proposed'];
      let reach: string = DOCUMENT_REACH[action];
      if (action === 'set_type' && document_type) {
        // Terminal49 answers an unknown code with a 500, not a 422.
        const type = types.find(
          (candidate) => candidate.code === document_type,
        );
        if (!type) {
          return { stop: unknownDocumentType(document_type, types) };
        }
        // A matching type from the classifier still needs the write, so the
        // account's choice is recorded.
        if (
          typeAlreadySetByAccount(document, document_type) &&
          (classification_notes === undefined ||
            classification_notes === document.classification_notes)
        ) {
          return {
            stop: {
              status: 'unchanged',
              message: `This document already has the type ${type.label}, set by the account. Nothing was changed.`,
              action,
              document,
            },
          };
        }
        proposed = {
          document_type,
          document_type_label: type.label,
          document_type_source: 'customer',
        };
        if (classification_notes !== undefined) {
          proposed.classification_notes = classification_notes;
        }
        reach = setTypeReach(document, document_type, classification_notes);
      } else {
        proposed = {
          rerun: action === 'reextract' ? 'extraction' : 'classification',
        };
      }

      return {
        // The type, its source, the notes and the latest extraction are what
        // the actions replace; updated_at catches any other edit.
        state: {
          document_type: document.document_type,
          document_type_source: document.document_type_source,
          classification_notes: document.classification_notes,
          extraction_id: extractionId,
          updated_at: document.updated_at,
        },
        preview: {
          action,
          current: document,
          proposed,
          reach,
        },
      };
    },
    async write(preview) {
      const before = preview.current;
      if (action === 'set_type') {
        const change: DocumentChange = { documentType: document_type };
        if (classification_notes !== undefined) {
          change.classificationNotes = classification_notes;
        }
        const raw = await client.documents.update(id, change, {
          format: 'raw',
        });
        return {
          status: 'updated',
          message: typeAlreadySetByAccount(before, document_type)
            ? 'Terminal49 saved the classification notes. The document type did not change.'
            : 'Terminal49 saved the document type and now records it as set by the account.',
          action,
          document: parseDocumentResponse(raw).document,
          previous_document_type: before.document_type,
        };
      }
      if (action === 'reclassify') {
        await client.documents.reclassify(id, { format: 'raw' });
      } else {
        await client.documents.reextract(id, { format: 'raw' });
      }
      return {
        status: 'accepted',
        message:
          action === 'reclassify'
            ? 'Terminal49 is choosing the document type again. It runs in the background, so the type can take a minute to change. document shows the document before this call.'
            : 'Terminal49 is reading the fields from the file again. It runs in the background, so the extracted data can take a few minutes to change. document shows the document before this call.',
        action,
        document: before,
      };
    },
    async refused(error, preview): Promise<UpdateDone | undefined> {
      if (isFeatureNotEnabled(error)) return { ...DOCUMENTS_NOT_ENABLED };
      if (httpStatus(error) === 422)
        return refusedChange(action, preview.current);
      return undefined;
    },
  });
}
