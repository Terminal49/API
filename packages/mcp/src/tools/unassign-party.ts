/**
 * unassign_party tool (tier C)
 * Removes one party role from a container or shipment. Only the link goes;
 * the party and its other assignments stay. Integrations and filters that use
 * the role stop matching the record, so it needs a confirmed preview.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  partyEntityInput,
  type PartyEntityType,
  type PartyRole,
  partyRoleSchema,
  readPartyRoles,
} from './party-roles.js';
import { httpStatus } from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
} from './write-kit.js';

export const unassignPartyInputSchema = z
  .object({
    ...partyEntityInput,
    party_role_id: z
      .string()
      .uuid()
      .describe(
        'The party role ID (UUID format) from the record party_roles list. Identifier only; never pass conversation text.',
      ),
    confirmation_token: confirmationTokenInput,
  })
  .strict();

export type UnassignPartyArgs = z.input<typeof unassignPartyInputSchema>;

const recordSchema = z.object({
  entity_type: z.enum(['container', 'shipment']),
  entity_id: z.string(),
});

const unassignPreviewSchema = z.object({
  current: z.object({ party_role: partyRoleSchema }),
  proposed: z.object({ party_role: z.null() }),
  reach: z.string(),
});

type UnassignPreview = z.infer<typeof unassignPreviewSchema>;

export const unassignPartyOutputSchema = confirmedWriteResultSchema(
  unassignPreviewSchema,
  {
    record: recordSchema.optional(),
    party_role: partyRoleSchema.optional(),
    party_roles: z.array(partyRoleSchema).optional(),
    undo: z.string().optional(),
  },
);

const UNASSIGN_REACH =
  'Only the link between this party and this record is removed. The party and its other assignments stay. Filters and integrations that use this role stop matching the record.';

interface RecordRef {
  entity_type: PartyEntityType;
  entity_id: string;
}

interface NotAssigned {
  status: 'not_assigned';
  message: string;
  record: RecordRef;
  party_roles: PartyRole[];
}

interface UnassignOutcome {
  status: 'unassigned';
  message: string;
  record: RecordRef;
  party_role: PartyRole;
  undo: 'assign_party';
}

export type UnassignPartyResult = ConfirmedWriteResult<
  UnassignPreview,
  NotAssigned,
  UnassignOutcome | NotAssigned
>;

function notAssigned(record: RecordRef, roles: PartyRole[]): NotAssigned {
  return {
    status: 'not_assigned',
    message:
      'This record has no party role with this id, so there is nothing to remove. Nothing was changed.',
    record,
    party_roles: roles,
  };
}

export async function executeUnassignParty(
  args: UnassignPartyArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<UnassignPartyResult> {
  const parsed = unassignPartyInputSchema.parse(args);
  const { entity_type, entity_id, party_role_id } = parsed;
  const record = { entity_type, entity_id };
  return runConfirmedWrite(context, {
    tool: 'unassign_party',
    entityType: entity_type,
    entityId: entity_id,
    args: parsed,
    async read(): Promise<ConfirmedWriteRead<UnassignPreview, NotAssigned>> {
      const roles = await readPartyRoles(client, entity_type, entity_id);
      const row = roles.find((role) => role.id === party_role_id);
      if (!row) return { stop: notAssigned(record, roles) };
      return {
        state: { id: row.id, role: row.role, party_id: row.party_id },
        preview: {
          current: { party_role: row },
          proposed: { party_role: null },
          reach: UNASSIGN_REACH,
        },
      };
    },
    async refused(error): Promise<UnassignOutcome | NotAssigned | undefined> {
      // Another call removed the role between the check and the delete.
      if (httpStatus(error) !== 404) return undefined;
      return notAssigned(
        record,
        await readPartyRoles(client, entity_type, entity_id),
      );
    },
    async write(preview): Promise<UnassignOutcome | NotAssigned> {
      if (entity_type === 'container') {
        await client.containers.removePartyRole(entity_id, party_role_id, {
          format: 'raw',
        });
      } else {
        await client.shipments.removePartyRole(entity_id, party_role_id, {
          format: 'raw',
        });
      }
      return {
        status: 'unassigned',
        message:
          'Party unassigned. To link it again, call assign_party with the same role and party_id.',
        record,
        party_role: preview.current.party_role,
        undo: 'assign_party',
      };
    },
  });
}
