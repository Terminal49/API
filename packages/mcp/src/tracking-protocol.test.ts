import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';

afterEach(() => vi.unstubAllGlobals());

interface RecordedRequest {
  method: string;
  url: URL;
  body: any;
}

function inferResponse(number: string, selectedScac: string | null) {
  const selected = selectedScac
    ? { scac: selectedScac, name: 'Carrier', confidence: 1 }
    : null;
  return {
    data: {
      id: 'req_1',
      type: 'infer_number_results',
      attributes: {
        request_id: 'req_1',
        number_type: 'container',
        validation: {
          type: 'container',
          is_valid: true,
          check_digit_passed: true,
          parsed_number: null,
          reason: null,
        },
        shipping_line: {
          decision: selected ? 'auto_select' : 'no_prediction',
          selected,
          candidates: selected ? [selected] : [],
        },
      },
    },
    meta: { number },
  };
}

function stubApi(routes: Record<string, (body: any) => unknown>) {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0]) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    const body = text ? JSON.parse(text) : undefined;
    requests.push({ method: request.method, url, body });
    const key = `${request.method} ${url.pathname.replace(/^\/v2/, '')}`;
    const route = routes[key];
    if (!route) {
      return new Response(JSON.stringify({ errors: [{ status: '404' }] }), {
        status: 404,
        headers: { 'content-type': 'application/vnd.api+json' },
      });
    }
    return new Response(JSON.stringify(route(body)), {
      status: request.method === 'POST' ? 201 : 200,
      headers: { 'content-type': 'application/vnd.api+json' },
    });
  });
  return requests;
}

async function connect(): Promise<Client> {
  const handler = createMcpHandler(
    () => createTerminal49McpServer('TEST_KEY', 'https://api.test/v2'),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client(
    { name: 'tracking-protocol-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as Array<{ text?: string }>)
    .map((block) => block.text ?? '')
    .join('\n');
}

const createdTrackingRequest = (body: any) => ({
  data: {
    id: 'tr-1',
    type: 'tracking_request',
    attributes: {
      ...body.data.attributes,
      status: 'pending',
    },
    relationships: { tracked_object: { data: null } },
  },
});

describe('track_container carrier selection', () => {
  it('sends the inferred carrier, not the container owner prefix', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () =>
        inferResponse('MSKU4330011', 'MAEU'),
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011' },
      });

      expect(result.isError).not.toBe(true);
      const create = requests.find(
        (r) =>
          r.method === 'POST' && r.url.pathname === '/v2/tracking_requests',
      );
      expect(create?.body).toEqual({
        data: {
          type: 'tracking_request',
          attributes: {
            request_type: 'container',
            request_number: 'MSKU4330011',
            scac: 'MAEU',
          },
        },
      });
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: true,
        tracking_request: {
          request_number: 'MSKU4330011',
          number_type: 'container',
          scac: 'MAEU',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('asks for a SCAC instead of guessing when the carrier cannot be inferred', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () =>
        inferResponse('ZZQU4330056', null),
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ZZQU4330056' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Terminal49 could not infer the carrier for ZZQU4330056; scac is required.',
      );
      expect(
        requests.map((r) => `${r.method} ${r.url.pathname}`),
      ).not.toContain('POST /v2/tracking_requests');
    } finally {
      await client.close();
    }
  });

  it('asks for numberType when the number type cannot be inferred', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () => {
        const response = inferResponse('ABC123456', 'MAEU');
        response.data.attributes.number_type = null as unknown as string;
        return response;
      },
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ABC123456' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Terminal49 could not tell whether ABC123456 is a container, bill of lading, or booking number; numberType is required (container, bill_of_lading, or booking_number).',
      );
      expect(
        requests.map((r) => `${r.method} ${r.url.pathname}`),
      ).not.toContain('POST /v2/tracking_requests');
    } finally {
      await client.close();
    }
  });

  it('sends a user-supplied SCAC when inference has no prediction', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () =>
        inferResponse('ZZQU4330056', null),
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ZZQU4330056', scac: 'oolu' },
      });

      expect(result.isError).not.toBe(true);
      const create = requests.find(
        (r) =>
          r.method === 'POST' && r.url.pathname === '/v2/tracking_requests',
      );
      expect(create?.body.data.attributes.scac).toBe('OOLU');
    } finally {
      await client.close();
    }
  });
});

describe('list_tracking_requests status filter', () => {
  it('rejects succeeded, which the API would silently treat as pending', async () => {
    const requests = stubApi({});
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'list_tracking_requests',
        arguments: { status: 'succeeded' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('status');
      expect(requests).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('sends cancelled and returns each request with its tracked shipment id', async () => {
    const requests = stubApi({
      'GET /tracking_requests': () => ({
        data: [
          {
            id: 'tr-9',
            type: 'tracking_request',
            attributes: {
              request_number: 'MAEU123456789',
              request_type: 'bill_of_lading',
              scac: 'MAEU',
              status: 'cancelled',
              failed_reason: 'Cancelled by user',
            },
            relationships: {
              tracked_object: { data: { id: 'shipment-9', type: 'shipment' } },
            },
          },
        ],
        links: { self: 'https://api.test/v2/tracking_requests' },
      }),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'list_tracking_requests',
        arguments: { status: 'cancelled' },
      });

      expect(result.isError).not.toBe(true);
      expect(requests[0]?.url.searchParams.get('filter[status]')).toBe(
        'cancelled',
      );
      expect(result.structuredContent).toMatchObject({
        items: [
          {
            id: 'tr-9',
            requestNumber: 'MAEU123456789',
            status: 'cancelled',
            shipment: { id: 'shipment-9' },
          },
        ],
      });
    } finally {
      await client.close();
    }
  });
});
