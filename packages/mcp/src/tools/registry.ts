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
  'trade',
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
  toolset: Toolset = 'core',
): ToolDefinition & { name: Name } {
  return {
    name,
    title,
    toolset,
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
  // A replace or detach removes the party that held the role, and a set or
  // clear overwrites the field value, so both are marked destructive.
  {
    name: 'set_party_role',
    title: 'Set Party Role',
    toolset: 'core',
    tier: 'A',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'set_custom_field',
    title: 'Set Custom Field',
    toolset: 'core',
    tier: 'A',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
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
  readTool('search_importers', 'Search US Importers', 'trade'),
  readTool('get_importer_profile', 'Get Importer Profile', 'trade'),
  readTool('search_commodities', 'Search Commodities', 'trade'),
  readTool('rank_importers', 'Rank US Importers', 'trade'),
  readTool('get_trade_trends', 'Get Trade Trends', 'trade'),
  readTool('get_trade_breakdown', 'Get Trade Breakdown', 'trade'),
  readTool('get_trade_data_coverage', 'Get Trade Data Coverage', 'trade'),
] as const satisfies readonly ToolDefinition[];

export type RegisteredTool = (typeof TOOL_REGISTRY)[number];

export type ToolName = RegisteredTool['name'];

/** Toolsets served when the operator sets no `T49_MCP_TOOLSETS`. */
export const DEFAULT_TOOLSETS: readonly Toolset[] = [
  'core',
  'documents',
  'trade',
];

export interface ToolSelection {
  toolsets: readonly Toolset[];
  /** Drop every tool whose readOnlyHint is false. */
  readOnly: boolean;
}

/** The registry entries a server with this selection registers, in order. */
export function selectTools(selection: ToolSelection): RegisteredTool[] {
  return TOOL_REGISTRY.filter(
    (tool) =>
      selection.toolsets.includes(tool.toolset) &&
      (tool.annotations.readOnlyHint || !selection.readOnly),
  );
}

/** The tools a server registers with the default toolsets. */
export function defaultTools(): RegisteredTool[] {
  return selectTools({ toolsets: DEFAULT_TOOLSETS, readOnly: false });
}
