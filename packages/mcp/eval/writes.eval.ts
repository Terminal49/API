/**
 * Live write evals for the tracking lifecycle tools.
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

  describe('Terminal49 MCP write eval (sandbox account)', () => {
    beforeAll(async () => {
      const init = await client.initialize();
      expect(init.http).toBe(200);
      served = (await client.listTools()).map((tool) => tool.name);
      if (!served.includes('stop_shipment_tracking')) return;

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
      let needsResume = false;
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
  });
}
