import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fields = [
  'name',
  'city',
  'state',
  'country',
  'locode',
  'firmsCode',
  'splc',
];
const scope =
  'Enabled inland rail terminals in the Terminal49 location catalog';
const canonicalPath = 'docs/data/coverage/inland-rail-terminals.json';
const pagePath = 'docs/coverage/inland-rail-terminals.mdx';
const start = '{/* rail-terminal-agent-data:start */}';
const end = '{/* rail-terminal-agent-data:end */}';

export function normalizeRailTerminals(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected a rail terminal catalog object');
  const rootFields = ['updatedOn', 'scope', 'count', 'terminals'];
  if (Object.keys(input).some((key) => !rootFields.includes(key)))
    throw new Error('Unexpected catalog field');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.updatedOn) ||
    new Date(input.updatedOn).toISOString().slice(0, 10) !== input.updatedOn
  )
    throw new Error('Invalid updatedOn date');
  if (input.scope !== scope) throw new Error('Invalid catalog scope');
  if (
    !Array.isArray(input.terminals) ||
    input.terminals.length === 0 ||
    input.count !== input.terminals.length
  )
    throw new Error('Catalog count does not match nonempty terminal list');
  const identities = new Set();
  const terminals = input.terminals
    .map((terminal) => {
      if (
        !terminal ||
        typeof terminal !== 'object' ||
        Array.isArray(terminal) ||
        Object.keys(terminal).some((key) => !fields.includes(key))
      )
        throw new Error('Unexpected terminal field');
      const normalized = Object.fromEntries(
        fields.map((key) => {
          const value = terminal[key] ?? '';
          if (typeof value !== 'string' || /[\r\n]/.test(value))
            throw new Error(`Terminal ${key} must be a single-line string`);
          return [key, value.trim()];
        }),
      );
      if (
        !normalized.name ||
        !normalized.country ||
        !/^[A-Z]{2}[A-Z0-9]{3}$/.test(normalized.locode)
      )
        throw new Error('Terminal requires name, country, and valid UN/LOCODE');
      const identity = JSON.stringify([
        normalized.name,
        normalized.locode,
        normalized.firmsCode,
        normalized.splc,
      ]);
      if (identities.has(identity))
        throw new Error('Duplicate terminal identity');
      identities.add(identity);
      return normalized;
    })
    .sort((a, b) => {
      const aKey = JSON.stringify([
        a.country,
        a.city,
        a.name,
        a.locode,
        a.firmsCode,
        a.splc,
      ]);
      const bKey = JSON.stringify([
        b.country,
        b.city,
        b.name,
        b.locode,
        b.firmsCode,
        b.splc,
      ]);
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
  return {
    updatedOn: input.updatedOn,
    scope,
    count: terminals.length,
    terminals,
  };
}

const markdownCell = (value) =>
  (value || 'Not listed')
    .replace(/&/g, '&amp;')
    .replace(/[|<>{}]/g, (character) => `&#${character.charCodeAt(0)};`);
const csvCell = (value) => `"${value.replace(/"/g, '""')}"`;

export function railTerminalArtifacts(input, page) {
  const catalog = normalizeRailTerminals(input);
  const table = [
    '| Terminal | City | State / province | Country | UN/LOCODE | FIRMS | SPLC |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...catalog.terminals.map(
      (terminal) =>
        `| ${fields.map((key) => markdownCell(terminal[key])).join(' | ')} |`,
    ),
  ].join('\n');
  const reference = `This complete directory lists ${catalog.count} enabled inland rail terminals in Terminal49's location catalog. Location listing does not guarantee every carrier field or milestone at every facility. See [rail carrier coverage](/coverage/rail) for feature coverage. Rail last free day requires the [Rail Plan](/api-docs/useful-info/entitlements).\n\n[JSON](/data/coverage/inland-rail-terminals.json) · [CSV](/data/coverage/inland-rail-terminals.csv)\n\n${table}\n\nLast updated ${catalog.updatedOn}. We continually improve our integrations, so coverage may have changed since this date. Contact [support](mailto:support@terminal49.com) to confirm coverage for your route.\n`;
  if (
    page.split(start).length !== 2 ||
    page.split(end).length !== 2 ||
    page.indexOf(start) > page.indexOf(end)
  )
    throw new Error('Expected one ordered agent data marker pair');
  const updatedPage = `${page.slice(0, page.indexOf(start) + start.length)}\n<Visibility for="agents">\n\n${reference}\n</Visibility>\n${page.slice(page.indexOf(end))}`;
  return {
    [canonicalPath]: `${JSON.stringify(catalog, null, 2)}\n`,
    'docs/snippets/data-sources/rail-terminal-data.mdx': `export const railTerminalUpdatedOn = ${JSON.stringify(catalog.updatedOn)}\n\nexport const railTerminals = ${JSON.stringify(catalog.terminals, null, 2)}\n`,
    'docs/data/coverage/inland-rail-terminals.csv': `${fields.join(',')}\n${catalog.terminals.map((terminal) => fields.map((key) => csvCell(terminal[key])).join(',')).join('\n')}\n`,
    'docs/data/coverage/inland-rail-terminals.mdx': `---\ntitle: "Inland rail terminal directory"\ndescription: "Complete structured table of enabled inland rail terminal locations and facility codes. Code values are strings; blank codes are not listed."\nmode: "wide"\n---\n\n${reference}`,
    [pagePath]: updatedPage,
  };
}

function main(args) {
  const validArgs =
    args.length === 0 ||
    (args.length === 1 && args[0] === '--check') ||
    (args.length === 2 && args[0] === '--import' && !args[1].startsWith('--'));
  if (!validArgs)
    throw new Error(
      'Usage: node tools/generate-rail-terminals.mjs [--check | --import file]',
    );
  const importIndex = args.indexOf('--import');
  if (
    importIndex !== -1 &&
    (!args[importIndex + 1] || args[importIndex + 1].startsWith('--'))
  )
    throw new Error('--import requires a JSON file');
  const source =
    importIndex === -1
      ? resolve(root, canonicalPath)
      : resolve(args[importIndex + 1]);
  const input = JSON.parse(readFileSync(source, 'utf8'));
  const artifacts = railTerminalArtifacts(
    input,
    readFileSync(resolve(root, pagePath), 'utf8'),
  );
  const drift = [];
  for (const [path, contents] of Object.entries(artifacts)) {
    if (args.includes('--check')) {
      try {
        if (readFileSync(resolve(root, path), 'utf8') !== contents)
          drift.push(path);
      } catch {
        drift.push(path);
      }
    } else writeFileSync(resolve(root, path), contents);
  }
  if (drift.length)
    throw new Error(
      `Rail terminal generated files are stale: ${drift.join(', ')}`,
    );
  process.stdout.write(
    `Rail terminal catalog: ${input.terminals.length} locations; ${args.includes('--check') ? 'generated files match' : 'generated files updated'}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main(process.argv.slice(2));
