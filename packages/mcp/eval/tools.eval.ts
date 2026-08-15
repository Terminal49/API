/**
 * Live eval suite for the Terminal49 MCP tools.
 *
 * Exercises every registered tool against a deployed gateway and scores each
 * response on its objective contract (shape, required fields, error semantics,
 * latency, and the `_agent_steering` guidance block). Read-only: the only
 * mutating tool, `track_container`, is driven with an already-tracked number so
 * it takes the idempotent search-match path and creates nothing.
 *
 * Opt-in — the whole suite is skipped unless auth is configured:
 *   MCP_EVAL_BEARER=<oauth access token>   npm run eval --workspace @terminal49/mcp
 *   MCP_EVAL_TOKEN=<terminal49 api key>    npm run eval --workspace @terminal49/mcp
 * Endpoint defaults to production; override with MCP_EVAL_ENDPOINT.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import {
  EvalClient,
  isRecord,
  resolveConfig,
  type ToolResult,
} from './client.js';
import {
  hasArray,
  hasNonEmptyArray,
  readString,
  scoreResult,
  type QualitySpec,
  type QualityScore,
} from './quality.js';
import { formatScorecard, writeReport, type EvalRow } from './report.js';

const cfg = resolveConfig();

if (!cfg) {
  describe.skip('Terminal49 MCP tool eval (set MCP_EVAL_BEARER or MCP_EVAL_TOKEN)', () => {
    it('is skipped without credentials', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const client = new EvalClient(cfg);
  const rows: EvalRow[] = [];
  const fixtures: {
    shipmentId?: string;
    containerId?: string;
    containerNumber?: string;
  } = {};
  let serverInfo: unknown;

  /** Call a tool, score it, record the row, and return both for assertions. */
  async function evaluate(
    tool: string,
    args: Record<string, unknown>,
    spec: QualitySpec,
    testCase = 'happy-path',
  ): Promise<{ result: ToolResult; score: QualityScore }> {
    const result = await client.callTool(tool, args);
    const score = scoreResult(result, spec);
    rows.push({ tool, testCase, result, score });
    return { result, score };
  }

  // Fixture discovery is strict by default (see beforeAll): a sparse account
  // would silently skip the detail cases. Opt out with MCP_EVAL_ALLOW_SPARSE=1.
  const allowSparse =
    process.env.MCP_EVAL_ALLOW_SPARSE === '1' ||
    process.env.MCP_EVAL_ALLOW_SPARSE === 'true';

  // The only mutating tool (track_container) is opt-in: on an arbitrary account
  // the idempotent search-match path is not guaranteed, so a call could create a
  // real tracking request. Enable explicitly with MCP_EVAL_ENABLE_WRITE=1.
  const enableWrite =
    process.env.MCP_EVAL_ENABLE_WRITE === '1' ||
    process.env.MCP_EVAL_ENABLE_WRITE === 'true';

  describe('Terminal49 MCP tool eval', () => {
    beforeAll(async () => {
      const init = await client.initialize();
      serverInfo = init.serverInfo;
      expect(init.http).toBe(200);

      // Discover real ids to feed the detail tools.
      const ships = await client.callTool('list_shipments', {
        page_size: 10,
        include_containers: true,
      });
      const shipItems =
        isRecord(ships.payload) && Array.isArray(ships.payload.items)
          ? ships.payload.items
          : [];
      for (const shipment of shipItems) {
        if (!isRecord(shipment) || typeof shipment.id !== 'string') continue;
        fixtures.shipmentId ??= shipment.id;
        const containers = Array.isArray(shipment.containers)
          ? shipment.containers
          : [];
        const container = containers.find(
          (c) => isRecord(c) && typeof c.id === 'string',
        );
        if (isRecord(container)) {
          fixtures.containerId ??=
            typeof container.id === 'string' ? container.id : undefined;
          fixtures.containerNumber ??=
            typeof container.number === 'string' ? container.number : undefined;
        }
        if (fixtures.containerId) break;
      }

      if (!fixtures.containerId) {
        const containersList = await client.callTool('list_containers', {
          page_size: 5,
        });
        const items =
          isRecord(containersList.payload) &&
          Array.isArray(containersList.payload.items)
            ? containersList.payload.items
            : [];
        const first = items.find(
          (c) => isRecord(c) && typeof c.id === 'string',
        );
        if (isRecord(first) && typeof first.id === 'string') {
          fixtures.containerId = first.id;
          if (typeof first.number === 'string') {
            fixtures.containerNumber ??= first.number;
          }
        }
      }

      // Strict by default: on an account with no discoverable data the detail
      // tests would all skip and the suite would "pass" without exercising the
      // tools it gates. Fail loudly instead (MCP_EVAL_ALLOW_SPARSE=1 to allow).
      if (!allowSparse) {
        const missing = (
          ['shipmentId', 'containerId', 'containerNumber'] as const
        ).filter((key) => fixtures[key] === undefined);
        if (missing.length > 0) {
          throw new Error(
            `fixture discovery found no ${missing.join(', ')} on this account; ` +
              'detail tools cannot be exercised. Use an account with tracked shipments ' +
              'or set MCP_EVAL_ALLOW_SPARSE=1 to permit skipping those cases.',
          );
        }
      }
    }, 60_000);

    afterAll(() => {
      const meta = {
        endpoint: client.endpoint,
        scheme: client.scheme,
        serverInfo,
        timestamp: new Date().toISOString(),
      };
      console.log(formatScorecard(rows, meta));
      const path = writeReport(rows, meta);
      console.log(`  JSON report: ${path}\n`);
    });

    // ---- list / catalog tools (no ids required) ----

    it('list_shipments returns a paginated collection', async () => {
      const { result, score } = await evaluate(
        'list_shipments',
        { page_size: 5 },
        {
          requiredKeys: ['items'],
          requireSteering: true,
          predicates: [
            { name: 'items is an array', test: (p) => hasArray(p, 'items') },
            {
              name: 'has pagination meta',
              test: (p) => isRecord(p) && isRecord(p.meta),
            },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(hasArray(result.payload, 'items')).toBe(true);
      expect(score.contractPass).toBe(true);
    });

    it('list_containers returns a paginated collection', async () => {
      const { result, score } = await evaluate(
        'list_containers',
        { page_size: 5 },
        {
          requiredKeys: ['items'],
          requireSteering: true,
          predicates: [
            { name: 'items is an array', test: (p) => hasArray(p, 'items') },
            {
              name: 'first item has an id',
              test: (p) =>
                isRecord(p) &&
                Array.isArray(p.items) &&
                (p.items.length === 0 ||
                  (isRecord(p.items[0]) && typeof p.items[0].id === 'string')),
            },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(score.contractPass).toBe(true);
    });

    it('list_tracking_requests returns typed requests', async () => {
      const { result, score } = await evaluate(
        'list_tracking_requests',
        { page_size: 5 },
        {
          requiredKeys: ['items'],
          requireSteering: true,
          predicates: [
            { name: 'items is an array', test: (p) => hasArray(p, 'items') },
            {
              name: 'item has requestType and status',
              test: (p) =>
                isRecord(p) &&
                Array.isArray(p.items) &&
                (p.items.length === 0 ||
                  (isRecord(p.items[0]) &&
                    'requestType' in p.items[0] &&
                    'status' in p.items[0])),
            },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(score.contractPass).toBe(true);
    });

    it('get_supported_shipping_lines returns the carrier catalog', async () => {
      const { result, score } = await evaluate(
        'get_supported_shipping_lines',
        {},
        {
          requiredKeys: ['total_lines', 'shipping_lines'],
          requireSteering: true,
          predicates: [
            {
              name: 'shipping_lines is non-empty',
              test: (p) => hasNonEmptyArray(p, 'shipping_lines'),
            },
            {
              name: 'each line has scac and name',
              test: (p) =>
                isRecord(p) &&
                Array.isArray(p.shipping_lines) &&
                isRecord(p.shipping_lines[0]) &&
                typeof p.shipping_lines[0].scac === 'string' &&
                typeof p.shipping_lines[0].name === 'string',
            },
            {
              name: 'total_lines matches array length',
              test: (p) =>
                isRecord(p) &&
                Array.isArray(p.shipping_lines) &&
                p.total_lines === p.shipping_lines.length,
              detail: (p) =>
                isRecord(p)
                  ? `total=${String(p.total_lines)} len=${Array.isArray(p.shipping_lines) ? p.shipping_lines.length : '?'}`
                  : '',
            },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(score.contractPass).toBe(true);
    });

    // ---- detail tools (require discovered ids) ----

    it('get_container returns a container snapshot', async ({ skip }) => {
      if (!fixtures.containerId) return skip();
      const id = fixtures.containerId;
      const { result, score } = await evaluate(
        'get_container',
        { id },
        {
          requiredKeys: ['id', 'container_number', 'status'],
          requireSteering: true,
          predicates: [
            { name: 'id round-trips', test: (p) => readString(p, 'id') === id },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(readString(result.payload, 'id')).toBe(id);
      expect(score.contractPass).toBe(true);
    });

    it('get_shipment_details returns a shipment', async ({ skip }) => {
      if (!fixtures.shipmentId) return skip();
      const id = fixtures.shipmentId;
      const { result, score } = await evaluate(
        'get_shipment_details',
        { id, include_containers: true },
        {
          requiredKeys: ['id', 'bill_of_lading', 'status'],
          requireSteering: true,
          predicates: [
            { name: 'id round-trips', test: (p) => readString(p, 'id') === id },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(readString(result.payload, 'id')).toBe(id);
      expect(score.contractPass).toBe(true);
    });

    it('get_container_transport_events returns a timeline', async ({
      skip,
    }) => {
      if (!fixtures.containerId) return skip();
      const { result, score } = await evaluate(
        'get_container_transport_events',
        { id: fixtures.containerId },
        {
          requiredKeys: ['total_events', 'timeline'],
          requireSteering: true,
          predicates: [
            {
              name: 'timeline is an array',
              test: (p) => hasArray(p, 'timeline'),
            },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(score.contractPass).toBe(true);
    });

    it('get_container_route returns route data or a graceful not-found', async ({
      skip,
    }) => {
      if (!fixtures.containerId) return skip();
      const { result, score } = await evaluate(
        'get_container_route',
        { id: fixtures.containerId },
        {
          requireSteering: true,
          predicates: [
            {
              name: 'route payload or explained not-found',
              test: (p) =>
                isRecord(p) &&
                (Array.isArray(p.route_locations) ||
                  'total_legs' in p ||
                  (typeof p.error === 'string' &&
                    typeof p.alternative === 'string')),
              detail: (p) =>
                isRecord(p) && typeof p.error === 'string'
                  ? 'graceful not-found'
                  : 'route data',
            },
          ],
        },
      );
      // Soft-error responses are still HTTP 200 with a JSON payload + steering.
      expect(result.http).toBe(200);
      expect(result.payload).toBeDefined();
      expect(result.steering).toBeDefined();
      expect(score.contractPass).toBe(true);
    });

    // ---- search + track ----

    it('search_container finds the tracked container', async ({ skip }) => {
      if (!fixtures.containerNumber) return skip();
      const number = fixtures.containerNumber;
      const { result, score } = await evaluate(
        'search_container',
        { query: number },
        {
          requiredKeys: ['containers', 'total_results'],
          requireSteering: true,
          predicates: [
            {
              name: 'containers is an array',
              test: (p) => hasArray(p, 'containers'),
            },
            {
              name: 'query matches a returned container',
              test: (p) =>
                isRecord(p) &&
                Array.isArray(p.containers) &&
                p.containers.some(
                  (c) => isRecord(c) && c.container_number === number,
                ),
            },
          ],
        },
      );
      expect(result.isError).toBe(false);
      expect(score.contractPass).toBe(true);
    });

    it('track_container is idempotent for an already-tracked number (no mutation)', async ({
      skip,
    }) => {
      if (!enableWrite || !fixtures.containerNumber) return skip();
      const { result, score } = await evaluate(
        'track_container',
        { number: fixtures.containerNumber },
        {
          requiredKeys: ['tracking_request_created'],
          requireSteering: true,
          predicates: [
            {
              name: 'no tracking request created',
              test: (p) => isRecord(p) && p.tracking_request_created === false,
            },
            {
              name: 'returns a container id',
              test: (p) => typeof readString(p, 'id') === 'string',
            },
          ],
        },
        'idempotent',
      );
      expect(result.isError).toBe(false);
      // The critical safety invariant: nothing was created.
      expect(
        isRecord(result.payload) && result.payload.tracking_request_created,
      ).toBe(false);
      expect(score.contractPass).toBe(true);
    });

    // ---- error handling (negative cases) ----

    it('get_container rejects an unknown id with a tool error', async () => {
      const { result } = await evaluate(
        'get_container',
        { id: '00000000-0000-0000-0000-000000000000' },
        { expectError: true },
        'unknown-id',
      );
      expect(result.isError).toBe(true);
    });

    it('get_container rejects missing required arguments', async () => {
      const { result } = await evaluate(
        'get_container',
        {},
        { expectError: true },
        'missing-arg',
      );
      expect(result.isError).toBe(true);
      expect(result.rawText.toLowerCase()).toContain('validation');
    });

    it('search_container returns an empty result set for gibberish (not an error)', async () => {
      const { result, score } = await evaluate(
        'search_container',
        { query: 'ZZZZ0000000ZZZZ' },
        {
          requiredKeys: ['containers', 'total_results'],
          requireSteering: true,
          predicates: [
            {
              name: 'total_results is 0',
              test: (p) => isRecord(p) && p.total_results === 0,
            },
            {
              name: 'containers is empty',
              test: (p) =>
                isRecord(p) &&
                Array.isArray(p.containers) &&
                p.containers.length === 0,
            },
          ],
        },
        'empty-result',
      );
      expect(result.isError).toBe(false);
      expect(score.contractPass).toBe(true);
    });
  });
}
