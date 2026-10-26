import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
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
    await writeConfig({
      token: 'token-1',
      maxRetries: 2,
      defaultFormat: 'mapped',
    });

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

describe('config filesystem boundaries', () => {
  it('refuses a symlinked config directory without touching its target', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 't49-config-link-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 't49-config-target-'));
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = home;
    try {
      fs.symlinkSync(target, path.join(home, 'terminal49'));
      await expect(writeConfig({ token: 'dummy' })).rejects.toThrow();
      expect(fs.readdirSync(target)).toEqual([]);
    } finally {
      process.env.XDG_CONFIG_HOME = previous;
    }
  });
  it('refuses a group-readable config directory', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 't49-config-mode-'));
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = home;
    try {
      fs.mkdirSync(path.join(home, 'terminal49'), { mode: 0o755 });
      await expect(writeConfig({ token: 'dummy' })).rejects.toThrow();
    } finally {
      process.env.XDG_CONFIG_HOME = previous;
    }
  });
});

it('keeps concurrent writes private and ignores a precreated predictable temp symlink', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 't49-config-concurrent-'));
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = home;
  try {
    await writeConfig({ token: 'dummy-initial' });
    const cfgPath = getConfigPath();
    const target = path.join(home, 'unrelated');
    fs.writeFileSync(target, 'unchanged', { mode: 0o644 });
    const oldTemp = `${cfgPath}.tmp.123.json`;
    fs.symlinkSync(target, oldTemp);
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        writeConfig({ token: `dummy-${index}` }),
      ),
    );
    expect((await loadConfig()).token).toMatch(/^dummy-\d$/);
    expect(fs.readFileSync(target, 'utf8')).toBe('unchanged');
    expect(fs.statSync(target).mode & 0o777).toBe(0o644);
    expect(fs.statSync(cfgPath).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(cfgPath)).sort()).toEqual([
      'config.json',
      'config.json.tmp.123.json',
    ]);
  } finally {
    process.env.XDG_CONFIG_HOME = previous;
  }
});

it('refuses to read a symlinked config file', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 't49-config-filelink-'));
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = home;
  try {
    const directory = path.join(home, 'terminal49');
    fs.mkdirSync(directory, { mode: 0o700 });
    const target = path.join(home, 'other.json');
    fs.writeFileSync(target, JSON.stringify({ token: 'dummy' }), {
      mode: 0o600,
    });
    fs.symlinkSync(target, getConfigPath());
    await expect(loadConfig()).rejects.toThrow();
    await expect(writeConfig({ token: 'replacement' })).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(target, 'utf8')).token).toBe('dummy');
  } finally {
    process.env.XDG_CONFIG_HOME = previous;
  }
});
