import { describe, expect, it, vi } from 'vite-plus/test';
import { createToolContext, type ToolSession } from './context.js';

const session = (
  credentialType: ToolSession['credentialType'],
): ToolSession => ({
  credentialType,
  toolsets: ['core'],
  writeToolsAvailable: false,
  credentialHash: 'hash',
});

const ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
const GATEWAY_ACCOUNT_ID = 'c8f3d0b2-6e4a-4f9c-8d1b-2a3f4e5d6c7b';

function stubClient() {
  const me = vi
    .fn()
    .mockResolvedValue({ id: 'key-1', account: { id: ACCOUNT_ID } });
  return { client: { me }, me };
}

describe('createToolContext', () => {
  it('fetches /me once per context', async () => {
    const { client, me } = stubClient();
    const context = createToolContext(client, session('user'));

    const [first, second] = await Promise.all([context.me(), context.me()]);

    expect(first).toEqual({ id: 'key-1', account: { id: ACCOUNT_ID } });
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
        credentialHash: 'hash',
      }),
    ).toMatchObject({
      credentialType: 'agent',
      toolsets: ['core', 'documents'],
      writeToolsAvailable: true,
    });
  });

  it('acts on the account the gateway resolved without reading /me', async () => {
    const { client, me } = stubClient();
    const context = createToolContext(client, {
      ...session('user'),
      gatewayAccountId: GATEWAY_ACCOUNT_ID,
    });

    await expect(context.accountId()).resolves.toBe(GATEWAY_ACCOUNT_ID);
    expect(me).not.toHaveBeenCalled();
  });

  it('takes the account from /me when the gateway resolved none', async () => {
    const { client, me } = stubClient();
    const context = createToolContext(client, session('api_key'));

    await expect(context.accountId()).resolves.toBe(ACCOUNT_ID);
    await context.me();
    expect(me).toHaveBeenCalledOnce();
  });

  it('keys an API key session by its token hash without reading /me', async () => {
    const { client, me } = stubClient();

    await expect(
      createToolContext(client, session('api_key')).credentialKey(),
    ).resolves.toBe('hash');
    await expect(
      createToolContext(client, session('shared_token')).credentialKey(),
    ).resolves.toBe('hash');
    expect(me).not.toHaveBeenCalled();
  });

  it.each(['user', 'agent'] as const)(
    'keys a %s session by the credential /me names, not its bearer token',
    async (credentialType) => {
      const me = vi.fn().mockResolvedValue({
        id: 'user-1',
        kind: 'user',
        account: { id: ACCOUNT_ID },
      });
      const key = (credentialHash: string) =>
        createToolContext(
          { me },
          { ...session(credentialType), credentialHash },
        ).credentialKey();

      const first = await key('bearer-1');
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      await expect(key('bearer-2')).resolves.toBe(first);

      me.mockResolvedValueOnce({
        id: 'user-2',
        kind: 'user',
        account: { id: ACCOUNT_ID },
      });
      await expect(key('bearer-1')).resolves.not.toBe(first);
    },
  );
});
