import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

// Its own file because the CLI reads the config file once per process.
it('containers demurrage takes --format raw from config defaultFormat', async () => {
  const document = {
    data: {
      id: 'c1',
      type: 'container',
      attributes: { number: 'MSCU1234567', pickup_lfd: '2026-10-20' },
      relationships: { pod_terminal: { data: null } },
    },
  };
  stubApi(() => document);
  const configDirectory = join(process.env.XDG_CONFIG_HOME ?? '', 'terminal49');
  mkdirSync(configDirectory, { mode: 0o700 });
  writeFileSync(
    join(configDirectory, 'config.json'),
    JSON.stringify({ defaultFormat: 'raw' }),
    { mode: 0o600 },
  );

  const result = await runProgram(['--json', 'containers', 'demurrage', 'c1']);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).data).toEqual(document);
});
