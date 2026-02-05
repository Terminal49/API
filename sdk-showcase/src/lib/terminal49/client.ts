import { Terminal49Client } from '@terminal49/sdk';

/**
 * Creates a Terminal49 SDK client singleton for server-side use.
 *
 * SDK Method Coverage:
 * - This client provides access to all SDK methods
 * - Resource namespaces: shipments, containers, trackingRequests, shippingLines
 * - Direct methods: search, getDemurrage, getRailMilestones, trackContainer
 */

let clientInstance: Terminal49Client | null = null;

/**
 * Check if the API token is configured
 */
export function hasApiToken(): boolean {
  return !!process.env.T49_API_TOKEN;
}

export function getClient(): Terminal49Client {
  if (!clientInstance) {
    const apiToken = process.env.T49_API_TOKEN;

    if (!apiToken) {
      throw new Error(
        'T49_API_TOKEN environment variable is required. ' +
        'Get your API key from https://app.terminal49.com/settings/api'
      );
    }

    clientInstance = new Terminal49Client({
      apiToken,
      defaultFormat: 'mapped', // Use mapped format for cleaner responses
    });
  }

  return clientInstance;
}

/**
 * Get a fresh client instance (useful for testing or when token changes)
 */
export function createClient(apiToken?: string): Terminal49Client {
  const token = apiToken || process.env.T49_API_TOKEN;

  if (!token) {
    throw new Error('API token is required');
  }

  return new Terminal49Client({
    apiToken: token,
    defaultFormat: 'mapped',
  });
}
