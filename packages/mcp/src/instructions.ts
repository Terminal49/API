/**
 * Server-level instructions (MCP `ServerOptions.instructions`): a concise
 * operating guide handed to the LLM at initialize time so it understands the
 * ocean-tracking domain and how to chain the tools.
 *
 * The guide is built from the tools a server registers. A segment that names a
 * registry tool is dropped when that tool is not registered, so read-only and
 * narrowed sessions never point the model at a tool they do not serve.
 */
import { TOOL_REGISTRY, type ToolName } from './tools/registry.js';

interface Segment {
  text: string;
  /** Keep the segment only when this tool is not registered. */
  unless?: ToolName;
}

interface Paragraph {
  segments: readonly Segment[];
  /** Drop the paragraph when the server registers no tools. */
  aboutTools?: boolean;
}

const PARAGRAPHS: readonly Paragraph[] = [
  {
    segments: [
      {
        text: 'Terminal49 tracks ocean containers and shipments live from carriers and terminals. Data is real-time from ocean carriers (by SCAC, e.g. MAEU = Maersk) and US/Canada terminals, so values change between calls.',
      },
    ],
  },
  {
    segments: [
      {
        text: 'Domain vocabulary: SCAC = 4-letter carrier code; BOL = bill of lading and booking number identify a shipment; POL/POD = port of lading/discharge; LFD = last free day (pickup deadline before demurrage accrues); demurrage/detention = late fees; holds = customs/freight/terminal blocks preventing pickup; transport events = carrier milestones (vessel loaded, departed, arrived, discharged, rail, delivered); custom fields = account-defined fields (PO number, project manager, etc.) on containers and shipments',
      },
      {
        text: ", loaded with get_container include ['custom_fields'] or get_shipment_details include_custom_fields",
      },
      {
        text: '; list_custom_field_definitions lists their slugs, types and allowed values',
      },
      { text: '.' },
    ],
  },
  {
    aboutTools: true,
    segments: [
      {
        text: 'Only track_container changes Terminal49 account records: it creates a tracking request to begin monitoring a number and is marked non-read-only. The other tools only fetch data and are marked read-only.',
      },
      {
        text: 'These tools only fetch data and are marked read-only.',
        unless: 'track_container',
      },
      {
        text: " All tools except search_docs operate within the user's private Terminal49 account; search_docs searches the public Terminal49 documentation.",
      },
      {
        text: " All tools operate within the user's private Terminal49 account.",
        unless: 'search_docs',
      },
      { text: ' None delete or overwrite data.' },
    ],
  },
  {
    aboutTools: true,
    segments: [
      {
        text: 'Canonical chaining: start with search_container to resolve a container number / BOL / reference into Terminal49 UUIDs, then get_container or get_shipment_details for a snapshot, then get_container_transport_events for the milestone timeline (and get_container_route for ports, ETAs, and the current vessel if the account has Routing Data).',
      },
      {
        text: ' Use get_supported_shipping_lines to resolve a carrier name to its SCAC before track_container.',
      },
      {
        text: " Use identify_tracking_number to learn a number's type and likely carrier, and whether it is already tracked, without creating a tracking request.",
      },
      {
        text: ' Use list_parties to resolve a company name (customer, shipper, dray carrier) to a party ID before filtering containers by advanced_filters.parties.',
      },
      {
        text: ' Use list_containers / list_shipments / list_tracking_requests for fleet-level worklists.',
      },
      {
        text: ' Use get_location for a terminal address and FIRMS code, or the time zone of a port or terminal.',
      },
      {
        text: " Use get_vessel for a vessel's last reported position and, with Routing Data, its projected arrival at a port.",
      },
      {
        text: ' Call get_tracking_request with a request ID to check its status and get the shipment it created.',
      },
      {
        text: ' Use search_docs for how-to and API questions (webhooks, statuses, LFD rules, SDK, MCP) and cite the returned links.',
      },
      {
        text: ' Call whoami to learn which account and credential this session is bound to and which features it can use: when the user asks who they are or which account is connected, when a lookup returns nothing or an authorization error, or before relying on a gated feature such as routing, custom fields, or stop tracking.',
      },
    ],
  },
];

function mentionedTools(text: string): ToolName[] {
  return TOOL_REGISTRY.map((tool) => tool.name).filter((name) =>
    new RegExp(`\\b${name}\\b`).test(text),
  );
}

/** The instructions for a server that registers exactly these tools. */
export function buildServerInstructions(
  tools: readonly { name: ToolName }[],
): string {
  const registered = new Set(tools.map((tool) => tool.name));
  const keep = (segment: Segment) =>
    (!segment.unless || !registered.has(segment.unless)) &&
    mentionedTools(segment.text).every((name) => registered.has(name));

  return PARAGRAPHS.filter(
    (paragraph) => !paragraph.aboutTools || registered.size > 0,
  )
    .map((paragraph) =>
      paragraph.segments
        .filter(keep)
        .map((segment) => segment.text)
        .join('')
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}
