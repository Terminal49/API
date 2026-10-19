/**
 * Live write evals for the tracking lifecycle, reference number, party,
 * custom field and document fix tools.
 *
 * These change account data, so they run only against a dedicated sandbox
 * account and only when both are set:
 *   MCP_EVAL_ENABLE_WRITE=1
 *   MCP_EVAL_SANDBOX_TOKEN=<API key of the sandbox account>
 * The endpoint is MCP_EVAL_ENDPOINT, as for the read suite. Each case is a
 * round trip that leaves the record as it found it.
 *
 * The sandbox account also holds demo data, so the cases change only the
 * fixtures in write-fixtures.ts: the one shipment with reference number
 * MCP-EVAL-FIXTURE, the party "MCP Eval (do not use)", and the short_text
 * custom field mcp_eval_fixture. A case skips when its fixture is missing.
 * It never falls back to another record. The party must exist already:
 * set_party_role never creates one.
 *
 * The party and custom field cases call the batch tools on the one fixture
 * record. An additive call (attach a party, fill an empty field) writes at
 * once; a destructive one (detach, overwrite, clear) returns a preview, and
 * the case confirms it with the token, the way a client without form
 * elicitation does.
 *
 * Terminal49 accepts custom field changes only from a signed-in user, never
 * from an API key. So the custom field case also needs
 *   MCP_EVAL_SANDBOX_BEARER=<OAuth access token of a sandbox account user>
 * and skips without it. It fails before any write when that user's account
 * is not the MCP_EVAL_SANDBOX_TOKEN account.
 *
 * cancel_tracking_request and relink_document have no live case. A cancel
 * cannot be undone, and every run would have to create a new, billable
 * tracking request. A relink cannot be undone exactly. Their fixture tests
 * cover them. update_document is only previewed, on a document attached to
 * the fixture shipment, and never confirmed.
 */

import { beforeAll, describe, expect, it } from 'vite-plus/test';
import {
  EvalClient,
  isRecord,
  missingDefaultWriteTools,
  resolveSandboxConfig,
  type ToolResult,
} from './client.js';
import { fixtureItems } from './fixtures.js';
import {
  EVAL_CUSTOM_FIELD_SLUG,
  EVAL_FIXTURE_REF,
  EVAL_PARTY_NAME,
  selectEvalDefinition,
  selectEvalParty,
  selectFixtureDocument,
  selectFixtureShipment,
  type FixtureShipment,
} from './write-fixtures.js';

const cfg = resolveSandboxConfig();

const NO_FIXTURE = `No sandbox shipment has reference number ${EVAL_FIXTURE_REF}, or the gateway does not list this tool.`;

function structured(result: ToolResult): Record<string, unknown> {
  return isRecord(result.payload) ? result.payload : {};
}

/** The record ids in a batch result list. */
function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

if (!cfg) {
  describe.skip('Terminal49 MCP write eval (set MCP_EVAL_ENABLE_WRITE and MCP_EVAL_SANDBOX_TOKEN)', () => {
    it('is skipped without a sandbox account', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const client = new EvalClient(cfg.sandbox);
  let served: string[] = [];
  let fixture: FixtureShipment | undefined;
  let partyId: string | undefined;

  /**
   * Calls a write tool and, when it answers with a preview, calls it again
   * with the token: the flow of a client that cannot ask the user itself.
   */
  const confirmedWith = async (
    session: EvalClient,
    tool: string,
    args: Record<string, unknown>,
  ) => {
    const first = structured(await session.callTool(tool, args));
    if (first.status !== 'confirmation_required') {
      return { result: first, previewed: false };
    }
    expect(typeof first.confirmation_token).toBe('string');
    const result = structured(
      await session.callTool(tool, {
        ...args,
        confirmation_token: first.confirmation_token,
      }),
    );
    return { result, previewed: true };
  };
  const confirmed = async (tool: string, args: Record<string, unknown>) =>
    (await confirmedWith(client, tool, args)).result;

  describe('Terminal49 MCP write eval (sandbox account)', () => {
    beforeAll(async () => {
      const init = await client.initialize();
      expect(init.http).toBe(200);
      served = (await client.listTools()).map((tool) => tool.name);
      // A gateway that drops the default write toolsets would skip every case
      // and pass. Fail instead (MCP_EVAL_ALLOW_SPARSE=1 to allow).
      const allowSparse =
        process.env.MCP_EVAL_ALLOW_SPARSE === '1' ||
        process.env.MCP_EVAL_ALLOW_SPARSE === 'true';
      const missing = missingDefaultWriteTools(served);
      if (missing.length > 0 && !allowSparse) {
        throw new Error(
          `the gateway does not list the default write tools ${missing.join(', ')}; ` +
            'check its T49_MCP_TOOLSETS, or set MCP_EVAL_ALLOW_SPARSE=1 to permit skipping.',
        );
      }

      const shipments = await client.callTool('list_shipments', {
        advanced_filters: { q: EVAL_FIXTURE_REF },
        include_stopped_tracking: true,
        page_size: 25,
      });
      fixture = selectFixtureShipment(
        fixtureItems('list_shipments', shipments),
      );

      const parties = structured(
        await client.callTool('list_parties', {
          search: EVAL_PARTY_NAME,
          limit: 50,
        }),
      );
      partyId = selectEvalParty(parties.parties);
    });

    it('stops a shipment with a confirmed preview, then resumes it', async ({
      skip,
    }) => {
      if (!served.includes('stop_shipment_tracking') || !fixture) {
        return skip(NO_FIXTURE);
      }
      const shipmentId = fixture.id;

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
      if (!served.includes('stop_shipment_tracking') || !fixture) {
        return skip(NO_FIXTURE);
      }
      const shipmentId = fixture.id;

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
      if (!served.includes('add_reference_numbers') || !fixture) {
        return skip(NO_FIXTURE);
      }
      const target = { entity_type: 'shipment', entity_id: fixture.id };
      const refNumber = `MCP-EVAL-${Date.now().toString(36).toUpperCase()}`;

      let removed = false;
      try {
        const added = await client.callTool('add_reference_numbers', {
          ...target,
          add: [refNumber],
        });
        expect(added.isError).toBe(false);
        expect(structured(added).status).toBe('added');
        expect(structured(added).ref_numbers).toContain(refNumber);

        const result = await confirmed('remove_reference_numbers', {
          ...target,
          remove: [refNumber],
        });
        removed = result.status === 'removed';
        expect(result.status).toBe('removed');
        expect(result.ref_numbers).not.toContain(refNumber);
      } finally {
        // A number that was never added comes back not_present, unchanged.
        if (!removed) {
          await confirmed('remove_reference_numbers', {
            ...target,
            remove: [refNumber],
          });
        }
      }
    });

    it('attaches the eval party at once, then detaches it with a confirmed preview', async ({
      skip,
    }) => {
      if (!served.includes('set_party_role') || !fixture) {
        return skip(NO_FIXTURE);
      }
      if (!partyId) {
        return skip(
          `No party is named exactly "${EVAL_PARTY_NAME}". Create it in the sandbox account first; set_party_role never creates a party.`,
        );
      }
      const target = {
        shipment_ids: [fixture.id],
        role: 'notify_party',
        party_id: partyId,
      };
      const detach = () =>
        confirmedWith(client, 'set_party_role', {
          ...target,
          action: 'remove',
        });

      let detached = false;
      try {
        // add is additive, so it writes without a preview. A role left behind
        // by a lost run comes back unchanged and is detached below.
        const added = structured(
          await client.callTool('set_party_role', { ...target, action: 'add' }),
        );
        expect(added.status).toBeUndefined();
        expect(added.failed).toEqual([]);
        expect([...ids(added.updated), ...ids(added.unchanged)]).toEqual([
          fixture.id,
        ]);

        const removed = await detach();
        detached = ids(removed.result.updated).includes(fixture.id);
        expect(removed.previewed).toBe(true);
        expect(removed.result.updated).toEqual([fixture.id]);
        expect(removed.result.failed).toEqual([]);
      } finally {
        // A party no longer in the role comes back unchanged.
        if (!detached) await detach();
      }
    });

    it('fills the eval custom field at once, then overwrites and clears it with confirmed previews', async ({
      skip,
    }) => {
      if (!cfg.user) {
        return skip(
          'Custom fields reject API keys. Set MCP_EVAL_SANDBOX_BEARER to a sandbox user token.',
        );
      }
      if (!fixture) return skip(NO_FIXTURE);
      const user = new EvalClient(cfg.user);
      expect((await user.initialize()).http).toBe(200);
      const tools = (await user.listTools()).map((tool) => tool.name);
      if (!tools.includes('set_custom_field')) return skip();

      // The bearer must not reach any account but the sandbox one.
      const accountId = async (session: EvalClient) => {
        const { account } = structured(await session.callTool('whoami', {}));
        return isRecord(account) && typeof account.id === 'string'
          ? account.id
          : undefined;
      };
      const sandboxAccount = await accountId(client);
      expect(sandboxAccount, 'whoami returned no sandbox account').toBeTypeOf(
        'string',
      );
      expect(
        await accountId(user),
        'MCP_EVAL_SANDBOX_BEARER must belong to the MCP_EVAL_SANDBOX_TOKEN account',
      ).toBe(sandboxAccount);

      const listed = structured(
        await user.callTool('list_custom_field_definitions', {
          entity_type: 'shipment',
        }),
      );
      expect(
        Array.isArray(listed.definitions),
        String(listed.custom_fields_note),
      ).toBe(true);
      const apiSlug = selectEvalDefinition(listed.definitions);
      if (!apiSlug) {
        return skip(
          `The sandbox account has no short_text shipment custom field ${EVAL_CUSTOM_FIELD_SLUG}.`,
        );
      }
      const target = {
        entity: 'shipment',
        ids: [fixture.id],
        api_slug: apiSlug,
      };
      const value = `MCP-EVAL-${Date.now().toString(36).toUpperCase()}`;
      const setAsUser = (fieldValue: string | null) =>
        confirmedWith(user, 'set_custom_field', {
          ...target,
          value: fieldValue,
        });

      try {
        // A value an earlier run left behind makes this an overwrite, which
        // previews first; the field is normally empty, so it fills at once.
        const filled = await setAsUser(value);
        expect(filled.result.updated).toEqual([fixture.id]);

        const overwritten = await setAsUser(`${value}-2`);
        expect(overwritten.previewed).toBe(true);
        expect(overwritten.result.updated).toEqual([fixture.id]);

        const cleared = await setAsUser(null);
        expect(cleared.previewed).toBe(true);
        expect(cleared.result.updated).toEqual([fixture.id]);
      } finally {
        // The field is eval-only, so it ends every run empty. An empty field
        // comes back unchanged.
        await setAsUser(null);
      }
    });

    it('previews a document fix on the fixture shipment without confirming it', async ({
      skip,
    }) => {
      // The gateway lists update_document only when its toolsets include
      // documents_write.
      if (!served.includes('update_document') || !fixture) {
        return skip(NO_FIXTURE);
      }
      if (!fixture.billOfLading) return skip();
      const documents = structured(
        await client.callTool('list_documents', {
          reference: fixture.billOfLading,
          page_size: 25,
        }),
      );
      const documentId = selectFixtureDocument(documents.items, fixture.id);
      if (!documentId) return skip();

      // No confirmation_token, so nothing is written.
      const preview = structured(
        await client.callTool('update_document', {
          id: documentId,
          action: 'reextract',
        }),
      );
      expect(preview.status).toBe('confirmation_required');
      expect(typeof preview.confirmation_token).toBe('string');
      expect(isRecord(preview.preview) && preview.preview.action).toBe(
        'reextract',
      );
    });
  });
}
