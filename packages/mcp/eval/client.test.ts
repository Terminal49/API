import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { EvalClient } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EvalClient.callTool', () => {
  it('reads a plain-text soft error from structuredContent', async () => {
    const structuredContent = {
      error: 'FeatureNotEnabled',
      message: 'Routing Data is not enabled for this account.',
      alternative: 'Use get_container_transport_events instead.',
    };
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            result: {
              content: [
                {
                  type: 'text',
                  text: `${structuredContent.message}\n\nAlternative: ${structuredContent.alternative}`,
                },
              ],
              structuredContent,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const client = new EvalClient({
      endpoint: 'https://mcp.test/mcp',
      scheme: 'Token',
      token: 'token-123',
    });

    const result = await client.callTool('get_container_route', { id: 'c-1' });

    expect(result.payload).toEqual(structuredContent);
  });
});
