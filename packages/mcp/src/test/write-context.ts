import type { Terminal49Client } from '@terminal49/sdk';
import {
  createToolContext,
  type ToolContext,
  type ToolSession,
} from '../tools/context.js';

export const TEST_ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
export const TEST_CONFIRMATION_SECRET =
  'a-test-secret-that-is-long-enough-to-sign';

/**
 * A tool context for write tests: an api_key session on TEST_ACCOUNT_ID with
 * a confirmation secret. /me comes from the client, so a test that needs
 * features must route GET /me.
 */
export function writeContext(
  client: Terminal49Client,
  session: Partial<ToolSession> = {},
): ToolContext {
  return createToolContext(client, {
    credentialType: 'api_key',
    toolsets: ['core', 'operations'],
    writeToolsAvailable: true,
    credentialHash: 'credential-hash',
    confirmationSecret: TEST_CONFIRMATION_SECRET,
    gatewayAccountId: TEST_ACCOUNT_ID,
    ...session,
  });
}

/** Captures what console.error receives, for checking audit events. */
export function auditEvents(
  lines: readonly string[],
): Record<string, unknown>[] {
  return lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.event === 'mcp.write.audit');
}

/** A raw GET /me body for an API key on TEST_ACCOUNT_ID with these features. */
export function meBody(features: Record<string, { status: string }> = {}) {
  return {
    data: {
      id: 'key-1',
      type: 'api_key',
      attributes: {
        kind: 'api_key',
        channel: 'api',
        name: 'Test key',
        features,
      },
      relationships: {
        account: { data: { id: TEST_ACCOUNT_ID, type: 'account' } },
      },
    },
    included: [
      {
        id: TEST_ACCOUNT_ID,
        type: 'account',
        attributes: { company_name: 'Acme Logistics' },
      },
    ],
  };
}
