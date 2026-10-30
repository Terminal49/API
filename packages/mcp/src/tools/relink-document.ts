/**
 * relink_document tool (tier C)
 * Asks Terminal49 to match a document to shipments and containers again, for
 * example after a shipment the document names starts being tracked. A relink
 * adds the links the document's references now match and removes the links
 * Terminal49's own matching made earlier that no longer match, so the user
 * approves a preview of the current links first.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  DOCUMENTS_NOT_ENABLED,
  type DocumentState,
  documentStateSchema,
  readDocument,
} from './documents.js';
import {
  httpStatus,
  isFeatureNotEnabled,
  type SoftResult,
} from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
} from './write-kit.js';

export const documentIdInput = z
  .string()
  .uuid()
  .describe(
    'The Terminal49 document ID (UUID format). Identifier only; never pass conversation text.',
  );

export const relinkDocumentInputSchema = z
  .object({ id: documentIdInput, confirmation_token: confirmationTokenInput })
  .strict();

export type RelinkDocumentArgs = z.input<typeof relinkDocumentInputSchema>;

const relinkPreviewSchema = z.object({
  current: documentStateSchema,
  proposed: z.object({ rerun: z.literal('matching') }),
  reach: z.string(),
});

type RelinkPreview = z.infer<typeof relinkPreviewSchema>;

export const relinkDocumentOutputSchema = confirmedWriteResultSchema(
  relinkPreviewSchema,
  { document_before_relink: documentStateSchema.optional() },
);

export const RELINK_REACH =
  "Terminal49 matches the document's references again in the background. If the document has no current reference extraction, it extracts the references first. It adds links to the shipments and containers they match, except links a user removed earlier, and it removes the links its own matching made earlier that no longer match. Links made by hand in the dashboard stay. Terminal49 keeps no copy of the removed links.";

interface RelinkAccepted {
  status: 'accepted';
  message: string;
  document_before_relink: DocumentState;
}

interface RelinkUnchanged {
  status: 'noop';
  message: string;
  alternative: string;
  document_before_relink: DocumentState;
}

type DocumentsNotEnabled = SoftResult<'FeatureNotEnabled'>;

type RelinkDone = RelinkAccepted | RelinkUnchanged | DocumentsNotEnabled;

export type RelinkDocumentResult = ConfirmedWriteResult<
  RelinkPreview,
  DocumentsNotEnabled,
  RelinkDone
>;

export const RELINK_ACCEPTED_MESSAGE =
  'Terminal49 is matching this document to shipments and containers again. It runs in the background, so the links can take a minute to change. document_before_relink shows the links before this call; read the document again later to see the new ones.';

export async function executeRelinkDocument(
  args: RelinkDocumentArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<RelinkDocumentResult> {
  const parsed = relinkDocumentInputSchema.parse(args);
  const { id } = parsed;
  return runConfirmedWrite(context, {
    tool: 'relink_document',
    entityType: 'document',
    entityId: id,
    args: parsed,
    async read(): Promise<
      ConfirmedWriteRead<RelinkPreview, DocumentsNotEnabled>
    > {
      let document: DocumentState;
      try {
        ({ document } = await readDocument(client, id));
      } catch (error) {
        if (isFeatureNotEnabled(error))
          return { stop: { ...DOCUMENTS_NOT_ENABLED } };
        throw error;
      }
      return {
        // The links are what a relink replaces. updated_at catches an edit that
        // changes it, but a new extraction can finish without changing it.
        state: {
          shipment_ids: document.shipment_ids,
          container_ids: document.container_ids,
          updated_at: document.updated_at,
        },
        preview: {
          current: document,
          proposed: { rerun: 'matching' },
          reach: RELINK_REACH,
        },
      };
    },
    async write(preview): Promise<RelinkDone> {
      await client.documents.relink(id, { format: 'raw' });
      return {
        status: 'accepted',
        message: RELINK_ACCEPTED_MESSAGE,
        document_before_relink: preview.current,
      };
    },
    async refused(error, preview): Promise<RelinkDone | undefined> {
      if (isFeatureNotEnabled(error)) return { ...DOCUMENTS_NOT_ENABLED };
      if (httpStatus(error) !== 422) return undefined;
      return {
        status: 'noop',
        message:
          'Terminal49 would not relink this document in its current state. Nothing was changed.',
        alternative:
          'Show the user the document and its current links. To link it by hand, use the Terminal49 dashboard.',
        document_before_relink: preview.current,
      };
    },
  });
}
