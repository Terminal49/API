import { constants, promises as fs, type Stats } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
    await validateConfigDirectory(path.dirname(configPath));
    validatePrivate(await fs.lstat(configPath), false);
    const file = await fs.open(
      configPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      validatePrivate(await file.stat(), false);
      content = await file.readFile('utf8');
    } finally {
      await file.close();
    }
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

  await validateConfigDirectory(configDir);
  const tmp = path.join(configDir, `.config.${randomUUID()}.tmp`);
  const payload = JSON.stringify(merged, null, 2);
  const file = await fs.open(tmp, 'wx', 0o600);
  try {
    await file.writeFile(payload, 'utf8');
    await file.close();
    await fs.rename(tmp, configPath);
  } finally {
    await file.close();
    await fs.unlink(tmp).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }
  return merged;
}

export async function resetConfig(): Promise<void> {
  const configPath = defaultConfigPath();
  try {
    await validateConfigDirectory(path.dirname(configPath));
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

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function validatePrivate(stat: Stats, directory: boolean): void {
  if (directory ? !stat.isDirectory() : !stat.isFile()) {
    throw new Error('config must use a real directory and regular file');
  }
  if (
    process.platform !== 'win32' &&
    ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())
  ) {
    throw new Error(
      'config must be owned by the current user with private permissions',
    );
  }
}

async function validateConfigDirectory(directory: string): Promise<void> {
  validatePrivate(await fs.lstat(directory), true);
}
