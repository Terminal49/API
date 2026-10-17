import { EventEmitter } from 'node:events';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { CALL_BUDGET_MS } from '../src/tools/record-writes.js';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const C4 = '44444444-4444-4444-8444-444444444444';
const C5 = '55555555-5555-4555-8555-555555555555';
const C6 = '66666666-6666-4666-8666-666666666666';
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEFINITION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TIMED_OUT_MID_WRITE =
  'Ran out of time while saving. The change may or may not have been applied; check this record before calling again.';

// GET /containers/{id}/custom_fields?include=definition, shaped like the
// custom_field and custom_field_definition schemas in docs/openapi.json.
const customFieldsDoc = (containerId: string, value: string) => ({
  data: [
    {
      id: `cf-${containerId}`,
      type: 'custom_field',
      attributes: { api_slug: 'po_number', value, display_value: value },
      relationships: {
        entity: { data: { type: 'container', id: containerId } },
        definition: {
          data: { type: 'custom_field_definition', id: DEFINITION },
        },
      },
    },
  ],
  included: [
    {
      id: DEFINITION,
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'po_number',
        display_name: 'PO Number',
        data_type: 'text',
      },
    },
  ],
});

const createdCustomField = (containerId: string, value: string) => ({
  data: {
    id: `cf-${containerId}`,
    type: 'custom_field',
    attributes: { api_slug: 'po_number', value, display_value: value },
  },
});

type Route = {
  delayMs?: number;
  status?: number;
  body: unknown;
};

interface Upstream {
  method: string;
  path: string;
  authorization: string | null;
}

function stubUpstream(route: (method: string, path: string) => Route) {
  const calls: Upstream[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      calls.push({
        method: request.method,
        path: url.pathname,
        authorization: request.headers.get('authorization'),
      });
      const {
        delayMs = 0,
        status = 200,
        body,
      } = route(request.method, url.pathname);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/vnd.api+json' },
      });
    },
  );
  return calls;
}

class NodeResponse extends EventEmitter {
  headersSent = false;
  destroyed = false;
  statusCode = 200;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  endedAt: number | undefined;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown): void {
    this.chunks.push(JSON.stringify(payload));
    this.end();
  }

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(status: number, headers: Record<string, string>): this {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
    this.headersSent = true;
    return this;
  }

  write(chunk: Uint8Array | string): boolean {
    this.chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  }

  end(): void {
    this.headersSent = true;
    this.endedAt = Date.now();
    this.emit('finish');
  }

  // The stateless 2025-era path answers a tools/call as one SSE message.
  body(): any {
    const raw = this.chunks.join('');
    const data = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length))
      .join('');
    return JSON.parse(data || raw);
  }
}

function toolsCall(
  authorization: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return {
    method: 'POST',
    url: '/mcp',
    headers: {
      host: 'localhost',
      authorization,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-06-18',
    },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'set_custom_field', arguments: args },
    },
  };
}

const textOf = (body: any): string =>
  body.result.content.map((block: { text?: string }) => block.text).join('\n');

describe('record writes through the /mcp gateway', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.T49_API_BASE_URL;
    delete process.env.T49_MCP_AUTHKIT_ENABLED;
    delete process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET;
  });

  it('counts OAuth resolution against the write deadline and reports each record', async () => {
    vi.useFakeTimers();
    process.env.T49_MCP_AUTHKIT_ENABLED = 'true';
    process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET = 'resolve-secret';
    const AUTH_MS = 12_000;
    const upstream = stubUpstream((method, path) => {
      if (path === '/v2/connected-clients/resolve') {
        return {
          delayMs: AUTH_MS,
          body: {
            data: {
              attributes: { access_token: 'oauth-access', account_id: ACCOUNT },
            },
          },
        };
      }
      const id = path.split('/')[3] ?? '';
      if (method === 'GET') {
        return { delayMs: 3_000, body: customFieldsDoc(id, 'PO-OLD') };
      }
      return {
        delayMs: id === C5 ? 10_000 : 3_000,
        status: 201,
        body: createdCustomField(id, 'PO-NEW'),
      };
    });
    const { default: handler } = await import('../../../api/mcp.ts');
    const startedAt = Date.now();
    const res = new NodeResponse();

    const done = handler(
      toolsCall('Bearer workos-access-token', {
        entity: 'container',
        ids: [C1, C2, C3, C4, C5, C6],
        api_slug: 'po_number',
        value: 'PO-NEW',
      }) as any,
      res as any,
    );
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS);

    expect(res.endedAt).toBeDefined();
    expect(res.endedAt! - startedAt).toBeLessThanOrEqual(CALL_BUDGET_MS);
    const body = res.body();
    expect(body.result.structuredContent).toEqual({
      updated: [C1, C2, C3, C4],
      unchanged: [],
      failed: [{ id: C5, error: TIMED_OUT_MID_WRITE }],
      not_attempted: [C6],
      summary:
        'Set po_number on 4 containers; 0 already had that value; 1 failed. Ran out of time before 1 more; call again with not_attempted.',
    });
    const text = textOf(body);
    expect(text).toContain(C5);
    expect(text).toContain(C6);
    expect(text).toContain(TIMED_OUT_MID_WRITE);
    expect(
      upstream
        .filter((call) => call.path.startsWith('/v2/containers/'))
        .every((call) => call.authorization === 'Bearer oauth-access'),
    ).toBe(true);
    expect(
      upstream.some((call) => call.method === 'POST' && call.path.includes(C6)),
    ).toBe(false);

    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS);
    await done;
  });

  it('lists failed record IDs and their errors in the text content', async () => {
    stubUpstream((method, path) => {
      const id = path.split('/')[3] ?? '';
      if (method === 'GET' && id === C3) {
        return {
          status: 404,
          body: { errors: [{ status: '404', title: 'Not Found' }] },
        };
      }
      if (method === 'GET') {
        return { body: customFieldsDoc(id, 'PO-OLD') };
      }
      if (id === C2) {
        return {
          status: 422,
          body: {
            errors: [
              {
                status: '422',
                source: { pointer: '/data/attributes/value' },
                title: 'Unprocessable Entity',
                detail: 'Value is too long',
              },
            ],
          },
        };
      }
      return { status: 201, body: createdCustomField(id, 'PO-NEW') };
    });
    const { default: handler } = await import('../../../api/mcp.ts');
    const res = new NodeResponse();

    await handler(
      toolsCall('Token YOUR_API_KEY', {
        entity: 'container',
        ids: [C1, C2, C3],
        api_slug: 'po_number',
        value: 'PO-NEW',
      }) as any,
      res as any,
    );

    const body = res.body();
    const expected = {
      updated: [C1],
      unchanged: [],
      failed: [
        { id: C3, error: 'Record not found in this account.' },
        { id: C2, error: 'Value is too long (/data/attributes/value)' },
      ],
      not_attempted: [],
      summary:
        'Set po_number on 1 container; 0 already had that value; 2 failed.',
    };
    expect(body.result.structuredContent).toEqual(expected);
    expect(JSON.parse(textOf(body))).toEqual(expected);
  });
});
