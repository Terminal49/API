import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const spec = JSON.parse(
  readFileSync(new URL('../../../docs/openapi.json', import.meta.url), 'utf8'),
);
const scalarOrArray =
  'z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])';
const describe = (schema, description) =>
  `${schema}.describe(${JSON.stringify(description)})`;

// Operator grammar that docs/openapi.json repeats on every filter of a kind.
// The MCP tools state it once on advanced_filters (FILTER_GRAMMAR), so each
// field describes only what it filters.
const EXACT_GRAMMAR = [
  'Exact match by default; optional =, @exists, or @not_exists.',
  'Comma-separated literals mean OR.',
  'Arrays mean AND unless the parameter description says otherwise.',
  '~ is not supported.',
];
const DATE_GRAMMAR = [
  'Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=.',
  'Arrays combine bounds with AND.',
  'Comma-separated dates mean OR.',
  'Use @exists or @not_exists for presence.',
  'Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
];
// Rules the generated Zod schema already enforces (the status pattern, the
// `true` literal of a selector, the strict parties object).
const SCHEMA_RULES = [
  /^Known values: [^.]*\.$/,
  /^Unknown values return no matches in the API; the SDK rejects them\.$/,
  /^Both true and false apply the positive selector in the API\.$/,
  /^The SDK accepts only true\.$/,
  /^Unknown roles are ignored by the API and rejected by the SDK\.$/,
];
const fieldDescription = (description) =>
  description
    .split(/(?<=\.) (?=\S)/)
    .filter(
      (sentence) =>
        !EXACT_GRAMMAR.includes(sentence) &&
        !DATE_GRAMMAR.includes(sentence) &&
        !SCHEMA_RULES.some((rule) => rule.test(sentence)),
    )
    .join(' ');
const PARTY_IDS = 'Get party IDs from list_parties.';
const lines = [
  '// Generated from docs/openapi.json. Run npm run generate:filters --workspace @terminal49/mcp.',
  "import { z } from 'zod';",
  '/** How exact-match list filters read their value. */',
  `export const EXACT_FILTER_GRAMMAR = ${JSON.stringify(EXACT_GRAMMAR.join(' '))};`,
  '/** How date list filters read their value. */',
  `export const DATE_FILTER_GRAMMAR = ${JSON.stringify(DATE_GRAMMAR.join(' '))};`,
];
for (const [entity, endpoint] of [
  ['SHIPMENT', '/shipments'],
  ['CONTAINER', '/containers'],
]) {
  const params = spec.paths[endpoint].get.parameters.filter(
    (p) => p['x-t49-filter-kind'],
  );
  const keys = params.map((p) => p['x-t49-filter-key']);
  if (new Set(keys).size !== keys.length)
    throw new Error(`Duplicate ${entity} canonical filter`);
  lines.push(
    `export const ${entity}_FILTER_KEYS = ${JSON.stringify(keys)} as const;`,
  );
  lines.push(`export const ${entity.toLowerCase()}FilterShape = {`);
  for (const p of params) {
    const key = p['x-t49-filter-key'];
    const kind = p['x-t49-filter-kind'];
    let schema;
    switch (kind) {
      case 'boolean':
        schema = 'z.boolean()';
        break;
      case 'selector':
        schema = 'z.literal(true)';
        break;
      case 'voyage':
        schema = "z.enum(['arrived', 'on_ship'])";
        break;
      case 'range':
        schema = 'z.tuple([z.string().min(1), z.string().min(1)])';
        break;
      case 'search':
        schema = 'z.string().min(1)';
        break;
      case 'party': {
        const value = describe(
          scalarOrArray,
          `One party ID, comma-separated IDs, or an array of IDs. ${PARTY_IDS}`,
        );
        const operator = describe(
          "z.enum(['any', 'all'])",
          'any matches a shipment linked to any of the IDs; all requires every ID.',
        );
        schema = `z.union([${scalarOrArray}, z.strictObject({value: ${value}, operator: ${operator}.optional()})])`;
        break;
      }
      case 'parties':
        schema = `z.strictObject({${Object.entries(p.schema.properties)
          .map(
            ([role, property]) =>
              `${JSON.stringify(role)}: ${describe(scalarOrArray, `${property.description} Matches parties in the ${role} role. ${PARTY_IDS}`)}.optional()`,
          )
          .join(',')}})`;
        break;
      case 'status': {
        const values = p['x-t49-values'];
        if (!Array.isArray(values) || !values.length)
          throw new Error('Missing status values');
        const atom = `(?:${values.join('|')})`;
        const pattern = `^(?:@exists|@not_exists|=?${atom}(?:,=?${atom})*)$`;
        const expression = `z.string().regex(new RegExp(${JSON.stringify(pattern)}))`;
        schema = `z.union([${expression}, z.array(${expression}).min(1)])`;
        break;
      }
      case 'string':
        schema =
          key === 'search_by_owner_id' ? 'z.string().min(1)' : scalarOrArray;
        break;
      case 'exact':
      case 'tags':
      case 'date':
      case 'datetime':
        schema = scalarOrArray;
        break;
      default:
        throw new Error(`Unknown filter kind: ${kind}`);
    }
    if (key === 'number' && entity === 'SHIPMENT')
      schema =
        'z.union([z.string().trim().min(1).max(64), z.array(z.string().trim().min(1).max(64)).min(1)])';
    lines.push(
      `${JSON.stringify(key)}: ${describe(schema, fieldDescription(p.description))}.optional(),`,
    );
  }
  lines.push('} as const;');
  const sort = spec.paths[endpoint].get.parameters.find(
    (p) => p.name === 'sort',
  );
  lines.push(
    `export const ${entity.toLowerCase()}SortSchema = z.string().min(1).describe(${JSON.stringify(sort.description)}).optional();`,
  );
}
const target = new URL(
  '../src/generated/list-filter-schemas.ts',
  import.meta.url,
);
mkdirSync(fileURLToPath(new URL('.', target)), { recursive: true });
writeFileSync(target, lines.join('\n') + '\n');

execFileSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../../../node_modules/vite-plus/bin/vp', import.meta.url),
    ),
    'fmt',
    '--write',
    fileURLToPath(target),
  ],
  { stdio: 'inherit' },
);
