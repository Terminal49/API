import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return address.port;
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function startClient() {
  const requests: string[] = [];
  let blocked:
    | {
        path: string;
        reached: ReturnType<typeof deferred>;
        release: ReturnType<typeof deferred>;
      }
    | undefined;
  let rejectToken = false;
  let providerUrl = '';
  const provider = createServer((req, res) => {
    void (async () => {
      const path = req.url ?? '';
      requests.push(path);
      if (blocked?.path === path) {
        blocked.reached.resolve();
        await blocked.release.promise;
      }
      res.setHeader('Content-Type', 'application/json');
      if (path === '/resource-metadata') {
        res.end(
          JSON.stringify({ authorization_servers: [`${providerUrl}/auth`] }),
        );
      } else if (path === '/auth/.well-known/oauth-authorization-server') {
        res.end(
          JSON.stringify({
            issuer: `${providerUrl}/auth`,
            authorization_endpoint: `${providerUrl}/authorize`,
            token_endpoint: `${providerUrl}/token`,
            registration_endpoint: `${providerUrl}/register`,
          }),
        );
      } else if (path === '/register') {
        res.end(
          JSON.stringify({
            client_id: 'dummy-client-id',
            client_secret: 'dummy-registration-secret',
            token_endpoint_auth_method: 'none',
            nested: {
              client_secret: 'dummy-nested-secret',
              items: [
                { registration_access_token: 'dummy-registration-token' },
              ],
              unknown_token: { client_secret: 'dummy-object-secret' },
            },
          }),
        );
      } else if (path === '/token') {
        res.statusCode = rejectToken ? 400 : 200;
        res.end(
          JSON.stringify(
            rejectToken
              ? {
                  error: 'invalid_grant',
                  nested: { client_secret: 'dummy-error-secret' },
                }
              : {
                  access_token: 'dummy-access-token',
                  refresh_token: 'dummy-refresh-token',
                  token_type: 'Bearer',
                },
          ),
        );
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    })().catch(() => res.destroy());
  });
  providerUrl = `http://127.0.0.1:${await listen(provider)}`;
  cleanup.push(() => closeServer(provider));
  const reservation = createServer();
  const port = await listen(reservation);
  await closeServer(reservation);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../scripts/oauth-test-client.mjs', import.meta.url),
      ),
    ],
    {
      env: {
        PATH: process.env.PATH,
        HOST: '127.0.0.1',
        PORT: String(port),
        MCP_OAUTH_CLIENT_BASE_URL: url,
        MCP_OAUTH_RESOURCE_URL: providerUrl,
        MCP_OAUTH_PROTECTED_RESOURCE_METADATA_URL: `${providerUrl}/resource-metadata`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  cleanup.push(async () => {
    blocked?.release.resolve();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Helper did not start')),
      5_000,
    );
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('MCP OAuth test client listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Helper exited during startup'));
    });
    child.once('error', reject);
  });
  const home = await fetch(url);
  const cookie = home.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Missing session cookie');
  await home.text();
  const request = (path: string, method = 'GET') =>
    fetch(`${url}${path}`, {
      method,
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
  async function authorize() {
    const response = await request('/authorize');
    const location = response.headers.get('location');
    if (!location) throw new Error('Missing authorization redirect');
    return new URL(location).searchParams.get('state');
  }
  async function login() {
    const state = await authorize();
    expect(
      (await request(`/callback?code=dummy-code&state=${state}`)).status,
    ).toBe(302);
  }
  return {
    url,
    child,
    request,
    authorize,
    login,
    requests,
    output: () => output,
    rejectToken: () => {
      rejectToken = true;
    },
    block(path: string) {
      blocked = { path, reached: deferred(), release: deferred() };
      return {
        reached: blocked.reached.promise,
        release: blocked.release.resolve,
      };
    },
  };
}

describe('local OAuth test client', () => {
  it('survives malformed cookie encoding and keeps serving health checks', async () => {
    const client = await startClient();
    const response = await fetch(`${client.url}/healthz`, {
      headers: { Cookie: 'x=%; t49_mcp_oauth_test_session=%' },
    });
    expect(response.status).toBe(200);
    expect((await client.request('/healthz')).status).toBe(200);
    expect(client.child.exitCode).toBeNull();
    expect(client.output()).not.toContain('URIError');
  });

  it('does not commit an authorization callback after the session is cleared', async () => {
    const client = await startClient();
    const state = await client.authorize();
    const gate = client.block('/token');
    const callback = client.request(`/callback?code=dummy-code&state=${state}`);
    await gate.reached;
    expect((await client.request('/api/clear', 'POST')).status).toBe(200);
    gate.release();
    expect((await callback).status).toBe(409);
    const page = await (await client.request('/')).text();
    expect(page).toContain('No Token');
    expect(page).not.toContain('dummy-client-id');
  });

  it('does not commit a refresh after the session is cleared', async () => {
    const client = await startClient();
    await client.login();
    const gate = client.block('/token');
    const refresh = client.request('/api/refresh', 'POST');
    await gate.reached;
    await client.request('/api/clear', 'POST');
    gate.release();
    expect((await refresh).status).toBe(409);
    expect(await (await client.request('/')).text()).toContain('No Token');
  });

  it('rejects a concurrent refresh before reusing the rotating token', async () => {
    const client = await startClient();
    await client.login();
    const gate = client.block('/token');
    const first = client.request('/api/refresh', 'POST');
    await gate.reached;
    const second = await client.request('/api/refresh', 'POST');
    expect(second.status).toBe(409);
    gate.release();
    expect((await first).status).toBe(200);
    expect(client.requests.filter((path) => path === '/token')).toHaveLength(2);
  });

  it.each([
    ['/api/discovery', '/resource-metadata'],
    ['/authorize', '/resource-metadata'],
    ['/authorize', '/register'],
  ])('does not commit %s after clear during %s', async (path, blockedPath) => {
    const client = await startClient();
    const gate = client.block(blockedPath);
    const pending = client.request(path);
    await gate.reached;
    await client.request('/api/clear', 'POST');
    gate.release();
    expect((await pending).status).toBe(409);
    if (blockedPath === '/resource-metadata')
      expect(client.requests).not.toContain('/register');
    expect(await (await client.request('/')).text()).not.toContain(
      'dummy-client-id',
    );
  });

  it('redacts nested registration secrets from the page', async () => {
    const client = await startClient();
    await client.authorize();
    const page = await (await client.request('/')).text();
    expect(page).not.toContain('dummy-registration-secret');
    expect(page).not.toContain('dummy-nested-secret');
    expect(page).not.toContain('dummy-registration-token');
    expect(page).not.toContain('dummy-object-secret');
  });

  it('redacts nested provider-error secrets from responses and logs', async () => {
    const client = await startClient();
    const state = await client.authorize();
    client.rejectToken();
    const response = await client.request(
      `/callback?code=dummy-code&state=${state}`,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('dummy-error-secret');
    expect(client.output()).not.toContain('dummy-error-secret');
  });
});
