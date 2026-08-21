/**
 * Query guidance resource for MCP clients and LLMs
 */

export const queryGuidanceResource = {
  uri: 'terminal49://docs/mcp-query-guidance',
  name: 'MCP Query Guidance',
  description:
    'Structured playbooks for common container logistics questions. Helps clients map user intent to tools and output shape.',
  mimeType: 'text/markdown',
};

export function readQueryGuidanceResource(): string {
  return [
    '# Terminal49 MCP Query Guidance',
    '',
    'Use this document to map user questions to tools without claiming that an unsupported filter was applied.',
    '',
    '## Glossary',
    '',
    '- **Container number:** an ISO 6346 equipment identifier, normally four letters followed by seven digits (including the check digit), such as `CAIU1234567`.',
    '- **Bill of Lading (BOL) / booking number:** shipment identifiers, not container numbers. A shipment can contain multiple containers.',
    '- **SCAC:** the four-letter Standard Carrier Alpha Code, such as `MAEU`. A carrier name such as "Maersk" or "Ocean Network Express" is not a SCAC.',
    '- **UN/LOCODE:** a five-character location code such as `USLAX`; use the code, not a city name such as "Los Angeles", when an API argument requires a LOCODE.',
    '- **POL / POD:** port of lading (origin loading port) / port of discharge (destination unloading port). Do not substitute one for the other.',
    '- **tracking_stopped:** a shipment boolean. `true` means Terminal49 is no longer polling the shipping line; `false` means tracking remains active.',
    '- **include:** related records to side-load, not a filter. Container includes include `shipment`, `pod_terminal`, and `transport_events`; transport events are the heaviest option.',
    '',
    '## Lookup and carrier playbook',
    '',
    '1. For a container number, BOL, booking number, or customer reference, call `search_container`. Do not try to find an identifier by inventing a list filter.',
    '2. Resolve a carrier name with `get_supported_shipping_lines` before any carrier-scoped call. Pass the returned SCAC; never pass `"Maersk"` or `"Ocean Network Express"` as a SCAC.',
    '3. Use the Terminal49 UUID returned by search with `get_container` or `get_shipment_details`.',
    '4. Use `get_container_transport_events` for the milestone timeline and `get_container_route` for multi-leg routing when available.',
    '',
    '## Honest list behavior',
    '',
    '- `list_containers` supports pagination and `include`; it has no server-side status, port, carrier, or updated-after filter.',
    '- `list_shipments` supports pagination, `include`, exact original tracking-request `number` (normally a BOL or booking number, not a container number), and `tracking_stopped`.',
    '- Requests such as "containers at USLAX", "Maersk fleet", or "recently updated containers/shipments" cannot currently be server-filtered with these list tools. Say so plainly; do not claim the returned page matches that scope.',
    '- If a list result has a non-empty `unsupportedFilters` array, those filters were not applied. Treat the page as unscoped and disclose the limitation.',
    '- `include` only changes related data in each row. It never narrows the result set.',
    '',
    '## Client-side operational analysis',
    '',
    '- "Discharged but not picked up": inspect the returned page client-side; keep rows where `podDischargedAt` is set and `podFullOutAt` is empty.',
    '- Holds: inspect `holdsAtPodTerminal`; there is no holds list filter.',
    '- Last Free Day (LFD) / demurrage risk: order the returned page client-side by `pickupLfd` and show `holdsAtPodTerminal`. The list endpoint has no server-side LFD sort.',
    '- These checks apply only to the page retrieved. Do not describe a page-level client-side selection as a complete account-wide result.',
    '',
    'Return concise status first. Call out holds explicitly. When dates are missing, explain that the feed is partial and suggest the event timeline as the next check.',
    '',
  ].join('\n');
}
