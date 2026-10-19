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
 * run in one call. Tier `C` writes need the user's approval of a preview.
 */
export type ToolTier = 'read' | 'A' | 'C';

/**
 * When a tier C tool asks the user. `always`: every call previews first.
 * `destructive_only`: a batch tool that asks only when a record in the call
 * would lose a value or a party, and otherwise writes at once.
 */
export type ConfirmationScope = 'always' | 'destructive_only';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

interface ToolBase {
  name: string;
  title: string;
  toolset: Toolset;
  annotations: ToolAnnotations;
}

export type ToolDefinition =
  | (ToolBase & { tier: 'read' | 'A' })
  | (ToolBase & { tier: 'C'; confirms: ConfirmationScope });

function readTool<const Name extends string>(
  name: Name,
  title: string,
  toolset: Toolset = 'core',
): ToolDefinition & { name: Name; tier: 'read' } {
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
  readTool('identify_tracking_number', 'Identify Tracking Number'),
  readTool('get_container', 'Get Container Details'),
  readTool('get_shipment_details', 'Get Shipment Details'),
  readTool('get_container_transport_events', 'Get Container Transport Events'),
  readTool('get_supported_shipping_lines', 'Get Supported Shipping Lines'),
  readTool('get_container_route', 'Get Container Route'),
  readTool('get_location', 'Get Location'),
  readTool('get_vessel', 'Get Vessel'),
  readTool('list_shipments', 'List Shipments'),
  readTool('list_containers', 'List Containers'),
  readTool('summarize_containers', 'Summarize Containers'),
  readTool('list_parties', 'List Parties'),
  // A replace or detach removes the party that held the role, and a set or
  // clear overwrites the field value, so both are marked destructive.
  {
    name: 'set_party_role',
    title: 'Set Party Role',
    toolset: 'operations',
    tier: 'C',
    confirms: 'destructive_only',
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
    toolset: 'operations',
    tier: 'C',
    confirms: 'destructive_only',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  readTool('list_custom_field_definitions', 'List Custom Field Definitions'),
  readTool('list_tracking_requests', 'List Tracking Requests'),
  readTool('get_tracking_request', 'Get Tracking Request'),
  readTool('list_documents', 'List Documents', 'documents'),
  readTool('get_document', 'Get Document', 'documents'),
  {
    name: 'stop_shipment_tracking',
    title: 'Stop Shipment Tracking',
    toolset: 'operations',
    tier: 'C',
    confirms: 'always',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'resume_shipment_tracking',
    title: 'Resume Shipment Tracking',
    toolset: 'operations',
    tier: 'A',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'cancel_tracking_request',
    title: 'Cancel Tracking Request',
    toolset: 'operations',
    tier: 'C',
    confirms: 'always',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'add_reference_numbers',
    title: 'Add Reference Numbers',
    toolset: 'operations',
    tier: 'A',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'remove_reference_numbers',
    title: 'Remove Reference Numbers',
    toolset: 'operations',
    tier: 'C',
    confirms: 'always',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'relink_document',
    title: 'Relink Document',
    toolset: 'documents_write',
    tier: 'A',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'update_document',
    title: 'Update Document',
    toolset: 'documents_write',
    tier: 'C',
    confirms: 'always',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
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
  readTool('list_webhooks', 'List Webhooks', 'developer'),
  readTool(
    'list_webhook_notifications',
    'List Webhook Notifications',
    'developer',
  ),
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
  'operations',
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
