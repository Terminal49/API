import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const spec = JSON.parse(
  fs.readFileSync(path.join(sdkRoot, '../../docs/openapi.json'), 'utf8'),
);
const params = (entity) => spec.paths[`/${entity}s`].get.parameters;
const filters = (entity) =>
  params(entity).filter((p) => p['x-t49-filter-kind']);
const key = (p) => p['x-t49-filter-key'] || p.name.slice(7, -1);
const statuses = filters('container').find((p) => key(p) === 'current_status')[
  'x-t49-values'
];
const roles = Object.keys(
  filters('container').find((p) => key(p) === 'parties').schema.properties,
);
let output = `/** Generated from docs/openapi.json. Run npm run generate:types; do not edit. */\n`;
output += `import type { ContainerInclude, IncludeParam, ShipmentInclude } from '../types/options.js';\n`;
output += `export const CONTAINER_STATUSES = ${JSON.stringify(statuses)} as const;\n`;
output += `export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];\n`;
output += `export const PARTY_ROLES = ${JSON.stringify(roles)} as const;\n`;
output += `export type PartyRole = (typeof PARTY_ROLES)[number];\n`;
output += `/** Comparison expressions are validated at runtime; arrays combine bounds with AND. */\nexport type DateFilter = string | readonly string[];\n`;
output += `/** Generic string arrays use AND. Use comma-separated literals for OR unless specified otherwise. */\nexport type StringFilter = string | readonly string[];\n`;
output += `export type PartyFilter = StringFilter | { value: StringFilter; operator?: 'any' | 'all' };\n`;
output += `export type ContainerStatusFilter = ContainerStatus | \`=\${ContainerStatus}\` | \`\${ContainerStatus},\${string}\` | '@exists' | '@not_exists' | readonly ContainerStatus[];\n`;
for (const entity of ['shipment', 'container']) {
  const name = entity[0].toUpperCase() + entity.slice(1);
  const entries = filters(entity);
  const kinds = Object.fromEntries(
    entries.map((p) => [key(p), p['x-t49-filter-kind']]),
  );
  output += `export const ${entity.toUpperCase()}_FILTER_KINDS = ${JSON.stringify(kinds, null, 2)} as const;\n`;
  output += `/** Confirmed list filters; canonical names mirror API filter keys. */\nexport interface ${name}ListFilters {\n`;
  for (const p of entries) {
    const kind = p['x-t49-filter-kind'];
    const type = {
      boolean: 'boolean',
      selector: 'true',
      voyage: "'arrived' | 'on_ship'",
      status: 'ContainerStatusFilter',
      exact: 'StringFilter',
      search: 'string',
      string: 'StringFilter',
      date: 'DateFilter',
      datetime: 'DateFilter',
      range: 'readonly [string, string]',
      tags: 'StringFilter',
      party: 'PartyFilter',
      parties: 'Partial<Record<PartyRole, StringFilter>>',
    }[kind];
    if (!type) throw new Error(`Unknown filter kind: ${kind}`);
    const documentation = p.description
      .replaceAll('*/', '* /')
      .replace(/@(exists|not_exists)/g, '`@$1`')
      .replace(/(<=|>=|<|>)/g, '`$1`');
    const fieldType = key(p) === 'search_by_owner_id' ? 'string' : type;
    output += `/** ${documentation} */\n${key(p)}?: ${fieldType};\n`;
  }
  output += `include?: IncludeParam<${name}Include>;\n/** Supported API sort token(s); validated before the request. */\nsort?: string;\n`;
  output += `/** @deprecated Use pod_code. */\nport?: string;\n`;
  if (entity === 'shipment') {
    output += `includeContainers?: boolean;\n/** @deprecated Use tracking_stopped. */\ntrackingStopped?: boolean;\n/** @deprecated Unsupported. Use voyage_status for voyage arrival state. */\nstatus?: string;\n/** @deprecated Unsupported on shipments; use containers.shipping_line_scac. */\ncarrier?: string;\n`;
  } else {
    output += `/** @deprecated Use current_status and its documented values. */\nstatus?: string;\n/** @deprecated Use shipping_line_scac. */\ncarrier?: string;\n`;
  }
  output += `/** @deprecated Timestamp semantics cannot be preserved by a date-only filter. */\nupdatedAfter?: string;\n}\n`;
}
fs.writeFileSync(path.join(sdkRoot, 'src/generated/list-filters.ts'), output);

const escape = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('|', '&#124;');
const shapes = {
  boolean: 'Boolean',
  selector: 'true selector',
  voyage: 'arrived / on_ship',
  status: 'Known status / CSV / presence',
  exact: 'Exact string / OR array',
  search: 'Search text',
  string: 'Exact string / CSV / array / presence',
  date: 'Date expression / bounds',
  datetime: 'Timestamp expression / bounds',
  range: 'Two-date range',
  tags: 'Tag names / array',
  party: 'IDs / any-all object',
  parties: 'Role-to-IDs object',
};
let reference = `---\ntitle: "Shipment and Container Filter Reference"\nsidebarTitle: "List filters"\ndescription: "Exact public list filter names, values, operators, combination rules, and limitations for shipments and containers."\n---\n\n{/* Generated from docs/openapi.json by the SDK generate:types command. */}\n\nUse these filters on \`GET /shipments\` and \`GET /containers\`. The SDK accepts the same canonical names without the \`filter[...]\` wrapper. Read [filter usage](/api-docs/in-depth-guides/filtering-shipments-and-containers) for complete request examples and [SDK filtering](/sdk/filtering-pagination) for TypeScript examples.\n\n## Composition and values\n\nExamples are synthetic or illustrative values. Replace dynamic identifiers and names with values from authorized API results; syntactic validity does not guarantee existence in your account.\n\nDifferent filter keys combine with **AND**. Within a key, scalar comma-separated values generally use **OR**; bracketed arrays generally use **AND**. Shipment \`number\`, port codes, owner IDs, terminal IDs, party IDs, and tags have the exceptions documented below. Never assume an array means OR for every field.\n\nDate comparisons use \`=\`, \`<\`, \`<=\`, \`>\`, or \`>=\`. Encode a range as repeated bracketed array keys, such as \`filter[pickup_lfd][]=FROM\` and \`filter[pickup_lfd][]=TO\`, with comparison operators in the values where the filter supports them. Presence expressions are exactly \`@exists\` and \`@not_exists\`. Text search is supported by shipment \`q\`/\`product\` and container \`search_by_*\` filters; \`~\` on an exact string filter is invalid.\n\n### Finite vocabularies\n\nContainer \`current_status\` values are ${statuses.map((s) => `\`${s}\``).join(', ')}. Terms such as \`in_transit\`, \`discharged\`, and \`available_for_pickup\` are not current-status codes. Shipment \`voyage_status\` values are only \`arrived\` and \`on_ship\`.\n\nParty roles are ${roles.map((r) => `\`${r}\``).join(', ')}. Party match operators are \`any\` and \`all\`. Boolean filters use literal \`true\` and \`false\`; the SDK supplies their exact wire representation.\n\n### Account-defined and lookup values\n\nPort codes, terminal IDs, carrier SCACs, user/account/party IDs, tags, and product text are not finite universal enums. Use values from authorized API results. Port and terminal relationships can be loaded with [include](/api-docs/in-depth-guides/including-resources); carrier codes come from [shipping lines](/api-docs/api-reference/shipping-lines/shipping-lines); party IDs come from the parties associated with your account. User ownership IDs and creator account IDs are different identifiers. A random or inaccessible ID can return no matches. Supplying an ID never expands account access.\n\n## Shipment filters\n\n| API parameter | SDK field | Shape | Example | Semantics and restrictions |\n| --- | --- | --- | --- | --- |\n`;
for (const p of filters('shipment'))
  reference += `| \`${p.name}\` | \`${key(p)}\` | ${shapes[p['x-t49-filter-kind']]} | \`${JSON.stringify(p.example)}\` | ${escape(p.description)} |\n`;
reference += `\n### Shipment aliases\n\nTop-level \`number\`, \`q\`, and \`tracking_stopped\` are compatibility aliases; nested filters take precedence. Top-level \`q\` is deprecated, and a blank top-level \`q\` returns 400. No sunset date is documented. Shipment \`number\` is an exact shipment-number lookup, not a container-number search.\n\n### Shipment combinations to avoid\n\n- \`actively_tracked=true\` with \`tracking_stopped=true\`, or both false: contradictory tracking populations.\n- \`voyage_status=arrived\` with \`pod_ata_at=@not_exists\`: arrived requires actual POD arrival.\n- \`voyage_status=on_ship\` with \`pod_ata_at=@exists\`: on_ship requires actual POD arrival to be absent.\n- \`pod_eta_changed_at\` with stopped tracking or \`voyage_status=arrived\`: the ETA-change filter already selects active, unarrived voyages.\n- \`arriving_today\` as a substitute for \`pod_arrival\`: arriving_today also checks destination milestones.\n\nThe API generally returns no matches for contradictory scopes. The SDK rejects the proven contradictions above and malformed inputs before sending a request.\n\n## Container filters\n\n| API parameter | SDK field | Shape | Example | Semantics and restrictions |\n| --- | --- | --- | --- | --- |\n`;
for (const p of filters('container'))
  reference += `| \`${p.name}\` | \`${key(p)}\` | ${shapes[p['x-t49-filter-kind']]} | \`${JSON.stringify(p.example)}\` | ${escape(p.description)} |\n`;
reference += `\n### Missing data and selectors\n\n\`has_holds=false\` means an explicitly empty terminal holds array; it does not mean “no reported hold information.” Likewise, fee selectors can exclude containers without terminal data. Do not infer total account coverage by adding true and false counts. \`requires_attention=false\` is not the exact complement of true because true also checks deadline and pickup predicates.\n\nThe API treats \`eta_changed_in_last_24h=false\` and \`eta_changed_in_past_3_days=false\` as positive selectors. It treats shipment \`arriving_today=false\` as a no-op. Omit these filters to disable them; the SDK accepts only true. Relative dates and “today” use the API's server day, while ETA-change comparisons evaluate meaningful changes to the POD-local ETA date.\n\n### Currently unavailable container filters\n\nThe following controller-defined inputs did not provide usable filtering in authenticated deployed checks on 2026-10-05. They are excluded from the supported SDK/OpenAPI filter catalog pending API verification or correction.\n\n| Input | Observed limitation | Alternative |\n| --- | --- | --- |\n| \`filter[pod_eta_at]\` | Valid date and presence requests returned HTTP 500. | Use shipment POD-date filters; use container \`arrival\` when actual-or-estimated arrival is appropriate. |\n| \`filter[pod_ata_at]\` | Valid date and presence requests returned HTTP 500. | Use shipment \`pod_ata_at\`, or container \`pod_arrived_at\` when the container arrival milestone is appropriate. |\n| \`filter[custom_fields][API_SLUG]\` | Known account-defined slugs left results unfiltered in the verification account. | Read custom fields from authorized responses; do not claim a list has been scoped by this input. |\n\nThese alternatives have different milestone semantics; choose the one matching the question. The SDK produces an actionable ValidationError for the unavailable inputs.\n\n## Sorting and pagination\n\nSorting and \`include\` change order/response shape; they do not scope the collection. Shipment default order is newest creation first. Container default order is most recent status refresh first. Container pages cap at 50; larger API requests are truncated. Shipment requests use the SDK's conservative page-size cap of 100. Use page numbers starting at 1.\n\nThe SDK list methods return one page. Use \`links.next\` or a bounded iterator to continue. \`meta.total\` is the filtered collection total; it is not the number of rows fetched. Mark a row-based answer partial while more pages remain, and preserve every filter across subsequent pages.\n\nUnknown API filter keys and unknown party roles are ignored rather than rejected. The SDK rejects unknown keys/roles and unsupported sort tokens to prevent account-wide results from being mistaken for a scoped answer. Never treat an HTTP 200 response alone as proof that a filter applied.\n`;
fs.writeFileSync(
  path.join(sdkRoot, '../../docs/api-docs/api-reference/list-filters.mdx'),
  reference,
);
