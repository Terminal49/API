import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateFiles,
  updateAgentCoverage,
  validateCoverage,
} from './generate-coverage.mjs';

const data = JSON.parse(
  await readFile(
    new URL('../docs/data/coverage/coverage.json', import.meta.url),
    'utf8',
  ),
);

test('only approved public entities and complete feature assessments are exported', () => {
  assert.equal(data.terminals.length, 138);
  assert.equal(
    data.shippingLines.filter((row) => row.access === 'public').length,
    36,
  );
  assert.equal(
    data.shippingLines.filter((row) => row.access === 'account').length,
    2,
  );
  assert.equal(data.railCarriers.length, 6);
  assert.equal(data.featureCatalog.railCarriers.length, 13);
  assert.ok(
    data.railCarriers.every((row) => row.features.t49RailEta === 'supported'),
  );
  assert.equal(
    data.railCarriers.find((row) => row.scac === 'NSRR').features
      .estArrivalAtDestination,
    'signed_in_only',
  );
  assert.equal(
    data.terminals.filter(
      (row) => row.features.availableForPickup === 'unknown',
    ).length,
    22,
  );
  assert.ok(
    data.terminals.every(
      (row) => row.features.importMilestones === 'supported',
    ),
  );
  assert.equal(
    data.shippingLines.find((row) => row.scac === 'SSBF').features
      .podVesselName,
    'limited',
  );
  assert.equal(
    data.railCarriers.find((row) => row.scac === 'NSRR').features.railLoaded,
    'signed_in_only',
  );
});

test('validation rejects incomplete assessments, private metadata, and duplicate identities', () => {
  for (const change of [
    (copy) => {
      delete copy.shippingLines[0].features.podEta;
    },
    (copy) => {
      copy.terminals[0].lowConfidence = true;
    },
    (copy) => {
      copy.railCarriers.push(copy.railCarriers[0]);
    },
  ]) {
    const copy = structuredClone(data);
    change(copy);
    assert.throws(() => validateCoverage(copy));
  }
});

test('static references include every feature and preserve credential requirements without interaction', () => {
  const files = generateFiles(data);
  const shipping = files.get('docs/data/coverage/shipping-lines.mdx');
  const rail = files.get('docs/data/coverage/rail-carriers.mdx');
  assert.equal((shipping.match(/^\| (?!---|Section)/gm) ?? []).length, 38 * 61);
  assert.equal((rail.match(/^\| (?!---|Section)/gm) ?? []).length, 6 * 13);
  assert.ok(rail.includes('Carrier credentials required'));
  assert.ok(rail.includes('requires the Rail Plan'));
  assert.ok(!shipping.includes('export const'));
  assert.deepEqual([...generateFiles(data)], [...files]);
});

const exportedValue = (source, name) =>
  JSON.parse(
    source.match(new RegExp('export const ' + name + ' = ([\\s\\S]*?);'))[1],
  );

test('a canonical refresh updates UI identity, feature exports, and literal agent tables together', () => {
  const copy = structuredClone(data);
  copy.updatedOn = '2026-10-09';
  copy.terminals[0].name = 'Updated terminal';
  copy.terminals[0].features.availableForPickup = 'limited';
  copy.shippingLines[0].name = 'Updated shipping line';
  copy.shippingLines[0].features.podEta = 'unsupported';
  copy.railCarriers[0].features.railArrived = 'signed_in_only';
  const files = generateFiles(copy);
  const terminal = files.get(
    'docs/snippets/data-sources/terminal-feature-data.mdx',
  );
  const carriers = files.get(
    'docs/snippets/data-sources/carrier-feature-data.mdx',
  );
  const entity = copy.terminals[0];
  assert.equal(
    exportedValue(terminal, 'terminalCoverageEntities')[0].name,
    entity.name,
  );
  assert.equal(
    exportedValue(terminal, 'terminalFeatureCoverage')[
      entity.locode + ':' + (entity.firmsCode || entity.name)
    ].features.availableForPickup,
    'limited',
  );
  assert.deepEqual(exportedValue(terminal, 'terminalFeatureSnapshot'), {
    capturedOn: copy.updatedOn,
  });
  assert.equal(
    exportedValue(carriers, 'shippingLines')[0].name,
    'Updated shipping line',
  );
  assert.ok(!('features' in exportedValue(carriers, 'shippingLines')[0]));
  for (const [type, slug, title] of [
    ['terminals', 'terminals', 'Terminal'],
    ['shippingLines', 'shipping-lines', 'Shipping line'],
    ['railCarriers', 'rail-carriers', 'Rail carrier'],
  ]) {
    const page = updateAgentCoverage('Human page\n', copy, type, slug, title);
    assert.ok(page.includes('<Visibility for="agents">'));
    assert.ok(page.includes('Last updated ' + copy.updatedOn));
    assert.ok(copy[type].every(({ name }) => page.includes('## ' + name)));
    assert.equal(
      (page.match(/^\| (?!---|Section)/gm) ?? []).length,
      copy[type].length * copy.featureCatalog[type].length,
    );
    assert.ok(!page.includes('export const'));
    assert.ok(!/confidence|sourceUrl/.test(page));
  }
  assert.ok(
    updateAgentCoverage(
      '',
      copy,
      'terminals',
      'terminals',
      'Terminal',
    ).includes('| Pickup & availability | Available for pickup | Partial |'),
  );
});

test('agent regeneration preserves edited human prose on both sides and rejects broken markers', () => {
  const generated = updateAgentCoverage(
    '',
    data,
    'terminals',
    'terminals',
    'Terminal',
  );
  const page = 'Custom prose before\n' + generated + '\nCustom prose after\n';
  const copy = structuredClone(data);
  copy.updatedOn = '2026-10-09';
  const updated = updateAgentCoverage(
    page,
    copy,
    'terminals',
    'terminals',
    'Terminal',
  );
  assert.ok(updated.startsWith('Custom prose before\n'));
  assert.ok(updated.endsWith('\nCustom prose after\n'));
  assert.ok(updated.includes('Last updated 2026-10-09'));
  assert.equal(
    updateAgentCoverage(updated, copy, 'terminals', 'terminals', 'Terminal'),
    updated,
  );
  assert.throws(() =>
    updateAgentCoverage(
      '{/* coverage-agent-data:start */}',
      data,
      'terminals',
      'terminals',
      'Terminal',
    ),
  );
});

test('terminal identities use names when FIRMS codes are blank', () => {
  const copy = structuredClone(data);
  copy.terminals[0].firmsCode = '';
  copy.terminals[1].firmsCode = '';
  copy.terminals[1].locode = copy.terminals[0].locode;
  validateCoverage(copy);
  copy.terminals[1].name = copy.terminals[0].name;
  assert.throws(() => validateCoverage(copy), /duplicate identity/);
});


async function importFixture(t, mutate = () => {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'coverage-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'tools'), { recursive: true });
  await mkdir(path.join(directory, 'docs/snippets/data-sources'), { recursive: true });
  await mkdir(path.join(directory, 'docs/coverage'), { recursive: true });
  await cp(new URL('./generate-coverage.mjs', import.meta.url), path.join(directory, 'tools/generate-coverage.mjs'));
  const terminal = (name, firmsCode) => ({ name, firmsCode, locode: 'USXXX', port: 'Example port', country: 'US', region: 'North America' });
  const terminals = [terminal('Example terminal', 'AB12'), terminal('Named terminal', ''), terminal('Unmatched terminal', 'CD34')];
  const carriers = ['COSU', 'EGLV', 'CLAM'].map((scac) => ({
    name: scac, legalName: scac, scac, alternativeScacs: ['ALIA'], access: 'public',
    billOfLading: scac !== 'EGLV', bookingNumber: scac !== 'EGLV', containerNumber: scac !== 'COSU',
  }));
  await writeFile(path.join(directory, 'docs/snippets/data-sources/coverage-data.mdx'),
    'export const terminals = ' + JSON.stringify(terminals) + ';\nexport const carriers = ' + JSON.stringify(carriers) + ';\n');
  for (const page of ['terminals', 'ocean-carriers', 'rail'])
    await writeFile(path.join(directory, 'docs/coverage', page + '.mdx'), 'Human prose\n');
  const hex = {
    metadata: { captured_on: '2026-10-12', privateId: 'PRIVATE_FIXTURE_VALUE' },
    feature_catalog: {
      shipping_lines: ['Bill of Lading', 'Booking Number', 'Container Number', 'POD ETA'].map((label) => ({ label, group: label === 'POD ETA' ? 'Port Of Discharge [POD]' : 'Tracking support by document number type' })),
      rail_carriers: [{ label: 'Rail Loaded', group: 'Rail Milestones' }],
    },
    terminals: [
      { port_locode: 'USXXX', firms_code: 'AB12', terminal: 'Different source name', privateId: 'PRIVATE_FIXTURE_VALUE', features: {
        'Available For Pickup': 'limited', 'Last Free Day': 'not_supported', Holds: 'supported', 'Fee Type': 'limited', 'Fee Amount': 'not_supported',
        'Pickup Appointment': 'supported', 'Yard Location': 'limited', 'Vessel Discharged': 'supported', 'Full Out': 'not_supported', 'Full Out Chassis #': 'limited', 'On Rail': 'supported', 'Empty Returned': 'not_supported',
      } },
      { port_locode: 'USXXX', firms_code: '', terminal: 'Named terminal', features: { 'Available For Pickup': 'supported' } },
      { port_locode: 'USYYY', firms_code: 'CD34', terminal: 'Unmatched terminal', features: { 'Available For Pickup': 'supported' } },
      { port_locode: 'USXXX', firms_code: '', terminal: 'Wrong name', features: { 'Available For Pickup': 'unsupported' } },
    ],
    shipping_lines: carriers.map(({ scac }) => ({ scac, privateId: 'PRIVATE_FIXTURE_VALUE', features: {
      'Bill of Lading': 'supported', 'Booking Number': scac === 'CLAM' ? 'not_supported' : 'supported', 'Container Number': 'supported', 'POD ETA': 'limited',
    } })),
    rail_carriers: [{ carrier: 'Example rail', scac: 'RAIL', group: 'Class I', features: { 'Rail Loaded': 'supported' }, privateId: 'PRIVATE_FIXTURE_VALUE' }],
  };
  mutate(hex);
  const filename = path.join(directory, 'source.json');
  await writeFile(filename, JSON.stringify(hex));
  const result = spawnSync(process.execPath, ['tools/generate-coverage.mjs', '--importHex', filename], { cwd: directory, encoding: 'utf8' });
  return { directory, result, read: (name) => readFile(path.join(directory, name), 'utf8') };
}

test('CLI imports fresh terminal assessments and capture date without generated inputs', async (t) => {
  const fixture = await importFixture(t);
  assert.equal(fixture.result.status, 0, fixture.result.stderr);
  const imported = JSON.parse(await fixture.read('docs/data/coverage/coverage.json'));
  assert.equal(imported.updatedOn, '2026-10-12');
  assert.deepEqual(imported.terminals[0].features, {
    importMilestones: 'supported', availableForPickup: 'limited', lastFreeDay: 'unsupported', holds: 'supported', feeType: 'limited', feeAmount: 'unsupported',
    pickupAppointment: 'supported', yardLocation: 'limited', vesselDischarged: 'supported', fullOut: 'unsupported', chassisNumber: 'limited', onRail: 'supported', emptyReturned: 'unsupported',
  });
  assert.equal(imported.terminals[1].features.availableForPickup, 'supported');
  assert.equal(imported.terminals[2].features.availableForPickup, 'unknown');
  assert.ok(imported.terminals.every((row) => row.features.importMilestones === 'supported'));
  assert.equal(imported.shippingLines.find((row) => row.scac === 'COSU').features.containerNumber, 'unsupported');
  assert.equal(imported.shippingLines.find((row) => row.scac === 'EGLV').features.billOfLading, 'unsupported');
  assert.equal(imported.shippingLines.find((row) => row.scac === 'EGLV').features.bookingNumber, 'unsupported');
  assert.equal(imported.shippingLines.find((row) => row.scac === 'CLAM').features.bookingNumber, 'supported');
  const snippet = await fixture.read('docs/snippets/data-sources/terminal-feature-data.mdx');
  assert.equal(exportedValue(snippet, 'terminalFeatureCoverage')['USXXX:AB12'].features.availableForPickup, 'limited');
  assert.equal(exportedValue(snippet, 'terminalFeatureSnapshot').capturedOn, '2026-10-12');
  for (const slug of ['terminals', 'shipping-lines', 'rail-carriers']) {
    for (const extension of ['json', 'csv', 'mdx']) {
      const output = await fixture.read('docs/data/coverage/' + slug + '.' + extension);
      assert.ok(output.includes('2026-10-12'));
      assert.ok(!output.includes('PRIVATE_FIXTURE_VALUE'));
    }
  }
  assert.ok((await fixture.read('docs/data/coverage/terminals.csv')).includes('availableForPickup,Available for pickup,Pickup & availability,limited,2026-10-12'));
  assert.ok((await fixture.read('docs/data/coverage/terminals.mdx')).includes('| Pickup & availability | Available for pickup | Partial |'));
  for (const page of ['terminals', 'ocean-carriers', 'rail']) {
    const output = await fixture.read('docs/coverage/' + page + '.mdx');
    assert.ok(output.includes('Last updated 2026-10-12'));
    assert.ok(output.includes('<Visibility for="agents">'));
    assert.ok(!output.includes('PRIVATE_FIXTURE_VALUE'));
  }
  assert.ok((await fixture.read('docs/coverage/terminals.mdx')).includes('| Pickup & availability | Available for pickup | Partial |'));
  const check = spawnSync(process.execPath, ['tools/generate-coverage.mjs', '--check'], { cwd: fixture.directory, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

test('CLI rejects missing or invalid capture dates before publishing', async (t) => {
  for (const capturedOn of [undefined, '', '2026-02-30', '2026-13-01', '2026-10-12T00:00:00Z']) {
    await t.test(String(capturedOn), async (t) => {
      const fixture = await importFixture(t, (hex) => { hex.metadata.captured_on = capturedOn; });
      assert.notEqual(fixture.result.status, 0);
      assert.match(fixture.result.stderr, /Invalid coverage update date/);
      await assert.rejects(fixture.read('docs/data/coverage/coverage.json'), { code: 'ENOENT' });
    });
  }
});

test('canonical tracking identifiers follow approved lookup admission for every shipping line', async () => {
  const registry = exportedValue(await readFile(new URL('../docs/snippets/data-sources/coverage-data.mdx', import.meta.url), 'utf8'), 'carriers');
  for (const approved of registry) {
    const row = data.shippingLines.find(({ scac }) => scac === approved.scac);
    for (const key of ['billOfLading', 'bookingNumber', 'containerNumber'])
      assert.equal(row.features[key], approved[key] ? 'supported' : 'unsupported', approved.scac + ' ' + key);
  }
  assert.equal(data.shippingLines.find((row) => row.scac === 'COSU').features.containerNumber, 'unsupported');
  assert.equal(data.shippingLines.find((row) => row.scac === 'EGLV').features.billOfLading, 'unsupported');
  assert.equal(data.shippingLines.find((row) => row.scac === 'CLAM').features.bookingNumber, 'supported');
});
