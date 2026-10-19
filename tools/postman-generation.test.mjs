import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  collectionPath,
  generatePostmanCollection,
  specPath,
} from './generate-postman.mjs';

const root = new URL('../', import.meta.url);
const spec = JSON.parse(
  readFileSync(new URL('docs/openapi.json', root), 'utf8'),
);
const collection = JSON.parse(
  readFileSync(new URL('Terminal49-API.postman_collection.json', root), 'utf8'),
);

function requests(items) {
  return items.flatMap((item) =>
    item.request ? [item] : requests(item.item ?? []),
  );
}

for (const path of ['/shipments', '/containers']) {
  test(`${path} retains optional query examples without sending them by default`, () => {
    const operation = spec.paths[path].get;
    const item = requests(collection.item).find(
      (candidate) => candidate.name === operation.summary,
    );
    assert.ok(item, `Missing generated request for ${operation.summary}`);
    const query = item.request.url.query;
    for (const parameter of operation.parameters.filter(
      (parameter) => parameter.in === 'query',
    )) {
      const generated = query.filter(
        ({ key }) =>
          key === parameter.name || key.startsWith(`${parameter.name}[`),
      );
      assert.ok(
        generated.length,
        `Missing ${parameter.name} in ${operation.summary}`,
      );
      for (const parameterExample of generated) {
        assert.equal(
          parameterExample.disabled,
          parameter.required !== true,
          parameterExample.key,
        );
      }
    }
    assert.equal(query.find(({ key }) => key === 'page[number]').value, '1');
    assert.equal(query.find(({ key }) => key === 'page[size]').value, '30');
  });
}

test('/me exposes the optional account selector in the generated request', () => {
  const operation = spec.paths['/me'].get;
  const item = requests(collection.item).find(
    (candidate) => candidate.name === operation.summary,
  );
  assert.ok(item, 'Missing generated credential request');
  const header = item.request.header.find(({ key }) => key === 'x-account-id');
  assert.ok(header, 'Missing account-selection header');
  assert.equal(header.disabled, true);
  assert.equal(header.value, '<uuid>');
});

test('generation is deterministic and matches the committed collection', async () => {
  const specText = readFileSync(specPath, 'utf8');
  const first = await generatePostmanCollection(specText);
  const second = await generatePostmanCollection(specText);
  assert.equal(first, second);
  assert.equal(
    first,
    readFileSync(collectionPath, 'utf8'),
    'Run: node tools/generate-postman.mjs',
  );
});

test('every item and response has a unique id', () => {
  const ids = [];
  const walk = (entries) => {
    for (const entry of entries ?? []) {
      if (entry.id) ids.push(entry.id);
      walk(entry.item);
      walk(entry.response);
    }
  };
  walk(collection.item);
  assert.equal(ids.length, 453);
  assert.equal(new Set(ids).size, ids.length);
});
