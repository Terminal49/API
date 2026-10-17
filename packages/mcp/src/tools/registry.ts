/**
 * The tool registry: every MCP tool's name, title, toolset, tier and
 * annotations. The server registers tools from it, and tests, smoke scripts
 * and docs derive tool counts from it.
 *
 * This module has no runtime imports so Node can load it directly from the
 * smoke scripts, which run without a build.
 */

export const TOOLSETS = [
  'core',
  'documents',
  'operations',
  'documents_write',
  'developer',
] as const;

export type Toolset = (typeof TOOLSETS)[number];

/**
 * `read` tools only fetch data. Tier `A` writes are additive or reversible and
 * run in one call. Tier `C` writes need a confirmation token.
 */
export type ToolTier = 'read' | 'A' | 'C';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  toolset: Toolset;
  tier: ToolTier;
  annotations: ToolAnnotations;
}

function readTool<const Name extends string>(
  name: Name,
  title: string,
): ToolDefinition & { name: Name } {
  return {
    name,
    title,
    toolset: 'core',
    tier: 'read',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  };
}

/** Registration order is the order clients see in tools/list. */
export const TOOL_REGISTRY = [
  readTool('search_container', 'Search Containers'),
  {
    name: 'track_container',
    title: 'Track Container',
    toolset: 'core',
    tier: 'A',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  readTool('get_container', 'Get Container Details'),
  readTool('get_shipment_details', 'Get Shipment Details'),
  readTool('get_container_transport_events', 'Get Container Transport Events'),
  readTool('get_supported_shipping_lines', 'Get Supported Shipping Lines'),
  readTool('get_container_route', 'Get Container Route'),
  readTool('list_shipments', 'List Shipments'),
  readTool('list_containers', 'List Containers'),
  readTool('summarize_containers', 'Summarize Containers'),
  readTool('list_parties', 'List Parties'),
  readTool('list_tracking_requests', 'List Tracking Requests'),
  {
    name: 'search_docs',
    title: 'Search Terminal49 Docs',
    toolset: 'core',
    tier: 'read',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  readTool('whoami', 'Who Am I'),
] as const satisfies readonly ToolDefinition[];

export type ToolName = (typeof TOOL_REGISTRY)[number]['name'];
