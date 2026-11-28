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
      if (entry.request || !entry.item) {
        assert.equal(typeof entry.id, 'string', entry.name);
        assert.ok(entry.id.length > 0, entry.name);
        ids.push(entry.id);
      }
      walk(entry.item);
      walk(entry.response);
    }
  };
  walk(collection.item);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
});

for (const path of ['/documents/types', '/documents/types/{code}']) {
  test(`${path} publishes the declared response examples`, () => {
    const operation = spec.paths[path].get;
    const item = requests(collection.item).find(
      (candidate) => candidate.name === operation.summary,
    );
    assert.ok(item, `Missing generated request for ${operation.summary}`);
    for (const [status, response] of Object.entries(operation.responses)) {
      const declared = response.content['application/json'].examples;
      const generated = item.response.find(
        (example) => example.code === Number(status),
      );
      assert.ok(generated, `Missing generated ${status} example`);
      assert.deepEqual(
        JSON.parse(generated.body),
        Object.values(declared)[0].value,
      );
      assert.equal(generated.body.includes('<Circular reference'), false);
    }
  });
}

test('schema-based webhook edit request bodies survive response example generation', () => {
  const item = requests(collection.item).find(
    (candidate) => candidate.name === 'Edit a webhook',
  );
  assert.ok(item, 'Missing generated webhook edit request');
  const body = JSON.parse(item.request.body.raw);
  assert.equal(body.data.type, 'webhook');
  assert.equal(typeof body.data.attributes.url, 'string');
});

test('document type detail requests use the declared path example', () => {
  const item = requests(collection.item).find(
    (candidate) => candidate.name === 'Get a document type',
  );
  assert.ok(item);
  assert.equal(
    item.request.url.variable.find((parameter) => parameter.key === 'code')
      .value,
    'packing_list',
  );
  const code = item.request.url.variable.find(
    (parameter) => parameter.key === 'code',
  ).value;
  assert.equal(
    item.request.url.path.join('/').replace(':code', code),
    'documents/types/packing_list',
  );
});
