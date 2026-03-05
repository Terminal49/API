import { constants } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type CliOutputMode = 'json' | 'table';
export type CliResponseFormat = 'raw' | 'mapped' | 'both';
export interface CliConfig {
  version: number;
  token?: string;
  baseUrl?: string;
  defaultFormat?: CliResponseFormat;
  defaultOutput?: CliOutputMode;
  maxRetries?: number;
  color?: boolean;
  authScheme?: 'Token' | 'Bearer';
}

const CONFIG_VERSION = 1;

function getConfigDirectory(): string {
  const explicitXdg = process.env.XDG_CONFIG_HOME;
  if (explicitXdg && explicitXdg.trim() !== '') return explicitXdg;

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA;
    if (localAppData && localAppData.trim() !== '') {
      return path.join(localAppData, 'terminal49');
    }
    return path.join(os.homedir(), 'AppData', 'Roaming', 'terminal49');
  }

  return path.join(os.homedir(), '.config', 'terminal49');
}

function sanitizeConfig(raw: Record<string, unknown>): CliConfig {
  const output: CliConfig = { version: CONFIG_VERSION };
  if (typeof raw.version === 'number') output.version = raw.version;
  if (typeof raw.token === 'string' && raw.token.trim() !== '') {
    output.token = raw.token.trim();
  }
  if (typeof raw.baseUrl === 'string' && raw.baseUrl.trim() !== '') {
    output.baseUrl = raw.baseUrl.trim();
  }
  if (raw.defaultFormat === 'raw' || raw.defaultFormat === 'mapped' || raw.defaultFormat === 'both') {
    output.defaultFormat = raw.defaultFormat;
  }
  if (raw.defaultOutput === 'json' || raw.defaultOutput === 'table') {
    output.defaultOutput = raw.defaultOutput;
  }
  if (typeof raw.maxRetries === 'number' && Number.isFinite(raw.maxRetries)) {
    output.maxRetries = Math.max(0, Math.floor(raw.maxRetries));
  }
  if (raw.authScheme === 'Token' || raw.authScheme === 'Bearer') {
    output.authScheme = raw.authScheme;
  }
  if (typeof raw.color === 'boolean') {
    output.color = raw.color;
  }
  return output;
}

function defaultConfigPath(): string {
  return path.join(getConfigDirectory(), 'config.json');
}

export function getConfigPath(): string {
  return defaultConfigPath();
}

export async function loadConfig(): Promise<CliConfig> {
  const configPath = defaultConfigPath();
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return sanitizeConfig(parsed as Record<string, unknown>);
    }
  } catch (error) {
    if (typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: CONFIG_VERSION };
    }
  }
  return { version: CONFIG_VERSION };
}

export async function writeConfig(input: Partial<CliConfig>): Promise<CliConfig> {
  const merged = sanitizeConfig({
    ...((await loadConfig()) as Record<string, unknown>),
    ...input,
  } as Record<string, unknown>);

  const configPath = defaultConfigPath();
  const configDir = path.dirname(configPath);
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });

  const tmp = `${configPath}.tmp.${Date.now()}.json`;
  const payload = JSON.stringify(merged, null, 2);
  await fs.writeFile(tmp, payload, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, configPath);
  return merged;
}

export async function readConfigValue<K extends keyof CliConfig>(
  key: K,
): Promise<CliConfig[K] | undefined> {
  const cfg = await loadConfig();
  return cfg[key];
}

export async function deleteConfigValue<K extends keyof CliConfig>(key: K): Promise<CliConfig> {
  const cfg = await loadConfig();
  const next = { ...cfg };
  if (key in next) {
    delete (next as Record<string, unknown>)[key];
  }
  return writeConfig(next);
}

export async function resetConfig(): Promise<void> {
  const configPath = defaultConfigPath();
  try {
    await fs.unlink(configPath);
  } catch (error) {
    if (typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function secureUnlinkConfig(pathToDelete = defaultConfigPath()): Promise<void> {
  try {
    await fs.unlink(pathToDelete);
  } catch (error) {
    if (typeof error === 'object' && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function ensureConfigAccessConfigPermissions(): Promise<{
  configured: boolean;
  readable: boolean;
}> {
  const configPath = defaultConfigPath();
  try {
    await fs.access(configPath, constants.R_OK | constants.W_OK);
    return { configured: true, readable: true };
  } catch {
    return { configured: false, readable: false };
  }
}
