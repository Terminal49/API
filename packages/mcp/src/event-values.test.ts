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

describe.each(['timeline', 'fallback', 'snapshot'] as const)(
  'registered %s event response',
  (mode) => {
    async function call(events: ReturnType<typeof event>[]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (request: Request) => {
          const path = new URL(request.url).pathname;
          if (path.endsWith('/transport_events')) {
            return mode === 'fallback'
              ? Response.json(
                  { errors: [{ detail: 'Not Found' }] },
                  { status: 404 },
                )
              : Response.json({ data: events });
          }
          expect(path).toBe(`/v2/containers/${id}`);
          return Response.json({
            data: {
              id,
              type: 'container',
              attributes: {
                number: 'TEST1234567',
                current_status: 'available',
                // The snapshot's deadline is the API-selected POD value, never
                // the legacy flat field or an event value.
                pickup_lfd: '2099-12-31',
                import_deadlines: {
                  pod: {
                    unified: {
                      current_value: '2099-01-10',
                      current_selection: 'facility',
                    },
                  },
                },
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
          name:
            mode === 'snapshot'
              ? 'get_container'
              : 'get_container_transport_events',
          arguments:
            mode === 'snapshot'
              ? { id, include: ['transport_events'] }
              : { id },
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
        if (mode === 'snapshot') {
          expect(result.events).toMatchObject({
            count: 2,
            rail_events_count: 0,
            latest_event: live.attributes,
          });
          expect(result.demurrage.pickup_lfd).toBe('2099-01-10');
        } else {
          expect(result.timeline).toHaveLength(4);
          expect(result.total_events).toBe(4);
          expect(result.timeline[1]).toMatchObject({
            ...live.attributes,
            timestamp: '2099-01-02T00:00:00.000Z',
          });
          expect(result.timeline[2].invalidated_at).toBe(
            '2099-01-05T00:00:00Z',
          );
          expect(result.milestones).toEqual({
            discharged_at: '2099-01-01T00:00:00.000Z',
          });
          expect(result.event_categories.rail_events).toBe(0);
          expect(result.event_categories.terminal_events).toBe(1);
          expect(result._metadata.source).toBe(
            mode === 'fallback'
              ? 'container_include_fallback'
              : 'transport_events_subresource',
          );
        }
        expect(result._agent_steering).toBeUndefined();
        expect(result._response_contract).toBeUndefined();
      },
    );

    it('does not promote any event when all events were withdrawn', async () => {
      const result = await call([
        event('container.transport.discharged', 1, reportedValue, true),
      ]);
      if (mode === 'snapshot') {
        expect(result.events).toEqual({ count: 0 });
      } else {
        expect(result.timeline[0].value).toEqual(reportedValue);
        expect(result.total_events).toBe(1);
        expect(result.milestones).toEqual({});
        expect(Object.values(result.event_categories)).toEqual([0, 0, 0, 0, 0]);
      }
    });
  },
);

it('still removes steering outside the exact reported-value path', async () => {
  vi.spyOn(containerTool, 'executeGetContainer').mockResolvedValue({
    events: { latest_event: { value: reportedValue } },
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
    expect(result.structuredContent.events.latest_event.value).toEqual(
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
