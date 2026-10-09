import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'docs/data/coverage');
const allowedFields = {
  terminals: [
    'name',
    'port',
    'locode',
    'country',
    'region',
    'firmsCode',
    'features',
  ],
  shippingLines: [
    'name',
    'legalName',
    'scac',
    'alternativeScacs',
    'access',
    'features',
  ],
  railCarriers: ['name', 'scac', 'group', 'features'],
};
const statuses = new Set([
  'supported',
  'limited',
  'unsupported',
  'unknown',
  'signed_in_only',
]);
const types = [
  ['terminals', 'terminals', 'Terminal'],
  ['shippingLines', 'shipping-lines', 'Shipping line'],
  ['railCarriers', 'rail-carriers', 'Rail carrier'],
];
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const read = (name) => readFile(path.join(root, name), 'utf8');
const exportValue = (source, name) =>
  JSON.parse(
    source.match(
      new RegExp('export const ' + name + ' = ([\\s\\S]*?);'),
    )?.[1] ?? 'null',
  );
const camelCase = (label) =>
  label
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    .map((word, index) =>
      index ? word[0].toUpperCase() + word.slice(1) : word,
    )
    .join('');
const normalizeStatus = (status) =>
  status === 'not_supported' ? 'unsupported' : (status ?? 'unknown');
const statusLabel = (status) =>
  ({
    supported: 'Supported',
    limited: 'Partial',
    unsupported: 'Not supported',
    unknown: 'Unknown',
    signed_in_only: 'Carrier credentials required',
  })[status];
const terminalDefinitions = [
  ['importMilestones', 'Import milestones', 'Container milestones'],
  ['availableForPickup', 'Available for pickup', 'Pickup & availability'],
  ['lastFreeDay', 'Terminal LFD', 'Pickup & availability'],
  ['holds', 'Holds & releases', 'Holds & fees'],
  ['feeType', 'Fee type', 'Holds & fees'],
  ['feeAmount', 'Fee amount', 'Holds & fees'],
  ['pickupAppointment', 'Pickup appointment', 'Gate & yard'],
  ['yardLocation', 'Yard location', 'Gate & yard'],
  ['vesselDischarged', 'Vessel discharged', 'Container milestones'],
  ['fullOut', 'Full out', 'Container milestones'],
  ['chassisNumber', 'Chassis number', 'Gate & yard'],
  ['onRail', 'On rail', 'Container milestones'],
  ['emptyReturned', 'Empty returned', 'Container milestones'],
];
const shippingGroups = {
  'Tracking support by document number type': 'Tracking identifiers',
  'Port Of Lading [POL]': 'Origin',
  'Port Of Discharge [POD]': 'Destination port',
  'Final Destination [Destination]': 'Inland destination',
  'Container List': 'Container attributes',
  'Core Transport Milestones': 'Container milestones',
  'Extended Transport Milestones': 'Additional milestones',
  'Other Events': 'Other events',
};

async function importHex(filename) {
  const hex = JSON.parse(await readFile(filename, 'utf8'));
  const identity = await read('docs/snippets/data-sources/coverage-data.mdx');
  const terminalProfiles = exportValue(
    await read('docs/snippets/data-sources/terminal-feature-data.mdx'),
    'terminalFeatureCoverage',
  );
  const catalog = {
    terminals: terminalDefinitions.map(([key, label, group]) => ({
      key,
      label,
      group,
    })),
    shippingLines: hex.feature_catalog.shipping_lines.map(
      ({ label, group }) => ({
        key: camelCase(label),
        label,
        group: shippingGroups[group],
      }),
    ),
    railCarriers: hex.feature_catalog.rail_carriers.map(({ label, group }) => {
      const feature = {
        key: camelCase(label),
        label:
          label === 'Last Free Day'
            ? 'Rail LFD'
            : label === 'Est. Arrival at Destination'
              ? 'Carrier ETA'
              : label,
        group:
          group === 'Rail Milestones'
            ? 'Container milestones'
            : 'Rail attributes',
      };
      if (label === 'Last Free Day') feature.requirements = ['rail_plan'];
      return feature;
    }),
  };
  catalog.railCarriers.push({
    key: 't49RailEta',
    label: 'T49 Rail ETA',
    group: 'Terminal49 estimates',
  });
  const sourceShipping = new Map(
    hex.shipping_lines.map((row) => [row.scac, row]),
  );
  const features = (row, definitions, fallback = {}) =>
    Object.fromEntries(
      definitions.map(({ key, label }) => [
        key,
        normalizeStatus(
          row?.features[
            label === 'Rail LFD'
              ? 'Last Free Day'
              : label === 'Carrier ETA'
                ? 'Est. Arrival at Destination'
                : label
          ] ?? fallback[key],
        ),
      ]),
    );
  const terminals = exportValue(identity, 'terminals').map((terminal) => ({
    ...terminal,
    features: Object.fromEntries(
      catalog.terminals.map(({ key }) => [
        key,
        key === 'importMilestones'
          ? 'supported'
          : normalizeStatus(
              terminalProfiles[
                terminal.locode + ':' + (terminal.firmsCode || terminal.name)
              ]?.features[key],
            ),
      ]),
    ),
  }));
  const shippingLines = exportValue(identity, 'carriers').map(
    ({ billOfLading, bookingNumber, containerNumber, ...carrier }) => ({
      ...carrier,
      features: features(
        sourceShipping.get(carrier.scac),
        catalog.shippingLines,
        Object.fromEntries(
          Object.entries({ billOfLading, bookingNumber, containerNumber }).map(
            ([key, value]) => [key, value ? 'supported' : 'unsupported'],
          ),
        ),
      ),
    }),
  );
  const railCarriers = hex.rail_carriers.map((row) => ({
    name: row.carrier,
    scac: row.scac,
    group: row.group,
    features: {
      ...features(row, catalog.railCarriers),
      t49RailEta: 'supported',
    },
  }));
  return {
    updatedOn: '2026-10-08',
    featureCatalog: catalog,
    terminals,
    shippingLines,
    railCarriers,
  };
}

export function validateCoverage(data) {
  if (
    Object.keys(data).some(
      (key) =>
        ![
          'updatedOn',
          'featureCatalog',
          ...types.map(([type]) => type),
        ].includes(key),
    )
  )
    throw new Error('Unexpected coverage metadata');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updatedOn))
    throw new Error('Invalid coverage update date');
  for (const [type] of types) {
    const catalog = data.featureCatalog[type];
    if (
      catalog.some((feature) =>
        Object.keys(feature).some(
          (key) =>
            !['key', 'label', 'group', 'href', 'requirements'].includes(key),
        ),
      )
    )
      throw new Error('Unexpected feature metadata');
    const keys = catalog.map((feature) => feature.key);
    if (
      !keys.length ||
      new Set(keys).size !== keys.length ||
      catalog.some((feature) => !feature.label || !feature.group)
    )
      throw new Error('Invalid feature catalog for ' + type);
    if (!data[type]?.length) throw new Error('Empty coverage list for ' + type);
    const identities = new Set();
    for (const entity of data[type]) {
      if (Object.keys(entity).some((key) => !allowedFields[type].includes(key)))
        throw new Error('Unexpected entity fields for ' + type);
      if (
        type === 'shippingLines' &&
        !['public', 'account'].includes(entity.access)
      )
        throw new Error('Invalid shipping line access');
      const identifier =
        type === 'terminals'
          ? entity.locode + ':' + (entity.firmsCode || entity.name)
          : entity.scac;
      if (!entity.name || !identifier || identities.has(identifier))
        throw new Error('Invalid or duplicate identity for ' + type);
      identities.add(identifier);
      if (
        Object.keys(entity.features).length !== keys.length ||
        keys.some((key) => !statuses.has(entity.features[key]))
      )
        throw new Error(
          'Incomplete or invalid feature statuses for ' + identifier,
        );
    }
  }
  if (
    /confidence|sourceUrl|source_url|captured_on|privateId|customer/i.test(
      JSON.stringify(data),
    )
  )
    throw new Error('Nonpublic metadata in coverage dataset');
}

const escapeMarkdown = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const csvCell = (value) =>
  '"' + String(value ?? '').replaceAll('"', '""') + '"';
function staticReference(data, type, slug, title) {
  const definitions = data.featureCatalog[type];
  const lines = [
    '---',
    'title: "' + title + ' coverage reference"',
    'description: "Complete feature coverage with explicit statuses and public integration identifiers."',
    '---',
    '',
    'Last updated ' + data.updatedOn + '.',
    '',
    '[Download JSON](/data/coverage/' + slug + '.json).',
    '',
    'Supported means the source returns the feature when applicable. Partial means it returns the feature in some cases. Not supported means this source does not return the feature. Unknown means no feature assessment is available. Carrier credentials required means the feature requires credentials for the carrier integration.',
    '',
    'Coverage describes integration capabilities. A supported field may be absent until its milestone occurs. We continually improve our integrations. Contact support to confirm current coverage.',
    '',
  ];
  if (type === 'terminals')
    lines.push(
      'Terminal Last Free Day (LFD) coverage is separate from carrier-reported or estimated LFD, which may still be available.',
      '',
    );
  if (type === 'railCarriers')
    lines.push(
      'Rail Last Free Day (LFD) requires the Rail Plan. This entitlement is separate from carrier credential requirements.',
      '',
    );
  lines.push(
    'Standard Carrier Alpha Code (SCAC) identifies carriers. Terminal identities include the port location code and terminal code.',
    '',
  );
  for (const entity of data[type]) {
    lines.push('## ' + escapeMarkdown(entity.name), '');
    if (type === 'terminals')
      lines.push(
        escapeMarkdown(entity.port + ', ' + entity.country) +
          '. Port location code `' +
          entity.locode +
          '`. Terminal code `' +
          entity.firmsCode +
          '`.',
        '',
      );
    else
      lines.push(
        'SCAC `' +
          entity.scac +
          '`.' +
          (entity.access === 'account' ? ' Account enablement required.' : '') +
          (entity.group ? ' ' + entity.group + '.' : ''),
        '',
      );
    lines.push('| Section | Feature | Coverage |', '| --- | --- | --- |');
    for (const feature of definitions)
      lines.push(
        '| ' +
          escapeMarkdown(feature.group) +
          ' | ' +
          escapeMarkdown(feature.label) +
          ' | ' +
          statusLabel(entity.features[feature.key]) +
          ' |',
      );
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

export function generateFiles(data) {
  validateCoverage(data);
  const files = new Map();
  for (const [type, slug, title] of types) {
    files.set(
      'docs/data/coverage/' + slug + '.json',
      json({
        updatedOn: data.updatedOn,
        featureCatalog: data.featureCatalog[type],
        [type]: data[type],
      }),
    );
    const rows = [
      [
        'name',
        'scac',
        'access',
        'port',
        'locode',
        'country',
        'region',
        'firmsCode',
        'group',
        'feature',
        'label',
        'section',
        'status',
        'updatedOn',
      ],
    ];
    for (const entity of data[type])
      for (const feature of data.featureCatalog[type])
        rows.push([
          entity.name,
          entity.scac,
          entity.access,
          entity.port,
          entity.locode,
          entity.country,
          entity.region,
          entity.firmsCode,
          entity.group,
          feature.key,
          feature.label,
          feature.group,
          entity.features[feature.key],
          data.updatedOn,
        ]);
    files.set(
      'docs/data/coverage/' + slug + '.csv',
      rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n',
    );
    files.set(
      'docs/data/coverage/' + slug + '.mdx',
      staticReference(data, type, slug, title),
    );
  }
  const coverage = (type) =>
    Object.fromEntries(
      data[type].map((row) => [row.scac, { features: row.features }]),
    );
  const exports = {
    coverageUpdatedOn: data.updatedOn,
    shippingLines: data.shippingLines.map(
      ({ features: _features, ...identity }) => identity,
    ),
    shippingLineFeatures: data.featureCatalog.shippingLines,
    shippingLineCoverage: coverage('shippingLines'),
    railCarrierFeatures: data.featureCatalog.railCarriers,
    railCarriers: data.railCarriers.map(
      ({ features: _features, ...identity }) => identity,
    ),
    railCarrierCoverage: coverage('railCarriers'),
  };
  files.set(
    'docs/snippets/data-sources/carrier-feature-data.mdx',
    Object.entries(exports)
      .map(
        ([name, value]) =>
          'export const ' + name + ' = ' + JSON.stringify(value, null, 2) + ';',
      )
      .join('\n\n') + '\n',
  );
  const terminalExports = {
    terminalCoverageEntities: data.terminals.map(
      ({ features: _features, ...identity }) => identity,
    ),
    terminalFeatureSnapshot: { capturedOn: data.updatedOn },
    terminalFeatureCoverage: Object.fromEntries(
      data.terminals.map((row) => [
        row.locode + ':' + (row.firmsCode || row.name),
        { features: row.features },
      ]),
    ),
  };
  files.set(
    'docs/snippets/data-sources/terminal-feature-data.mdx',
    Object.entries(terminalExports)
      .map(
        ([name, value]) =>
          'export const ' + name + ' = ' + JSON.stringify(value, null, 2) + ';',
      )
      .join('\n\n') + '\n',
  );
  return files;
}

const agentStart = '{/* coverage-agent-data:start */}';
const agentEnd = '{/* coverage-agent-data:end */}';
const coveragePages = [
  ['terminals', 'terminals', 'Terminal', 'terminals'],
  ['shippingLines', 'shipping-lines', 'Shipping line', 'ocean-carriers'],
  ['railCarriers', 'rail-carriers', 'Rail carrier', 'rail'],
];

export function updateAgentCoverage(page, data, type, slug, title) {
  const reference = staticReference(data, type, slug, title).replace(
    /^---\n[\s\S]*?\n---\n/,
    '',
  );
  const block =
    agentStart +
    '\n<Visibility for="agents">\n\n## Complete structured coverage\n' +
    reference +
    '\n</Visibility>\n' +
    agentEnd;
  const start = page.indexOf(agentStart);
  const end = page.indexOf(agentEnd);
  if (start === -1 && end === -1) return page.trimEnd() + '\n\n' + block + '\n';
  if (
    start === -1 ||
    end < start ||
    page.indexOf(agentStart, start + agentStart.length) !== -1 ||
    page.indexOf(agentEnd, end + agentEnd.length) !== -1
  )
    throw new Error('Invalid generated coverage markers');
  return page.slice(0, start) + block + page.slice(end + agentEnd.length);
}

async function main() {
  const args = process.argv.slice(2);
  const importIndex = args.indexOf('--importHex');
  const check = args.includes('--check');
  if (
    args.some(
      (arg, index) =>
        !['--check', '--importHex'].includes(arg) &&
        !(importIndex >= 0 && index === importIndex + 1),
    ) ||
    (importIndex >= 0 && (!args[importIndex + 1] || check))
  )
    throw new Error(
      'Usage: node tools/generate-coverage.mjs [--check | --importHex path]',
    );
  const data =
    importIndex >= 0
      ? await importHex(args[importIndex + 1])
      : JSON.parse(await read('docs/data/coverage/coverage.json'));
  validateCoverage(data);
  await mkdir(outputDir, { recursive: true });
  if (importIndex >= 0)
    await writeFile(path.join(outputDir, 'coverage.json'), json(data));
  const drift = [];
  for (const [name, contents] of generateFiles(data)) {
    if (check) {
      const existing = await read(name).catch(() => null);
      if (existing !== contents) drift.push(name);
    } else await writeFile(path.join(root, name), contents);
  }
  for (const [type, slug, title, pageName] of coveragePages) {
    const name = 'docs/coverage/' + pageName + '.mdx';
    const existing = await read(name);
    const contents = updateAgentCoverage(existing, data, type, slug, title);
    if (check) {
      if (existing !== contents) drift.push(name);
    } else await writeFile(path.join(root, name), contents);
  }
  if (drift.length)
    throw new Error('Coverage files are out of date: ' + drift.join(', '));
  console.log(
    (check ? 'Verified' : 'Generated') +
      ' coverage for ' +
      data.terminals.length +
      ' terminals, ' +
      data.shippingLines.length +
      ' shipping lines, and ' +
      data.railCarriers.length +
      ' rail carriers.',
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
