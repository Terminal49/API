import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

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
