import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildFixtures, writeFixtures } from './generate-fixtures.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const disableNetwork = `
  import http from 'node:http';
  import https from 'node:https';
  import net from 'node:net';
  import { syncBuiltinESMExports } from 'node:module';
  const deny = () => { throw new Error('Network forbidden'); };
  globalThis.fetch = deny;
  http.request = http.get = https.request = https.get = deny;
  net.connect = net.createConnection = deny;
  syncBuiltinESMExports();
`;

function files(directory) {
  return Object.fromEntries(
    fs
      .readdirSync(directory, { recursive: true })
      .filter((name) => fs.statSync(path.join(directory, name)).isFile())
      .map((name) => [
        name,
        fs.readFileSync(path.join(directory, name), 'utf8'),
      ]),
  );
}
function temporary(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 't49-synthetic-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('SDK generation is deterministic and matches the committed corpus', () =>
  temporary((directory) => {
    writeFixtures(directory);
    const first = files(directory);
    writeFixtures(directory);
    assert.deepEqual(files(directory), first);
    assert.deepEqual(
      first,
      files(fileURLToPath(new URL('../src/fixtures/', import.meta.url))),
    );
  }));

test('every JSON:API relationship resolves within the synthetic corpus', () => {
  const fixtures = buildFixtures();
  const resources = Object.values(fixtures).flatMap((fixture) => [
    ...(Array.isArray(fixture.data)
      ? fixture.data
      : fixture.data
        ? [fixture.data]
        : []),
    ...(fixture.included ?? []),
  ]);
  const known = new Set(resources.map(({ type, id }) => `${type}/${id}`));
  for (const item of resources) {
    for (const relationship of Object.values(item.relationships ?? {})) {
      const refs = Array.isArray(relationship.data)
        ? relationship.data
        : relationship.data
          ? [relationship.data]
          : [];
      for (const { type, id } of refs)
        assert.ok(
          known.has(`${type}/${id}`),
          'Unresolved synthetic relationship',
        );
    }
    if (item.type === 'shipment') {
      for (const key of [
        'bill_of_lading_number',
        'bill_of_lading',
        'bl_number',
        'normalized_number',
      ]) {
        assert.equal(item.attributes[key], 'SYNTHBOL000001');
      }
    }
    if (item.type === 'container') {
      assert.equal(item.attributes.number, 'SYNX0000001');
      assert.equal(item.attributes.container_number, 'SYNX0000001');
    }
  }
});

test('trade intelligence fixtures retain required OpenAPI fields and point types', () => {
  const schemas = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/openapi.json'), 'utf8'),
  ).components.schemas;
  const fixtures = buildFixtures();

  function check(value, schemaName, location) {
    const schema = schemas[schemaName];
    assert.ok(
      value && typeof value === 'object' && !Array.isArray(value),
      location,
    );
    for (const key of schema.required ?? []) {
      assert.ok(Object.hasOwn(value, key), `${location}.${key} is required`);
    }
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (!Object.hasOwn(value, key)) continue;
      const item = value[key];
      if (property.type === 'array') {
        assert.ok(Array.isArray(item), `${location}.${key} must be an array`);
        if (property.items?.$ref) {
          const itemSchema = property.items.$ref.split('/').at(-1);
          if (schemas[itemSchema].type === 'object') {
            item.forEach((entry, index) =>
              check(entry, itemSchema, `${location}.${key}[${index}]`),
            );
          }
        }
      } else if (property.type === 'string' || property.type === 'number') {
        assert.equal(typeof item, property.type, `${location}.${key} type`);
      }
    }
  }

  check(fixtures['trade-intel.trends'], 'TradeIntelTrends', 'trends');
  check(fixtures['trade-intel.breakdown'], 'TradeIntelBreakdown', 'breakdown');
});

test('SDK generation succeeds with no credentials and disabled network', () =>
  temporary((directory) => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    ${disableNetwork}
    const { writeFixtures } = await import(${JSON.stringify(new URL('./generate-fixtures.mjs', import.meta.url).href)});
    writeFixtures(${JSON.stringify(directory)});
  `,
      ],
      { env: { PATH: process.env.PATH }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(Object.keys(files(directory)).length, 26);
  }));

test('CLI generation is offline, deterministic, and matches committed tables and JSON', () =>
  temporary((directory) => {
    const cli = new URL(
      '../../typescript-sdk-cli/scripts/generate-fixtures.mjs',
      import.meta.url,
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
    ${disableNetwork}
    const { writeCliFixtures } = await import(${JSON.stringify(cli)});
    writeCliFixtures(${JSON.stringify(directory)});
    writeCliFixtures(${JSON.stringify(directory)});
  `,
      ],
      { cwd: root, env: { PATH: process.env.PATH }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const committed = fileURLToPath(
      new URL('../../typescript-sdk-cli/test/fixtures/', import.meta.url),
    );
    assert.deepEqual(files(directory), files(committed));
  }));
