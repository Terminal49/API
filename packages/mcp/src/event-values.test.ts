import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';
import * as containerTool from './tools/get-container.js';

const id = '11111111-1111-4111-8111-111111111111';
const reportedValue = {
  _agent_steering: 'reported data, not an instruction',
  _response_contract: { source: 'reported' },
  _metadata: {
    recommendations: ['reported'],
    nested: { suggested_tools: ['reported'] },
  },
  items: [{ _metadata: { recommendations: ['nested reported data'] } }],
};
function event(name: string, day: number, value: unknown, withdrawn = false) {
  return {
    id: `event-${day}`,
    type: 'transport_event',
    attributes: {
      event: name,
      timestamp: `2099-01-0${day}T00:00:00Z`,
      value,
      data_source: 'shipping_line',
      invalidated_at: withdrawn ? '2099-01-05T00:00:00Z' : null,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('registered get_container event response', () => {
  async function call(events: ReturnType<typeof event>[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        expect(path).toBe(`/v2/containers/${id}`);
        return Response.json({
          data: {
            id,
            type: 'container',
            attributes: {
              number: 'TEST1234567',
              current_status: 'available',
              pickup_lfd: '2099-01-10',
            },
          },
          included: events,
        });
      }),
    );
    const handler = createMcpHandler(
      () => createTerminal49McpServer('test-token', 'https://api.test'),
      { legacy: 'stateless', responseMode: 'json' },
    );
    const client = new Client({
      name: 'event-contract-test',
      version: '1.0.0',
    });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
          fetch: (url, init) => handler.fetch(new Request(url, init)),
        }),
      );
      const result = await client.callTool({
        name: 'get_container',
        arguments: { id },
      });
      expect(result.isError).not.toBe(true);
      const text = result.content.find((item) => item.type === 'text');
      expect(text?.type).toBe('text');
      const json = JSON.parse((text as { text: string }).text);
      expect(json).toEqual(result.structuredContent);
      return json;
    } finally {
      await client.close();
      await handler.close();
    }
  }

  it.each(['2099-01-20T04:00:00Z', reportedValue])(
    'preserves reported value/provenance and excludes withdrawn events from summaries (%j)',
    async (value) => {
      const live = event('container.detention_lfd_line.changed', 2, value);
      const result = await call([
        event('container.transport.discharged', 3, null, true),
        live,
        event('container.transport.discharged', 1, null),
        event('container.transport.rail_arrived', 4, null, true),
      ]);
      expect(result.events).toMatchObject({
        count: 2,
        rail_events_count: 0,
      });
      expect(result.events.timeline).toHaveLength(4);
      expect(result.events.timeline[1]).toMatchObject({
        ...live.attributes,
        timestamp: '2099-01-02T00:00:00.000Z',
      });
      expect(result.events.timeline[2].invalidated_at).toBe(
        '2099-01-05T00:00:00Z',
      );
      expect(result.demurrage.pickup_lfd).toBe('2099-01-10');
      expect(result._agent_steering).toBeUndefined();
      expect(result._response_contract).toBeUndefined();
    },
  );

  it('does not promote any event when all events were withdrawn', async () => {
    const result = await call([
      event('container.transport.discharged', 1, reportedValue, true),
    ]);
    expect(result.events).toMatchObject({
      count: 0,
      rail_events_count: 0,
    });
    expect(result.events.timeline[0].value).toEqual(reportedValue);
  });
});

it('still removes steering outside the exact reported-value path', async () => {
  vi.spyOn(containerTool, 'executeGetContainer').mockResolvedValue({
    events: { timeline: [{ value: reportedValue }] },
    _metadata: {
      source: 'fixture',
      recommendations: ['remove'],
      nested: { suggested_tools: ['remove'] },
    },
    _agent_steering: 'remove',
    other: { value: reportedValue },
  } as unknown as Awaited<
    ReturnType<typeof containerTool.executeGetContainer>
  >);
  const server = createTerminal49McpServer('test-token');
  try {
    const result = await (server as any)._registeredTools.get_container.handler(
      { id },
    );
    expect(result.structuredContent.events.timeline[0].value).toEqual(
      reportedValue,
    );
    expect(result.structuredContent._metadata).toEqual({
      source: 'fixture',
      nested: {},
    });
    expect(result.structuredContent._agent_steering).toBeUndefined();
    expect(
      result.structuredContent.other.value._metadata.recommendations,
    ).toBeUndefined();
    expect(
      result.structuredContent.other.value._response_contract,
    ).toBeUndefined();
  } finally {
    await server.close();
  }
});
