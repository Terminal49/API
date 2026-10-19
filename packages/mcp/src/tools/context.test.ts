import { describe, expect, it, vi } from 'vite-plus/test';
import { createToolContext } from './context.js';

function stubClient() {
  const me = vi.fn().mockResolvedValue({ id: 'key-1' });
  return { client: { me }, me };
}

describe('createToolContext', () => {
  it('fetches /me once per context', async () => {
    const { client, me } = stubClient();
    const context = createToolContext(client, 'user');

    const [first, second] = await Promise.all([context.me(), context.me()]);

    expect(first).toEqual({ id: 'key-1' });
    expect(second).toBe(first);
    expect(me).toHaveBeenCalledOnce();
    expect(me).toHaveBeenCalledWith({ format: 'mapped' });
  });

  it('fetches /me again for a new context', async () => {
    const { client, me } = stubClient();

    await createToolContext(client, 'api_key').me();
    await createToolContext(client, 'api_key').me();

    expect(me).toHaveBeenCalledTimes(2);
  });

  it('carries the credential type', () => {
    const { client } = stubClient();

    expect(createToolContext(client, 'agent').credentialType).toBe('agent');
  });
});
