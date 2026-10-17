/**
 * assign_party tool (tier A)
 * Links a party (a company such as a customer or dray carrier) to a container
 * or shipment in a role. A repeated call finds the existing link and changes
 * nothing, and a party is created only when no party has the same name.
 * Names are matched against at most MAX_LOADED_PARTIES parties, so on a larger
 * account a name is never trusted or created; the caller must pass party_id.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  getParty,
  loadParties,
  matchRank,
  MAX_LOADED_PARTIES,
  type PartySummary,
  rankParties,
  toPartySummary,
} from './list-parties.js';
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  CONTAINER_ROLE,
  partyEntityInput,
  type PartyEntityType,
  type PartyRole,
  partyRoleSchema,
  readPartyRoles,
} from './party-roles.js';
import { httpStatus, type SoftResult, ToolInputError } from './soft-results.js';
import {
  auditCreatedRecord,
  runWrite,
  type WriteRateLimited,
  writeRateLimited,
  writeResultSchema,
} from './write-kit.js';

export const assignPartyInputSchema = z
  .object({
    ...partyEntityInput,
    role: z
      .enum(ASSIGNABLE_ROLES)
      .describe(
        `The role the party plays. A container accepts only ${CONTAINER_ROLE}; assign other roles on its shipment.`,
      ),
    party_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        'The party ID (UUID format). Pass party_id or party_name, not both.',
      ),
    party_name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe(
        "The party's company name, name or nickname, used when the party ID is not known. It must match one party exactly, ignoring case and punctuation. Identifier only; never pass conversation text.",
      ),
    create_party_if_missing: z
      .boolean()
      .default(false)
      .describe(
        'With party_name: create the party when no party has that name. Only set it when the user asked to add a new company.',
      ),
  })
  .strict();

export type AssignPartyArgs = z.input<typeof assignPartyInputSchema>;

const partyCandidateSchema = z.object({ id: z.string(), name: z.string() });

export const assignPartyOutputSchema = writeResultSchema({
  record: z
    .object({
      entity_type: z.enum(['container', 'shipment']),
      entity_id: z.string(),
    })
    .optional(),
  party_role: partyRoleSchema.optional(),
  party_created: z.boolean().optional(),
  created_party: partyCandidateSchema.optional(),
  other_parties_in_role: z.array(partyRoleSchema).optional(),
  candidates: z.array(partyCandidateSchema).optional(),
  undo: z.string().optional(),
});

interface AssignRecord {
  entity_type: PartyEntityType;
  entity_id: string;
}

interface AssignOutcome {
  status: 'assigned' | 'already_present';
  message: string;
  record: AssignRecord;
  party_role: PartyRole;
  party_created: boolean;
  created_party?: PartySummary;
  other_parties_in_role: PartyRole[];
  undo?: 'unassign_party';
}

interface PartyLookupFailed extends SoftResult<
  'party_not_found' | 'ambiguous_party' | 'party_lookup_incomplete'
> {
  candidates: PartySummary[];
}

interface AssignRejected {
  status: 'noop';
  message: string;
  alternative: string;
  record: AssignRecord;
  party_created: boolean;
  created_party?: PartySummary;
}

/** The tool created the party, then could not link it to the record. */
interface CreatedNotLinked extends SoftResult<
  'rate_limited' | 'party_not_linked'
> {
  retry_after_s?: number;
  record: AssignRecord;
  party_created: true;
  created_party: PartySummary;
}

export type AssignPartyResult =
  | AssignOutcome
  | PartyLookupFailed
  | AssignRejected
  | CreatedNotLinked
  | WriteRateLimited;

const MAX_CANDIDATES = 5;

function partyNotFound(
  name: string,
  candidates: PartySummary[],
): PartyLookupFailed {
  return {
    error: 'party_not_found',
    message: `No party is named "${name}". Nothing was changed.`,
    alternative:
      'Show the user the closest names in candidates and call again with the party_id they choose. If the user wants a new company, call again with create_party_if_missing set to true.',
    candidates: candidates.slice(0, MAX_CANDIDATES),
  };
}

function partyLookupIncomplete(
  name: string,
  candidates: PartySummary[],
): PartyLookupFailed {
  return {
    error: 'party_lookup_incomplete',
    message: `The account has more than ${MAX_LOADED_PARTIES} parties, so the tool cannot check "${name}" against every one of them. Nothing was changed.`,
    alternative:
      'Ask the user which party they mean. If it is one in candidates, confirm it with the user. Then call again with its party_id.',
    candidates: candidates.slice(0, MAX_CANDIDATES),
  };
}

type PartyResolution =
  | { party: PartySummary; created: boolean }
  | { failed: PartyLookupFailed };

/**
 * The one party with this exact name, ignoring case and punctuation. Any of
 * its names counts, so a name the account already uses is never created again.
 */
async function findPartyByName(
  client: Terminal49Client,
  name: string,
): Promise<PartyResolution | { missing: PartySummary[] }> {
  const { parties, truncated } = await loadParties(client);
  const ranked = rankParties(parties, name).map(toPartySummary);
  const exact = parties
    .filter((party) =>
      party.names.some((alias) => matchRank(alias, name) === 0),
    )
    .map(toPartySummary)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (exact.length === 1 && exact[0] && !truncated) {
    return { party: exact[0], created: false };
  }
  if (exact.length > 1) {
    return {
      failed: {
        error: 'ambiguous_party',
        message: `More than one party is named "${name}". Nothing was changed.`,
        alternative:
          'Show the user the parties in candidates and call again with the party_id they choose.',
        candidates: exact.slice(0, MAX_CANDIDATES),
      },
    };
  }
  if (truncated) {
    return {
      failed: partyLookupIncomplete(name, exact.length > 0 ? exact : ranked),
    };
  }
  return { missing: ranked };
}

const createdPartySchema = z.object({ data: z.object({ id: z.string() }) });

/**
 * Finds the party by name and, when allowed, creates it. A create that
 * Terminal49 refuses with 422 usually means another call created the same
 * party first, so the name is looked up again before giving up.
 */
async function resolvePartyByName(
  client: Terminal49Client,
  context: ToolContext,
  name: string,
  create: boolean,
): Promise<PartyResolution> {
  const found = await findPartyByName(client, name);
  if (!('missing' in found)) return found;
  if (!create) return { failed: partyNotFound(name, found.missing) };

  try {
    const raw = await client.parties.create(
      { company_name: name },
      { format: 'raw' },
    );
    const id = createdPartySchema.parse(raw).data.id;
    await auditCreatedRecord(context, {
      tool: 'assign_party',
      entityType: 'party',
      entityId: id,
    });
    return { party: { id, name }, created: true };
  } catch (error) {
    if (httpStatus(error) !== 422) throw error;
    const again = await findPartyByName(client, name);
    if (!('missing' in again)) return again;
    return {
      failed: {
        ...partyNotFound(name, again.missing),
        message: `Terminal49 would not create a party named "${name}". A party with that name probably exists already. Nothing was changed.`,
        alternative:
          'Ask the user which party they mean and call again with its party_id.',
      },
    };
  }
}

async function resolvePartyById(
  client: Terminal49Client,
  id: string,
): Promise<PartyResolution> {
  const party = await getParty(id, client);
  if (party) return { party, created: false };
  return {
    failed: {
      error: 'party_not_found',
      message: `No party found with id ${id}. Nothing was changed.`,
      alternative: 'Find the party by name, then call again with its id.',
      candidates: [],
    },
  };
}

const createdRoleSchema = z.object({ data: z.object({ id: z.string() }) });

/** How the caller named the party. */
type PartyRef =
  | { kind: 'id'; id: string }
  | { kind: 'name'; name: string; create: boolean };

/** Checks the rules the input schema cannot express. */
function partyRefOf(args: z.output<typeof assignPartyInputSchema>): PartyRef {
  if (args.entity_type === 'container' && args.role !== CONTAINER_ROLE) {
    throw new ToolInputError(
      `A container accepts only the ${CONTAINER_ROLE} role. Assign ${args.role} on the container's shipment.`,
    );
  }
  if (args.party_id !== undefined && args.party_name === undefined) {
    if (args.create_party_if_missing) {
      throw new ToolInputError(
        'create_party_if_missing works only with party_name.',
      );
    }
    return { kind: 'id', id: args.party_id };
  }
  if (args.party_name !== undefined && args.party_id === undefined) {
    return {
      kind: 'name',
      name: args.party_name,
      create: args.create_party_if_missing,
    };
  }
  throw new ToolInputError('Pass exactly one of party_id or party_name.');
}

function addPartyRole(
  client: Terminal49Client,
  entityType: PartyEntityType,
  id: string,
  role: AssignableRole,
  partyId: string,
): Promise<unknown> {
  if (entityType === 'container') {
    return client.containers.addPartyRole(
      id,
      { role: CONTAINER_ROLE, partyId },
      { format: 'raw' },
    );
  }
  return client.shipments.addPartyRole(
    id,
    { role, partyId },
    { format: 'raw' },
  );
}

const NOT_LINKED = 'The party was created, but it is not linked to the record.';

/** The result when the tool created a party and the assignment then failed. */
function createdNotLinked(
  error: unknown,
  record: AssignRecord,
  party: PartySummary,
): CreatedNotLinked {
  const fields = {
    record,
    party_created: true as const,
    created_party: party,
  };
  if (httpStatus(error) === 429) {
    return {
      ...writeRateLimited(error),
      message: `Terminal49 is limiting how often this change can be made. ${NOT_LINKED}`,
      ...fields,
    };
  }
  return {
    error: 'party_not_linked',
    message: `Terminal49 did not complete the assignment. ${NOT_LINKED}`,
    alternative:
      'Call assign_party again with party_id set to created_party.id, or assign the party in the Terminal49 dashboard.',
    ...fields,
  };
}

export async function executeAssignParty(
  args: AssignPartyArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<AssignPartyResult> {
  const parsed = assignPartyInputSchema.parse(args);
  const partyRef = partyRefOf(parsed);
  const { entity_type, entity_id, role } = parsed;
  const record = { entity_type, entity_id };

  return runWrite(
    context,
    { tool: 'assign_party', entityType: entity_type, entityId: entity_id },
    async (): Promise<AssignPartyResult> => {
      const roles = await readPartyRoles(client, entity_type, entity_id);
      const inRole = roles.filter((row) => row.role === role);
      const existing = (partyId: string) =>
        inRole.find((row) => row.party_id === partyId);
      const alreadyPresent = (
        row: PartyRole,
        createdParty?: PartySummary,
      ): AssignOutcome => ({
        status: 'already_present',
        message: createdParty
          ? 'The party was created. Another request linked it to the record in this role at the same time, so it has this role now.'
          : 'This party already has this role on the record. Nothing was changed.',
        record,
        party_role: row,
        party_created: createdParty !== undefined,
        ...(createdParty ? { created_party: createdParty } : {}),
        other_parties_in_role: inRole.filter((other) => other.id !== row.id),
      });

      const knownRow = partyRef.kind === 'id' && existing(partyRef.id);
      if (knownRow) return alreadyPresent(knownRow);

      const resolved =
        partyRef.kind === 'id'
          ? await resolvePartyById(client, partyRef.id)
          : await resolvePartyByName(
              client,
              context,
              partyRef.name,
              partyRef.create,
            );
      if ('failed' in resolved) return resolved.failed;
      const { party, created } = resolved;
      const row = existing(party.id);
      if (row) return alreadyPresent(row);

      const refused = async (error: unknown): Promise<AssignPartyResult> => {
        if (httpStatus(error) !== 422) throw error;
        const after = await readPartyRoles(client, entity_type, entity_id);
        const added = after.find(
          (other) => other.role === role && other.party_id === party.id,
        );
        if (added) return alreadyPresent(added, created ? party : undefined);
        return {
          status: 'noop',
          message: `Terminal49 would not assign this party in this role. ${
            created ? NOT_LINKED : 'Nothing was changed.'
          }`,
          alternative: 'Assign the party in the Terminal49 dashboard.',
          record,
          party_created: created,
          ...(created ? { created_party: party } : {}),
        };
      };

      let raw: unknown;
      try {
        raw = await addPartyRole(
          client,
          entity_type,
          entity_id,
          role,
          party.id,
        );
      } catch (error) {
        if (!created) return refused(error);
        try {
          return await refused(error);
        } catch (failure) {
          return createdNotLinked(failure, record, party);
        }
      }

      return {
        status: 'assigned',
        message:
          inRole.length > 0
            ? 'Party assigned. The record has other parties in this role too; to replace one, unassign it with its party_role_id.'
            : 'Party assigned.',
        record,
        party_role: {
          id: createdRoleSchema.parse(raw).data.id,
          role,
          party_id: party.id,
          party_name: party.name,
        },
        party_created: created,
        other_parties_in_role: inRole,
        undo: 'unassign_party',
      };
    },
  );
}
