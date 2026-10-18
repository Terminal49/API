/**
 * Decides which toolsets one MCP request gets.
 *
 * The operator's T49_MCP_TOOLSETS is the allowlist. A request header can
 * only narrow it, and toolsets are never read from the connector URL, so the
 * OAuth resource stays the root origin.
 */
import {
  DEFAULT_TOOLSETS,
  TOOLSETS,
  type Toolset,
  type ToolSelection,
} from './tools/registry.js';
import type { McpCredentialType } from './tools/context.js';

export const TOOLSETS_HEADER = 'X-T49-MCP-Toolsets';
export const READ_ONLY_HEADER = 'X-T49-MCP-Read-Only';

/** Toolsets the shared env token gets without T49_MCP_ALLOW_SHARED_TOKEN_WRITES. */
const SHARED_TOKEN_TOOLSETS: readonly Toolset[] = ['core', 'trade'];

/** A request header that the gateway answers with 400. */
export class ToolSelectionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolSelectionRequestError';
  }
}

export interface ToolSelectionInput {
  env: NodeJS.ProcessEnv;
  credentialType: McpCredentialType;
  /** Raw X-T49-MCP-Toolsets header value. */
  toolsetsHeader?: string;
  /** Raw X-T49-MCP-Read-Only header value. */
  readOnlyHeader?: string;
}

function isToolset(name: string): name is Toolset {
  return TOOLSETS.some((toolset) => toolset === name);
}

/** Returns undefined when the list is empty or names an unknown toolset. */
function parseToolsetList(value: string): Toolset[] | undefined {
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.length > 0 && names.every(isToolset) ? names : undefined;
}

/** Returns undefined for an unset value and null for an unrecognized one. */
function parseFlag(value: string | undefined): boolean | undefined | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return null;
}

function envFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const flag = parseFlag(env[name]);
  if (flag === null) {
    throw new Error(`${name} must be true, false, 1 or 0.`);
  }
  return flag ?? false;
}

function allowedToolsets(
  env: NodeJS.ProcessEnv,
  credentialType: McpCredentialType,
): readonly Toolset[] {
  const configured = env.T49_MCP_TOOLSETS?.trim();
  const allowed = configured ? parseToolsetList(configured) : DEFAULT_TOOLSETS;
  if (!allowed) {
    throw new Error(
      `T49_MCP_TOOLSETS must list only these toolsets: ${TOOLSETS.join(', ')}.`,
    );
  }

  // One shared T49_API_TOKEN cannot tell callers apart, so it stays on core
  // and the read-only trade toolset unless the operator opts in.
  if (
    credentialType === 'shared_token' &&
    !envFlag(env, 'T49_MCP_ALLOW_SHARED_TOKEN_WRITES')
  ) {
    return allowed.filter((toolset) => SHARED_TOKEN_TOOLSETS.includes(toolset));
  }
  return allowed;
}

/**
 * Resolves the toolsets and read-only mode for one request. Throws
 * ToolSelectionRequestError for a malformed header and Error for a
 * malformed server env.
 */
export function resolveToolSelection(input: ToolSelectionInput): ToolSelection {
  const allowed = allowedToolsets(input.env, input.credentialType);

  let toolsets = allowed;
  if (input.toolsetsHeader?.trim()) {
    const requested = parseToolsetList(input.toolsetsHeader);
    if (!requested) {
      throw new ToolSelectionRequestError(
        `${TOOLSETS_HEADER} must list only these toolsets: ${TOOLSETS.join(', ')}.`,
      );
    }
    toolsets = allowed.filter((toolset) => requested.includes(toolset));
  }

  const readOnlyHeader = parseFlag(input.readOnlyHeader);
  if (readOnlyHeader === null) {
    throw new ToolSelectionRequestError(
      `${READ_ONLY_HEADER} must be true, false, 1 or 0.`,
    );
  }

  return {
    toolsets,
    readOnly:
      envFlag(input.env, 'T49_MCP_READ_ONLY') || readOnlyHeader === true,
  };
}
