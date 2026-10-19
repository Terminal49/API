import { describe, expect, it, vi } from 'vite-plus/test';
import { createToolContext, type ToolSession } from './context.js';

const session = (
  credentialType: ToolSession['credentialType'],
): ToolSession => ({
  credentialType,
  toolsets: ['core'],
  writeToolsAvailable: false,
});

function stubClient() {
  const me = vi.fn().mockResolvedValue({ id: 'key-1' });
  return { client: { me }, me };
}

describe('createToolContext', () => {
  it('fetches /me once per context', async () => {
    const { client, me } = stubClient();
    const context = createToolContext(client, session('user'));

    const [first, second] = await Promise.all([context.me(), context.me()]);

    expect(first).toEqual({ id: 'key-1' });
    expect(second).toBe(first);
    expect(me).toHaveBeenCalledOnce();
    expect(me).toHaveBeenCalledWith({ format: 'mapped' });
  });

  it('fetches /me again for a new context', async () => {
    const { client, me } = stubClient();

    await createToolContext(client, session('api_key')).me();
    await createToolContext(client, session('api_key')).me();

    expect(me).toHaveBeenCalledTimes(2);
  });

  it('carries the session it was created for', () => {
    const { client } = stubClient();

    expect(
      createToolContext(client, {
        credentialType: 'agent',
        toolsets: ['core', 'documents'],
        writeToolsAvailable: true,
      }),
    ).toMatchObject({
      credentialType: 'agent',
      toolsets: ['core', 'documents'],
      writeToolsAvailable: true,
    });
  });
});
