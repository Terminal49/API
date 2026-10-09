import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  normalizeRailTerminals,
  railTerminalArtifacts,
} from './generate-rail-terminals.mjs';

const catalog = JSON.parse(
  readFileSync(
    new URL(
      '../docs/data/coverage/inland-rail-terminals.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const page = readFileSync(
  new URL('../docs/coverage/inland-rail-terminals.mdx', import.meta.url),
  'utf8',
);

test('complete catalog retains every location and identifier in static and interactive outputs', () => {
  assert.equal(catalog.count, 221);
  assert.equal(catalog.terminals.length, 221);
  assert.equal(
    catalog.terminals.filter((terminal) => terminal.country === 'Canada')
      .length,
    18,
  );
  assert.equal(
    catalog.terminals.filter((terminal) => terminal.country === 'United States')
      .length,
    203,
  );
  const outputs = railTerminalArtifacts(catalog, page);
  for (const path of [
    'docs/coverage/inland-rail-terminals.mdx',
    'docs/data/coverage/inland-rail-terminals.mdx',
  ]) {
    assert.equal(
      outputs[path].split('\n').filter((line) => line.startsWith('| ')).length,
      223,
    );
  }
  assert.equal(
    outputs['docs/data/coverage/inland-rail-terminals.csv'].trim().split('\n')
      .length,
    222,
  );
  const snippet = outputs['docs/snippets/data-sources/rail-terminal-data.mdx'];
  const snippetRows = JSON.parse(snippet.slice(snippet.indexOf(' = [') + 3));
  assert.deepEqual(snippetRows, normalizeRailTerminals(catalog).terminals);
  assert.deepEqual(
    railTerminalArtifacts(
      JSON.parse(outputs['docs/data/coverage/inland-rail-terminals.json']),
      outputs['docs/coverage/inland-rail-terminals.mdx'],
    ),
    outputs,
  );
});

test('codes retain leading zeroes and blank codes stay empty in downloads', () => {
  const input = structuredClone(catalog);
  input.terminals[0].firmsCode = '0012';
  input.terminals[0].splc = '000123';
  const outputs = railTerminalArtifacts(input, page);
  const normalized = JSON.parse(
    outputs['docs/data/coverage/inland-rail-terminals.json'],
  );
  assert.ok(
    normalized.terminals.some(
      (terminal) => terminal.firmsCode === '0012' && terminal.splc === '000123',
    ),
  );
  assert.ok(
    outputs['docs/data/coverage/inland-rail-terminals.csv'].includes(
      '"0012","000123"',
    ),
  );
  assert.ok(normalized.terminals.some((terminal) => terminal.splc === ''));
});

test('rejects private fields, incomplete exports, numeric codes, and duplicate facilities', () => {
  const privateRow = structuredClone(catalog);
  privateRow.terminals[0].id = 'private';
  assert.throws(
    () => normalizeRailTerminals(privateRow),
    /Unexpected terminal field/,
  );
  assert.throws(
    () => normalizeRailTerminals({ ...catalog, sourceUrl: 'private' }),
    /Unexpected catalog field/,
  );
  assert.throws(
    () => normalizeRailTerminals({ ...catalog, count: 220 }),
    /count/,
  );
  const numericCode = structuredClone(catalog);
  numericCode.terminals[0].firmsCode = 12;
  assert.throws(
    () => normalizeRailTerminals(numericCode),
    /single-line string/,
  );
  const duplicate = structuredClone(catalog);
  duplicate.terminals[1] = duplicate.terminals[0];
  assert.throws(() => normalizeRailTerminals(duplicate), /Duplicate/);
});
