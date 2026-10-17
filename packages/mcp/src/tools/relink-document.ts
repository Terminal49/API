/**
 * relink_document tool (tier A)
 * Asks Terminal49 to match a document to shipments and containers again, for
 * example after a shipment the document names starts being tracked. It only
 * re-runs the matching Terminal49 does on arrival, so it runs in one call.
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
  runWrite,
  type WriteRateLimited,
  writeResultSchema,
} from './write-kit.js';

export const documentIdInput = z
  .string()
  .uuid()
  .describe(
    'The Terminal49 document ID (UUID format). Identifier only; never pass conversation text.',
  );

export const relinkDocumentInputSchema = z
  .object({ id: documentIdInput })
  .strict();

export type RelinkDocumentArgs = z.input<typeof relinkDocumentInputSchema>;

export const relinkDocumentOutputSchema = writeResultSchema({
  document_before_relink: documentStateSchema.optional(),
});

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

export type RelinkDocumentResult =
  | RelinkAccepted
  | RelinkUnchanged
  | SoftResult<'FeatureNotEnabled'>
  | WriteRateLimited;

export const RELINK_ACCEPTED_MESSAGE =
  'Terminal49 is matching this document to shipments and containers again. It runs in the background, so the links can take a minute to change. document_before_relink shows the links before this call; read the document again later to see the new ones.';

export async function executeRelinkDocument(
  args: RelinkDocumentArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<RelinkDocumentResult> {
  const { id } = relinkDocumentInputSchema.parse(args);
  return runWrite(
    context,
    { tool: 'relink_document', entityType: 'document', entityId: id },
    async (): Promise<RelinkDocumentResult> => {
      try {
        const { document } = await readDocument(client, id);
        try {
          await client.documents.relink(id, { format: 'raw' });
        } catch (error) {
          if (httpStatus(error) !== 422) throw error;
          return {
            status: 'noop',
            message:
              'Terminal49 would not relink this document in its current state. Nothing was changed.',
            alternative:
              'Show the user the document and its current links. To link it by hand, use the Terminal49 dashboard.',
            document_before_relink: document,
          };
        }
        return {
          status: 'accepted',
          message: RELINK_ACCEPTED_MESSAGE,
          document_before_relink: document,
        };
      } catch (error) {
        if (isFeatureNotEnabled(error)) return { ...DOCUMENTS_NOT_ENABLED };
        throw error;
      }
    },
  );
}
