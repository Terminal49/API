/**
 * Environment configuration and validation
 */

export interface Terminal49Config {
  apiKey: string;
  baseUrl: string;
}

/**
 * Get environment variable with validation
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Load and validate Terminal49 configuration from environment
 */
export function loadConfig(): Terminal49Config {
  const apiKey = getRequiredEnv('TERMINAL49_API_KEY');
  const baseUrl = getOptionalEnv(
    'TERMINAL49_API_BASE_URL',
    'https://api.terminal49.com/v2'
  );

  // Validate API key format
  if (!apiKey.startsWith('Token ') && apiKey.length < 10) {
    throw new Error('TERMINAL49_API_KEY appears to be invalid');
  }

  return {
    apiKey,
    baseUrl,
  };
}

/**
 * Get current configuration (throws if not configured)
 */
let cachedConfig: Terminal49Config | null = null;

export function getConfig(): Terminal49Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}
