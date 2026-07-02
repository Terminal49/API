import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type CliResponseFormat = 'raw' | 'mapped' | 'both';
export interface CliConfig {
  version: number;
  token?: string;
  baseUrl?: string;
  defaultFormat?: CliResponseFormat;
  maxRetries?: number;
  accountId?: string;
  timeoutMs?: number;
}

const CONFIG_VERSION = 1;

function getConfigDirectory(): string {
  const explicitXdg = process.env.XDG_CONFIG_HOME;
  if (explicitXdg && explicitXdg.trim() !== '') {
    return path.join(explicitXdg, 'terminal49');
  }

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
  if (
    raw.defaultFormat === 'raw' ||
    raw.defaultFormat === 'mapped' ||
    raw.defaultFormat === 'both'
  ) {
    output.defaultFormat = raw.defaultFormat;
  }
  if (typeof raw.maxRetries === 'number' && Number.isFinite(raw.maxRetries)) {
    output.maxRetries = Math.max(0, Math.floor(raw.maxRetries));
  }
  if (typeof raw.accountId === 'string' && raw.accountId.trim() !== '') {
    output.accountId = raw.accountId.trim();
  }
  if (typeof raw.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs)) {
    output.timeoutMs = Math.max(0, Math.floor(raw.timeoutMs));
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
  let content: string;

  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { version: CONFIG_VERSION };
    }
    throw new Error(
      `config file at ${configPath} is corrupt/unreadable: ${formatConfigError(error)}`,
    );
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object');
    }
    return sanitizeConfig(parsed as Record<string, unknown>);
  } catch (error) {
    throw new Error(
      `config file at ${configPath} is corrupt/unreadable: ${formatConfigError(error)}`,
    );
  }
}

export async function writeConfig(
  input: Partial<CliConfig>,
): Promise<CliConfig> {
  const merged = sanitizeConfig({
    ...((await loadConfig()) as unknown as Record<string, unknown>),
    ...(input as unknown as Record<string, unknown>),
  });

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

export async function resetConfig(): Promise<void> {
  const configPath = defaultConfigPath();
  try {
    await fs.unlink(configPath);
  } catch (error) {
    if (
      typeof error !== 'object' ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error;
    }
  }
}

function formatConfigError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
