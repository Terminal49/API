/**
 * Live write evals for the tracking lifecycle, reference number and party
 * tools.
 *
 * These change account data, so they run only against a dedicated sandbox
 * account and only when both are set:
 *   MCP_EVAL_ENABLE_WRITE=1
 *   MCP_EVAL_SANDBOX_TOKEN=<API key of the sandbox account>
 * The endpoint is MCP_EVAL_ENDPOINT, as for the read suite. Each case is a
 * round trip that leaves the record as it found it.
 *
 * cancel_tracking_request has no live case: a cancel cannot be undone, and
 * every run would have to create a new, billable tracking request. Its
 * fixture tests cover it.
 */

import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { EvalClient, isRecord, type ToolResult } from './client.js';
import { fixtureItems } from './fixtures.js';

const enableWrite =
  process.env.MCP_EVAL_ENABLE_WRITE === '1' ||
  process.env.MCP_EVAL_ENABLE_WRITE === 'true';
const sandboxToken = process.env.MCP_EVAL_SANDBOX_TOKEN?.trim();
const endpoint =
  process.env.MCP_EVAL_ENDPOINT?.trim() || 'https://mcp.terminal49.com/mcp';

function structured(result: ToolResult): Record<string, unknown> {
  return isRecord(result.payload) ? result.payload : {};
}

if (!enableWrite || !sandboxToken) {
  describe.skip('Terminal49 MCP write eval (set MCP_EVAL_ENABLE_WRITE and MCP_EVAL_SANDBOX_TOKEN)', () => {
    it('is skipped without a sandbox account', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const client = new EvalClient({
    endpoint,
    scheme: 'Token',
    token: sandboxToken,
  });
  let served: string[] = [];
  let shipmentId: string | undefined;
  let partyId: string | undefined;

  /** Previews a tier C call, then confirms it with the token it returned. */
  const confirmed = async (tool: string, args: Record<string, unknown>) => {
    const preview = structured(await client.callTool(tool, args));
    if (preview.status !== 'confirmation_required') return preview;
    return structured(
      await client.callTool(tool, {
        ...args,
        confirmation_token: preview.confirmation_token,
      }),
    );
  };

  describe('Terminal49 MCP write eval (sandbox account)', () => {
    beforeAll(async () => {
      const init = await client.initialize();
      expect(init.http).toBe(200);
      served = (await client.listTools()).map((tool) => tool.name);
      if (!served.includes('stop_shipment_tracking')) return;

      const parties = structured(
        await client.callTool('list_parties', { limit: 1 }),
      );
      const firstParty = Array.isArray(parties.parties)
        ? parties.parties.find(isRecord)
        : undefined;
      partyId =
        firstParty && typeof firstParty.id === 'string'
          ? firstParty.id
          : undefined;

      // Takes the first shipment. The case skips if it is already stopped.
      const shipments = await client.callTool('list_shipments', {
        page_size: 10,
      });
      const first = fixtureItems('list_shipments', shipments).find(
        (item) => isRecord(item) && typeof item.id === 'string',
      );
      shipmentId =
        isRecord(first) && typeof first.id === 'string' ? first.id : undefined;
    });

    it('stops a shipment with a confirmed preview, then resumes it', async ({
      skip,
    }) => {
      // The gateway lists these tools only when its toolsets include operations.
      if (!served.includes('stop_shipment_tracking') || !shipmentId) {
        return skip();
      }

      const preview = await client.callTool('stop_shipment_tracking', {
        shipment_id: shipmentId,
      });
      expect(preview.isError).toBe(false);
      const previewed = structured(preview);
      // The sandbox key cannot stop tracking, or the shipment is not tracked.
      if (
        previewed.error === 'FeatureNotEnabled' ||
        previewed.status === 'already_stopped'
      ) {
        return skip();
      }
      expect(previewed.status).toBe('confirmation_required');
      expect(typeof previewed.confirmation_token).toBe('string');

      const resume = () =>
        client.callTool('resume_shipment_tracking', {
          shipment_id: shipmentId,
        });
      // Armed before the stop, so a lost response still resumes.
      let needsResume = true;
      try {
        const stopped = await client.callTool('stop_shipment_tracking', {
          shipment_id: shipmentId,
          confirmation_token: previewed.confirmation_token,
        });
        needsResume = structured(stopped).error === undefined;
        expect(stopped.isError).toBe(false);
        expect(structured(stopped).status).toBe('stopped');

        const resumed = await resume();
        if (structured(resumed).status === 'resumed') needsResume = false;
        expect(resumed.isError).toBe(false);
        expect(structured(resumed).status).toBe('resumed');
      } finally {
        // Leave the sandbox shipment tracked even when an assert failed.
        if (needsResume) await resume();
      }
    });

    it('refuses a stop with an edited confirmation token', async ({ skip }) => {
      if (!served.includes('stop_shipment_tracking') || !shipmentId) {
        return skip();
      }

      const preview = structured(
        await client.callTool('stop_shipment_tracking', {
          shipment_id: shipmentId,
        }),
      );
      if (
        preview.error === 'FeatureNotEnabled' ||
        preview.status === 'already_stopped'
      ) {
        return skip();
      }
      const token = String(preview.confirmation_token ?? '');
      const edited = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

      const result = await client.callTool('stop_shipment_tracking', {
        shipment_id: shipmentId,
        confirmation_token: edited,
      });
      expect(result.isError).toBe(false);
      expect(structured(result).error).toBe('invalid_confirmation');
    });

    it('adds a reference number, then removes it with a confirmed preview', async ({
      skip,
    }) => {
      if (!served.includes('add_reference_numbers') || !shipmentId) {
        return skip();
      }
      const target = { entity_type: 'shipment', entity_id: shipmentId };
      const refNumber = `MCP-EVAL-${Date.now().toString(36).toUpperCase()}`;

      let needsRemove = false;
      try {
        const added = await client.callTool('add_reference_numbers', {
          ...target,
          add: [refNumber],
        });
        needsRemove = structured(added).status === 'added';
        expect(added.isError).toBe(false);
        expect(structured(added).status).toBe('added');
        expect(structured(added).ref_numbers).toContain(refNumber);

        const removed = await confirmed('remove_reference_numbers', {
          ...target,
          remove: [refNumber],
        });
        if (removed.status === 'removed') needsRemove = false;
        expect(removed.status).toBe('removed');
        expect(removed.ref_numbers).not.toContain(refNumber);
      } finally {
        // Leave the sandbox shipment's list as it was even when an assert failed.
        if (needsRemove) {
          await confirmed('remove_reference_numbers', {
            ...target,
            remove: [refNumber],
          });
        }
      }
    });

    it('assigns a party, then unassigns it with a confirmed preview', async ({
      skip,
    }) => {
      if (!served.includes('assign_party') || !shipmentId || !partyId) {
        return skip();
      }
      const target = { entity_type: 'shipment', entity_id: shipmentId };

      const assigned = structured(
        await client.callTool('assign_party', {
          ...target,
          role: 'notify_party',
          party_id: partyId,
        }),
      );
      // Never remove a role this run did not create.
      if (assigned.status === 'already_present') return skip();
      expect(assigned.status).toBe('assigned');
      const role = isRecord(assigned.party_role) ? assigned.party_role : {};
      const unassign = () =>
        confirmed('unassign_party', { ...target, party_role_id: role.id });

      let needsUnassign = true;
      try {
        expect(typeof role.id).toBe('string');
        const unassigned = await unassign();
        if (unassigned.status === 'unassigned') needsUnassign = false;
        expect(unassigned.status).toBe('unassigned');
        expect(unassigned.undo).toBe('assign_party');
      } finally {
        if (needsUnassign && typeof role.id === 'string') await unassign();
      }
    });
  });
}
