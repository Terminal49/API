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

export async function generatePostmanCollection(specText) {
  random = seededRandom(SEED);
  let collection;
  try {
    collection = await convert(specText);
  } finally {
    random = nativeRandom;
  }
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
