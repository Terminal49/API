/**
 * Terminal49 TypeScript SDK
 *
 * A TypeScript SDK for interacting with the Terminal49 API with MCP support.
 */

// Export domain models
export * from './domain/index.js';

// Export MCP tools
export * from './mcp/tools/index.js';

// Export configuration
export { loadConfig, getConfig, resetConfig } from './config/env.js';
export type { Terminal49Config } from './config/env.js';

// Export HTTP client utilities
export { getClient, resetClient, Terminal49Error, handleResponse } from './http/client.js';

// Export JSON:API utilities
export { jsona, deserialize, deserializeCollection } from './jsonapi/jsona-instance.js';

// Re-export commonly used types
export type {
  Shipment,
  Container,
  Port,
  Terminal,
  Vessel,
  TrackingRequest,
  Webhook,
  WebhookNotification,
  Party,
  ShippingLine,
  MetroArea,
  PaginatedResponse,
} from './domain/index.js';
