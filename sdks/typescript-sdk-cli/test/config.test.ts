import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadConfig,
  writeConfig,
  getConfigPath,
  resetConfig,
} from '../src/config.js';

describe('config persistence', () => {
  const originalConfigHome = process.env.XDG_CONFIG_HOME;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't49-cli-config-'));

  beforeEach(() => {
    process.env.XDG_CONFIG_HOME = tempRoot;
  });

  afterEach(() => {
    process.env.XDG_CONFIG_HOME = originalConfigHome;
  });

  it('writes and reads typed config values', async () => {
    const cfgPath = getConfigPath();
    await resetConfig();
    await writeConfig({ token: 'token-1', maxRetries: 2, defaultFormat: 'mapped' });

    const loaded = await loadConfig();
    expect(loaded.token).toBe('token-1');
    expect(loaded.maxRetries).toBe(2);
    expect(loaded.defaultFormat).toBe('mapped');
    expect(loaded.version).toBe(1);

    const raw = JSON.parse(await fs.promises.readFile(cfgPath, 'utf8'));
    expect(raw.token).toBe('token-1');
  });

  it('returns default config when file missing', async () => {
    await resetConfig();
    const loaded = await loadConfig();
    expect(loaded.version).toBe(1);
    expect(loaded.token).toBeUndefined();
  });
});
