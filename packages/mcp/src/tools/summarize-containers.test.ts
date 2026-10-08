import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { executeSummarizeContainers } from './summarize-containers.js';

function fakeClient(summary: unknown) {
  const summaryFn = vi.fn(async () => summary);
  return { client: { containers: { summary: summaryFn } } as any, summaryFn };
}

describe('summarize_containers', () => {
  it('asks the API for the counts in one call, with the tracked default', async () => {
    const { client, summaryFn } = fakeClient({
      groups: [
        { key: 't1', label: 'APM Terminals', count: 30 },
        { key: 't2', label: 'Yusen', count: 12 },
      ],
      total: 42,
      groupBy: 'pod_terminal',
      truncated: false,
    });

    const result = await executeSummarizeContainers(
      { requires_attention: true, group_by: 'pod_terminal' },
      client,
    );

    expect(summaryFn).toHaveBeenCalledTimes(1);
    expect(summaryFn).toHaveBeenCalledWith(
      'pod_terminal',
      expect.objectContaining({
        requires_attention: true,
        actively_tracked: true,
      }),
      { format: 'mapped' },
    );
    expect(result).toEqual({
      total: 42,
      group_by: 'pod_terminal',
      truncated: false,
      groups: [
        { key: 't1', label: 'APM Terminals', count: 30 },
        { key: 't2', label: 'Yusen', count: 12 },
      ],
      applied_filters: { requires_attention: true, actively_tracked: true },
    });
  });

  it('counts stopped tracking too when asked', async () => {
    const { client, summaryFn } = fakeClient({
      groups: [],
      total: 0,
      truncated: false,
    });
    await executeSummarizeContainers(
      { group_by: 'current_status', include_stopped_tracking: true },
      client,
    );
    expect((summaryFn.mock.calls[0] as any)[1]).not.toHaveProperty(
      'actively_tracked',
    );
  });

  it('passes truncation through', async () => {
    const { client } = fakeClient({ groups: [], total: 9000, truncated: true });
    const result = await executeSummarizeContainers(
      { group_by: 'shipping_line' },
      client,
    );
    expect(result).toMatchObject({ total: 9000, truncated: true });
  });

  it('rejects dimensions the API cannot count by', async () => {
    const { client, summaryFn } = fakeClient({});
    await expect(
      executeSummarizeContainers({ group_by: 'hold_type' } as any, client),
    ).rejects.toThrow();
    expect(summaryFn).not.toHaveBeenCalled();
  });
});

it('propagates malformed API responses through the real SDK instead of returning zero', async () => {
  const client = new Terminal49Client({
    apiToken: 'TEST_KEY',
    fetchImpl: async () => new Response(JSON.stringify({ data: [] })),
  });
  await expect(
    executeSummarizeContainers({ group_by: 'current_status' }, client),
  ).rejects.toThrow('Invalid container summary response');
});
