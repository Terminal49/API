import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';
import { trackContainerAudit } from './tools/track-container.js';

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
    const answer = route(body);
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer), {
      status: request.method === 'POST' ? 201 : 200,
      headers: { 'content-type': 'application/vnd.api+json' },
    });
  });
  return requests;
}

/**
 * The API calls a test made, without GET /me. The write audit looks up the
 * account with it, and these tests check only what track_container sends.
 */
function apiCalls(requests: RecordedRequest[]): string[] {
  return requests
    .map((r) => `${r.method} ${r.url.pathname}`)
    .filter((call) => call !== 'GET /v2/me');
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
      expect(apiCalls(requests)).not.toContain('POST /v2/tracking_requests');
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
      expect(apiCalls(requests)).not.toContain('POST /v2/tracking_requests');
    } finally {
      await client.close();
    }
  });

  it('sends the caller numberType when infer reports another type', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () => {
        const response = inferResponse('MAEU255123456', 'MAEU');
        response.data.attributes.number_type = 'bill_of_lading';
        return response;
      },
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MAEU255123456', numberType: 'booking_number' },
      });

      expect(result.isError).not.toBe(true);
      const create = requests.find(
        (r) =>
          r.method === 'POST' && r.url.pathname === '/v2/tracking_requests',
      );
      expect(create?.body.data.attributes).toEqual({
        request_type: 'booking_number',
        request_number: 'MAEU255123456',
        scac: 'MAEU',
      });
    } finally {
      await client.close();
    }
  });

  it('returns the id and number type of the request the API created', async () => {
    stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () => {
        const response = inferResponse('MAEU123456789', 'MAEU');
        response.data.attributes.number_type = 'bill_of_lading';
        return response;
      },
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MAEU123456789' },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: true,
        tracking_request: {
          id: 'tr-1',
          request_number: 'MAEU123456789',
          number_type: 'bill_of_lading',
          scac: 'MAEU',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('creates the request when numberType is supplied after inference fails', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () => {
        const response = inferResponse('ABC123456', 'MAEU');
        response.data.attributes.number_type = 'unknown';
        return response;
      },
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ABC123456', numberType: 'bill_of_lading' },
      });

      expect(result.isError).not.toBe(true);
      const create = requests.find(
        (r) =>
          r.method === 'POST' && r.url.pathname === '/v2/tracking_requests',
      );
      expect(create?.body.data.attributes.request_type).toBe('bill_of_lading');
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

function unprocessable(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 422,
    headers: { 'content-type': 'application/vnd.api+json' },
  });
}

function rejectedCreate(body: unknown) {
  return stubApi({
    'GET /search': () => ({ data: [] }),
    'POST /tracking_requests/infer_number': () =>
      inferResponse('MSKU4330011', 'MAEU'),
    'POST /tracking_requests': () => unprocessable(body),
  });
}

describe('track_container when the API refuses the tracking request', () => {
  it('passes the account limit message through instead of calling the number invalid', async () => {
    rejectedCreate({
      errors:
        'You have exceeded your tracking request limit. Please contact support@terminal49.com to increase.',
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'You have exceeded your tracking request limit. Please contact support@terminal49.com to increase.',
      );
    } finally {
      await client.close();
    }
  });

  it.each(['tracking_slot_limit_reached', 'insufficient_credits'])(
    'passes the %s detail through',
    async (code) => {
      rejectedCreate({
        errors: [
          {
            status: '422',
            title: 'Unprocessable Entity',
            code,
            detail: `Detail for ${code}.`,
            source: { pointer: '/data/attributes/failed_reason' },
          },
        ],
      });
      const client = await connect();
      try {
        const result = await client.callTool({
          name: 'track_container',
          arguments: { number: 'MSKU4330011' },
        });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toBe(`Detail for ${code}.`);
      } finally {
        await client.close();
      }
    },
  );

  it('returns the existing request and shipment for a duplicate', async () => {
    rejectedCreate({
      errors: [
        {
          status: '422',
          title: 'Unprocessable Entity',
          code: 'duplicate',
          detail: "'MSKU4330011' (MAEU) is already being tracked.",
          source: { pointer: '/data/attributes/request_number' },
          meta: { tracking_request_id: 'tr-existing', shipment_id: 'ship-1' },
        },
      ],
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011' },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({
        tracking_request_created: false,
        source: 'duplicate',
        message: "'MSKU4330011' (MAEU) is already being tracked.",
        tracking_request: { id: 'tr-existing' },
        shipment_id: 'ship-1',
      });
    } finally {
      await client.close();
    }
  });

  it('returns the API detail naming the number a duplicate is stored under', async () => {
    stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () => {
        const response = inferResponse('MAEU123456789', 'MAEU');
        response.data.attributes.number_type = 'bill_of_lading';
        return response;
      },
      'POST /tracking_requests': () =>
        unprocessable({
          errors: [
            {
              status: '422',
              title: 'Unprocessable Entity',
              code: 'duplicate',
              detail:
                "'MAEU123456789' is already being tracked as '123456789' (MAEU).",
              source: { pointer: '/data/attributes/request_number' },
              meta: { tracking_request_id: 'tr-old', shipment_id: null },
            },
          ],
        }),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MAEU123456789' },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({
        tracking_request_created: false,
        source: 'duplicate',
        message:
          "'MAEU123456789' is already being tracked as '123456789' (MAEU).",
        tracking_request: { id: 'tr-old' },
      });
    } finally {
      await client.close();
    }
  });

  it('calls the identifier invalid only when the API points at it', async () => {
    rejectedCreate({
      errors: [
        {
          status: '422',
          title: 'Unprocessable Entity',
          code: 'not_recognized',
          detail: "'XXXX' is not recognized",
          source: { pointer: '/data/attributes/scac' },
        },
      ],
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Tracking identifier MSKU4330011 is invalid. Verify the identifier type and carrier SCAC.',
      );
    } finally {
      await client.close();
    }
  });

  it.each([
    {
      code: 'container_number_tracking_disabled',
      pointer: '/data/attributes/request_type',
      detail: 'Container-number tracking is disabled for this account.',
    },
    {
      code: 'no_integration',
      pointer: '/data/attributes/scac',
      detail:
        "'MAEU' is not supported. We do not currently integrate with Maersk",
    },
    {
      code: 'no_container_request_type_support',
      pointer: '/data/attributes/scac',
      detail:
        '(MAEU) tracking by container number is not supported. Try tracking by master bill of lading or booking number instead. Contact support@terminal49.com if you need help.',
    },
  ])(
    'passes the $code refusal through instead of calling the number invalid',
    async ({ code, pointer, detail }) => {
      rejectedCreate({
        errors: [
          {
            status: '422',
            title: 'Unprocessable Entity',
            code,
            detail,
            source: { pointer },
          },
        ],
      });
      const client = await connect();
      try {
        const result = await client.callTool({
          name: 'track_container',
          arguments: { number: 'MSKU4330011' },
        });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toBe(detail);
      } finally {
        await client.close();
      }
    },
  );

  it('passes a refusal that does not point at the identifier through', async () => {
    rejectedCreate({
      errors: [
        {
          status: '422',
          title: 'Unprocessable Entity',
          detail: 'Party must belong to your account',
          source: { pointer: '/data/relationships/customer' },
        },
      ],
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Party must belong to your account');
    } finally {
      await client.close();
    }
  });

  it('calls the identifier invalid when infer_number rejects the number', async () => {
    const requests = stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () =>
        unprocessable({
          errors: [{ detail: 'This reference number is not valid.' }],
        }),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ABC' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Tracking identifier ABC is invalid. Verify the identifier type and carrier SCAC.',
      );
      expect(apiCalls(requests)).toEqual([
        'GET /v2/search',
        'POST /v2/tracking_requests/infer_number',
      ]);
    } finally {
      await client.close();
    }
  });
});

function trackingRequestSearchHit(
  status: string,
  scac: string | null,
  number = 'ZZQU4330040',
) {
  return {
    data: [
      {
        id: 'tr-earlier',
        type: 'search_result',
        attributes: {
          entity_type: 'tracking_request',
          number,
          scac,
          status,
          shipment_id: null,
        },
      },
    ],
  };
}

describe('track_container when search finds a tracking request', () => {
  it('returns the pending request instead of creating a duplicate', async () => {
    const requests = stubApi({
      'GET /search': () => trackingRequestSearchHit('pending', 'OOLU'),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'zzqu4330040' },
      });

      expect(result.isError).not.toBe(true);
      expect(apiCalls(requests)).toEqual(['GET /v2/search']);
      expect(result.structuredContent).toEqual({
        tracking_request_created: false,
        source: 'search_match',
        message: 'ZZQU4330040 already has a tracking request in progress.',
        tracking_request: {
          id: 'tr-earlier',
          status: 'pending',
          request_number: 'ZZQU4330040',
          scac: 'OOLU',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('returns a request awaiting the carrier manifest instead of creating one', async () => {
    const requests = stubApi({
      'GET /search': () =>
        trackingRequestSearchHit('awaiting_manifest', 'MAEU', 'MAEU12345678'),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MAEU12345678', scac: 'MAEU' },
      });

      expect(apiCalls(requests)).toEqual(['GET /v2/search']);
      expect(result.structuredContent).toEqual({
        tracking_request_created: false,
        source: 'search_match',
        message: 'MAEU12345678 already has a tracking request in progress.',
        tracking_request: {
          id: 'tr-earlier',
          status: 'awaiting_manifest',
          request_number: 'MAEU12345678',
          scac: 'MAEU',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('returns a pending request under the requested SCAC', async () => {
    const requests = stubApi({
      'GET /search': () => trackingRequestSearchHit('pending', 'OOLU'),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ZZQU4330040', scac: 'oolu' },
      });

      expect(apiCalls(requests)).toEqual(['GET /v2/search']);
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: false,
        source: 'search_match',
        tracking_request: { id: 'tr-earlier', scac: 'OOLU' },
      });
    } finally {
      await client.close();
    }
  });

  it.each([
    ['a failed request', 'failed', 'OOLU', {}],
    ['a cancelled request', 'cancelled', 'OOLU', {}],
    [
      'a pending request under another SCAC',
      'pending',
      'MAEU',
      { scac: 'OOLU' },
    ],
    ['a pending request with no SCAC yet', 'pending', null, { scac: 'OOLU' }],
  ])(
    'creates a new request when search finds %s',
    async (_label, status, foundScac, extraArgs) => {
      const requests = stubApi({
        'GET /search': () => trackingRequestSearchHit(status, foundScac),
        'POST /tracking_requests/infer_number': () =>
          inferResponse('ZZQU4330040', 'OOLU'),
        'POST /tracking_requests': createdTrackingRequest,
      });
      const client = await connect();
      try {
        const result = await client.callTool({
          name: 'track_container',
          arguments: { number: 'ZZQU4330040', ...extraArgs },
        });

        expect(result.isError).not.toBe(true);
        expect(apiCalls(requests)).toEqual([
          'GET /v2/search',
          'POST /v2/tracking_requests/infer_number',
          'POST /v2/tracking_requests',
        ]);
        expect(result.structuredContent).toMatchObject({
          tracking_request_created: true,
          tracking_request: {
            request_number: 'ZZQU4330040',
            number_type: 'container',
            scac: 'OOLU',
          },
        });
      } finally {
        await client.close();
      }
    },
  );
  it('creates a new request when search finds a pending request for a longer number', async () => {
    const requests = stubApi({
      'GET /search': () =>
        trackingRequestSearchHit('pending', 'OOLU', 'ZZQU43300401'),
      'POST /tracking_requests/infer_number': () =>
        inferResponse('ZZQU4330040', 'OOLU'),
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ZZQU4330040' },
      });

      expect(apiCalls(requests)).toEqual([
        'GET /v2/search',
        'POST /v2/tracking_requests/infer_number',
        'POST /v2/tracking_requests',
      ]);
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: true,
        tracking_request: { request_number: 'ZZQU4330040', scac: 'OOLU' },
      });
    } finally {
      await client.close();
    }
  });
});

function containerSearchHit(number: string) {
  return {
    data: [
      {
        id: 'cargo-earlier',
        type: 'search_result',
        attributes: {
          entity_type: 'cargo',
          number,
          scac: 'MAEU',
          status: null,
        },
      },
    ],
  };
}

function containerWithShipment(lineTrackingStoppedAt: string | null) {
  return {
    data: {
      id: 'cargo-earlier',
      type: 'container',
      attributes: { number: 'MSKU4330011' },
      relationships: {
        shipment: { data: { id: 'shipment-earlier', type: 'shipment' } },
      },
    },
    included: [
      {
        id: 'shipment-earlier',
        type: 'shipment',
        attributes: {
          shipping_line_scac: 'MAEU',
          line_tracking_stopped_at: lineTrackingStoppedAt,
        },
      },
    ],
  };
}

describe('track_container when search finds a container', () => {
  it('returns the container while its shipment is still tracked', async () => {
    const requests = stubApi({
      'GET /search': () => containerSearchHit('MSKU4330011'),
      'GET /containers/cargo-earlier': () => containerWithShipment(null),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011', scac: 'MAEU' },
      });

      expect(apiCalls(requests)).toEqual([
        'GET /v2/search',
        'GET /v2/containers/cargo-earlier',
      ]);
      expect(result.structuredContent).toMatchObject({
        id: 'cargo-earlier',
        tracking_request_created: false,
        infer_result: { source: 'search_match' },
      });
    } finally {
      await client.close();
    }
  });

  it("creates a new request when the container's earlier tracking has stopped", async () => {
    const requests = stubApi({
      'GET /search': () => containerSearchHit('MSKU4330011'),
      'GET /containers/cargo-earlier': () =>
        containerWithShipment('2026-09-01T00:00:00Z'),
      'POST /tracking_requests/infer_number': () =>
        inferResponse('MSKU4330011', 'MAEU'),
      'POST /tracking_requests': createdTrackingRequest,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011', scac: 'MAEU' },
      });

      expect(result.isError).not.toBe(true);
      expect(apiCalls(requests)).toEqual([
        'GET /v2/search',
        'GET /v2/containers/cargo-earlier',
        'POST /v2/tracking_requests/infer_number',
        'POST /v2/tracking_requests',
      ]);
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: true,
        tracking_request: { request_number: 'MSKU4330011', scac: 'MAEU' },
      });
    } finally {
      await client.close();
    }
  });

  it('returns a later exact match that is still tracked when an earlier one has stopped', async () => {
    const stopped = containerWithShipment('2026-09-01T00:00:00Z');
    const tracked = containerWithShipment(null);
    tracked.data.id = 'cargo-later';
    tracked.data.relationships.shipment.data.id = 'shipment-later';
    tracked.included[0]!.id = 'shipment-later';
    const requests = stubApi({
      'GET /search': () => ({
        data: [
          ...containerSearchHit('MSKU4330011').data,
          {
            ...containerSearchHit('MSKU4330011').data[0]!,
            id: 'cargo-later',
          },
        ],
      }),
      'GET /containers/cargo-earlier': () => stopped,
      'GET /containers/cargo-later': () => tracked,
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011', scac: 'MAEU' },
      });

      expect(apiCalls(requests)).toEqual([
        'GET /v2/search',
        'GET /v2/containers/cargo-earlier',
        'GET /v2/containers/cargo-later',
      ]);
      expect(result.structuredContent).toMatchObject({
        id: 'cargo-later',
        tracking_request_created: false,
        infer_result: { source: 'search_match' },
      });
    } finally {
      await client.close();
    }
  });

  it('creates a new request when the only container found has another number', async () => {
    const requests = stubApi({
      'GET /search': () => containerSearchHit('TSTU4330035'),
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
      expect(apiCalls(requests)).toEqual([
        'GET /v2/search',
        'POST /v2/tracking_requests/infer_number',
        'POST /v2/tracking_requests',
      ]);
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: true,
        tracking_request: { request_number: 'MSKU4330011', scac: 'MAEU' },
      });
    } finally {
      await client.close();
    }
  });

  it('returns an in-progress request found alongside another container', async () => {
    const requests = stubApi({
      'GET /search': () => ({
        data: [
          ...containerSearchHit('TSTU4330035').data,
          ...trackingRequestSearchHit('pending', 'OOLU').data,
        ],
      }),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'ZZQU4330040' },
      });

      expect(apiCalls(requests)).toEqual(['GET /v2/search']);
      expect(result.structuredContent).toMatchObject({
        tracking_request_created: false,
        source: 'search_match',
        tracking_request: { id: 'tr-earlier', status: 'pending' },
      });
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

describe('search_container', () => {
  it('returns tracking request hits with their shipment and counts them', async () => {
    stubApi({
      'GET /search': () => ({
        data: [
          {
            id: 'cargo-1',
            type: 'search_result',
            attributes: {
              entity_type: 'cargo',
              number: 'TSTU4330035',
              scac: 'HLCU',
              status: null,
              port_of_lading_name: null,
              port_of_discharge_name: null,
            },
          },
          {
            id: 'tr-linked',
            type: 'search_result',
            attributes: {
              entity_type: 'tracking_request',
              number: 'HLCUSHA123456',
              scac: 'HLCU',
              status: 'pending',
              failed_reason: null,
              shipment_id: 'ship-9',
            },
          },
          {
            id: 'tr-failed',
            type: 'search_result',
            attributes: {
              entity_type: 'tracking_request',
              number: 'HLCUSHA654321',
              scac: 'HLCU',
              status: 'failed',
              failed_reason: 'not_found',
            },
          },
        ],
      }),
    });
    const client = await connect();
    try {
      const result = await client.callTool({
        name: 'search_container',
        arguments: { query: 'TSTU4330035' },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({
        containers: [
          {
            id: 'cargo-1',
            container_number: 'TSTU4330035',
            status: 'unknown',
            shipping_line: 'HLCU',
          },
        ],
        shipments: [],
        tracking_requests: [
          {
            id: 'tr-linked',
            request_number: 'HLCUSHA123456',
            status: 'pending',
            scac: 'HLCU',
            shipment_id: 'ship-9',
          },
          {
            id: 'tr-failed',
            request_number: 'HLCUSHA654321',
            status: 'failed',
            failed_reason: 'not_found',
            scac: 'HLCU',
          },
        ],
        total_results: 3,
      });
    } finally {
      await client.close();
    }
  });
});

describe('track_container audit', () => {
  it('emits one audit event naming the tracking request it created', async () => {
    const requestId = '3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a';
    stubApi({
      'GET /search': () => ({ data: [] }),
      'POST /tracking_requests/infer_number': () =>
        inferResponse('MSKU4330011', 'MAEU'),
      'POST /tracking_requests': (body) => ({
        ...createdTrackingRequest(body),
        data: { ...createdTrackingRequest(body).data, id: requestId },
      }),
    });
    const lines: string[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((line: unknown) => {
        lines.push(String(line));
      });
    const client = await connect();
    try {
      await client.callTool({
        name: 'track_container',
        arguments: { number: 'MSKU4330011' },
      });
    } finally {
      await client.close();
      spy.mockRestore();
    }

    const audits = lines
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line))
      .filter((event) => event.event === 'mcp.write.audit');
    expect(audits).toEqual([
      expect.objectContaining({
        tool: 'track_container',
        tier: 'A',
        phase: 'execute',
        outcome: 'created',
        entity_type: 'tracking_request',
        entity_id: requestId,
        credential_type: 'api_key',
      }),
    ]);
  });
});

describe('trackContainerAudit', () => {
  it.each([
    [
      { tracking_request_created: true, tracking_request: { id: 'a' } },
      'created',
      'a',
    ],
    [
      {
        tracking_request_created: false,
        source: 'duplicate',
        tracking_request: { id: 'b' },
      },
      'duplicate',
      'b',
    ],
    [
      { tracking_request_created: false, id: 'container-1' },
      'already_tracked',
      undefined,
    ],
    [
      { error: 'NotFound', tracking_request_created: false },
      'NotFound',
      undefined,
    ],
  ])('reads %j as %s', (result, outcome, entityId) => {
    expect(trackContainerAudit(result)).toEqual({ outcome, entityId });
  });
});
