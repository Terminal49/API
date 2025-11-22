/**
 * Tests for environment configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getConfig, resetConfig } from '../../src/config/env';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetConfig();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it('should load configuration from environment variables', () => {
    process.env.TERMINAL49_API_KEY = 'Token test_key_123';
    process.env.TERMINAL49_API_BASE_URL = 'https://test.terminal49.com/v2';

    const config = loadConfig();

    expect(config.apiKey).toBe('Token test_key_123');
    expect(config.baseUrl).toBe('https://test.terminal49.com/v2');
  });

  it('should use default base URL if not provided', () => {
    process.env.TERMINAL49_API_KEY = 'Token test_key_123';

    const config = loadConfig();

    expect(config.baseUrl).toBe('https://api.terminal49.com/v2');
  });

  it('should throw error if API key is missing', () => {
    delete process.env.TERMINAL49_API_KEY;

    expect(() => loadConfig()).toThrow('Missing required environment variable: TERMINAL49_API_KEY');
  });

  it('should cache configuration', () => {
    process.env.TERMINAL49_API_KEY = 'Token test_key_123';

    const config1 = getConfig();
    const config2 = getConfig();

    expect(config1).toBe(config2);
  });

  it('should reset cached configuration', () => {
    process.env.TERMINAL49_API_KEY = 'Token test_key_123';

    const config1 = getConfig();
    resetConfig();

    process.env.TERMINAL49_API_KEY = 'Token different_key';
    const config2 = getConfig();

    expect(config1.apiKey).toBe('Token test_key_123');
    expect(config2.apiKey).toBe('Token different_key');
  });
});
