import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const spec = JSON.parse(
  readFileSync(new URL('../../../docs/openapi.json', import.meta.url), 'utf8'),
);
const scalarOrArray =
  'z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])';
const lines = [
  '// Generated from docs/openapi.json. Run npm run generate:filters --workspace @terminal49/mcp.',
  "import { z } from 'zod';",
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
      case 'party':
        schema = `z.union([${scalarOrArray}, z.strictObject({value: ${scalarOrArray}, operator: z.enum(['any', 'all']).optional()})])`;
        break;
      case 'parties':
        schema = `z.strictObject({${Object.keys(p.schema.properties)
          .map((role) => `${JSON.stringify(role)}: ${scalarOrArray}.optional()`)
          .join(',')}})`;
        break;
      case 'custom_fields':
        schema =
          'z.record(z.string().regex(/^[a-z0-9_]+$/), z.string().min(1).max(200))';
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
      `${JSON.stringify(key)}: ${schema}.describe(${JSON.stringify(p.description)}).optional(),`,
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
