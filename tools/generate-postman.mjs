// Generates Terminal49-API.postman_collection.json from docs/openapi.json.
// openapi-to-postmanv2 fakes example values with Math.random and gives every
// item a random UUID, so the same spec produced a different file on each run.
// Seeding the faker and deriving ids from each item's place in the tree makes
// the output a pure function of the spec.
//
//   node tools/generate-postman.mjs          write the collection
//   node tools/generate-postman.mjs --check  exit 1 if the file is out of date

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The bundled json-schema-faker keeps a reference to Math.random from load
// time, so install a delegate before loading it and swap the source per run.
const nativeRandom = Math.random;
let random = nativeRandom;
Math.random = () => random();
const Converter = createRequire(import.meta.url)('openapi-to-postmanv2');

const root = new URL('../', import.meta.url);
export const specPath = fileURLToPath(new URL('docs/openapi.json', root));
export const collectionPath = fileURLToPath(
  new URL('Terminal49-API.postman_collection.json', root),
);

const OPTIONS = { folderStrategy: 'Tags', enableOptionalParameters: false };
const SEED = 0x7e49;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stableId(key) {
  const hex = createHash('sha256').update(key).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

// Keyed by names, not content, so a request keeps its id when its body changes.
function assignIds(entries, parentKey, kind) {
  const seen = new Map();
  for (const entry of entries ?? []) {
    const occurrence = seen.get(entry.name) ?? 0;
    seen.set(entry.name, occurrence + 1);
    const key = `${parentKey}/${kind}:${entry.name}#${occurrence}`;
    if ('id' in entry) entry.id = stableId(key);
    assignIds(entry.item, key, 'item');
    assignIds(entry.response, key, 'response');
  }
}

function convert(specText) {
  return new Promise((resolve, reject) => {
    Converter.convertV2(
      { type: 'string', data: specText },
      OPTIONS,
      (error, status) => {
        if (error) reject(error);
        else if (!status.result) reject(new Error(status.reason));
        else resolve(status.output[0].data);
      },
    );
  });
}

function resolveReference(spec, value) {
  const visited = new Set();
  while (value.$ref) {
    if (!value.$ref.startsWith('#/') || visited.has(value.$ref)) {
      throw new Error(`Unsupported OpenAPI reference: ${value.$ref}`);
    }
    visited.add(value.$ref);
    value = value.$ref
      .slice(2)
      .split('/')
      .reduce(
        (node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')],
        spec,
      );
    if (!value) throw new Error('Missing referenced OpenAPI component');
  }
  return value;
}

function requestsByOperation(collection) {
  const requests = new Map();
  const collect = (items) => {
    for (const item of items ?? []) {
      if (!item.request) {
        collect(item.item);
        continue;
      }
      const path =
        '/' +
        item.request.url.path
          .map((segment) =>
            segment.startsWith(':') ? `{${segment.slice(1)}}` : segment,
          )
          .join('/');
      const key = `${item.request.method} ${path}`;
      requests.set(key, [...(requests.get(key) ?? []), item]);
    }
  };
  collect(collection.item);
  return requests;
}

// The converter fakes path values and response bodies from schemas. Overlay
// the examples the spec declares, so the collection shows real sample values
// (for example, recursive extraction schemas instead of circular-reference
// placeholders) while request bodies stay schema-based.
function applyDeclaredExamples(collection, spec) {
  const requests = requestsByOperation(collection);
  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!operation.responses) continue;
      const key = `${method.toUpperCase()} ${path}`;
      const items = requests.get(key) ?? [];
      const parameters = new Map();
      for (const input of [
        ...(operations.parameters ?? []),
        ...(operation.parameters ?? []),
      ]) {
        const parameter = resolveReference(spec, input);
        parameters.set(`${parameter.in}:${parameter.name}`, parameter);
      }
      for (const parameter of parameters.values()) {
        if (parameter.in !== 'path') continue;
        const example =
          parameter.example ??
          Object.values(parameter.examples ?? {}).find(
            (value) => 'value' in value,
          )?.value ??
          parameter.schema?.example;
        if (example === undefined) continue;
        if (!['string', 'number', 'boolean'].includes(typeof example)) {
          throw new Error(
            `Unsupported structured path example for ${parameter.name}`,
          );
        }
        for (const item of items) {
          for (const request of [
            item.request,
            ...item.response.map((response) => response.originalRequest),
          ]) {
            const variable = request?.url?.variable?.find(
              (value) => value.key === parameter.name,
            );
            if (!variable) {
              throw new Error(
                `Missing generated path parameter ${parameter.name} for ${key}`,
              );
            }
            variable.value = String(example);
          }
        }
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        const content = response.content?.['application/json'];
        const example =
          content && 'example' in content
            ? content.example
            : Object.values(content?.examples ?? {}).find(
                (entry) => 'value' in entry,
              )?.value;
        if (example === undefined) continue;
        if (items.length === 0) {
          throw new Error(`Missing generated request for ${key}`);
        }
        for (const item of items) {
          const generated = item.response.filter(
            (entry) => entry.code === Number(status),
          );
          if (generated.length !== 1) {
            throw new Error(
              `Expected one generated ${status} response for ${key}`,
            );
          }
          generated[0].body = JSON.stringify(example, null, 2);
        }
      }
    }
  }
}

export async function generatePostmanCollection(specText) {
  random = seededRandom(SEED);
  let collection;
  try {
    collection = await convert(specText);
  } finally {
    random = nativeRandom;
  }
  applyDeclaredExamples(collection, JSON.parse(specText));
  collection.info._postman_id = stableId(`info:${collection.info.name}`);
  assignIds(collection.item, '', 'item');
  return JSON.stringify(collection, null, 4);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const generated = await generatePostmanCollection(
    readFileSync(specPath, 'utf8'),
  );
  if (process.argv.includes('--check')) {
    if (readFileSync(collectionPath, 'utf8') !== generated) {
      console.error(
        'Terminal49-API.postman_collection.json is out of date. Run: node tools/generate-postman.mjs',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(collectionPath, generated);
  }
}
