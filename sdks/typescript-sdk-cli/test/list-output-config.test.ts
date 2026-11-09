import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

// Its own file because the CLI reads the config file once per process.
it('parties list takes --format raw from config defaultFormat', async () => {
  const document = {
    data: [{ id: 'p-1', type: 'party', attributes: { company_name: 'Acme' } }],
    included: [{ id: 'inc-1', type: 'container', attributes: {} }],
    links: { self: 'https://api.test/v2/parties?page[number]=1' },
    meta: { total: 1 },
  };
  stubApi(() => document);
  const configDirectory = join(process.env.XDG_CONFIG_HOME ?? '', 'terminal49');
  mkdirSync(configDirectory, { mode: 0o700 });
  writeFileSync(
    join(configDirectory, 'config.json'),
    JSON.stringify({ defaultFormat: 'raw' }),
    { mode: 0o600 },
  );

  const result = await runProgram(['--json', 'parties', 'list']);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).data).toEqual(document);
});
