/**
 * HTTP client for Terminal49 API using openapi-fetch
 */

import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../generated/terminal49.js';
import { getConfig } from '../config/env.js';

/**
 * Terminal49 API error class
 */
export class Terminal49Error extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'Terminal49Error';
  }
}

/**
 * Create a configured Terminal49 API client
 */
export function createTerminal49Client(): Client<paths> {
  const config = getConfig();

  const client = createClient<paths>({
    baseUrl: config.baseUrl,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  // Add authentication middleware
  client.use({
    async onRequest({ request }) {
      const apiKey = config.apiKey;
      const authHeader = apiKey.startsWith('Token ') ? apiKey : `Token ${apiKey}`;
      request.headers.set('Authorization', authHeader);
      return request;
    },
    async onResponse({ response }) {
      // Log errors but don't modify response
      if (!response.ok) {
        console.error(`Terminal49 API error: ${response.status} ${response.statusText}`);
      }
      return response;
    },
  });

  return client;
}

/**
 * Singleton client instance
 */
let clientInstance: Client<paths> | null = null;

/**
 * Get the Terminal49 API client (singleton)
 */
export function getClient(): Client<paths> {
  if (!clientInstance) {
    clientInstance = createTerminal49Client();
  }
  return clientInstance;
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetClient(): void {
  clientInstance = null;
}

/**
 * Helper to handle API responses and convert errors
 * Takes the result from openapi-fetch client methods
 */
export function handleResponse<T>(
  result: { data?: T; error?: unknown; response: Response }
): T {
  const { data, error, response } = result;

  if (error || !data) {
    const errorMessage = typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'Terminal49 API request failed';

    throw new Terminal49Error(
      errorMessage,
      response.status,
      response.statusText,
      error
    );
  }

  return data;
}
