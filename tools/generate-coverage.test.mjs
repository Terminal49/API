import { readFile } from 'node:fs/promises';
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
  assert.equal(data.terminals.length, 136);
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
    20,
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
