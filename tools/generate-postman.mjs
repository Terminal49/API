#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'terminal49-postman-'));
const generated = join(temporary, 'collection.json');
try {
  execFileSync(
    'openapi2postmanv2',
    [
      '-s',
      join(root, 'docs/openapi.json'),
      '-o',
      generated,
      '-p',
      '-O',
      'folderStrategy=Tags,enableOptionalParameters=false,parametersResolution=Schema',
    ],
    { stdio: 'pipe' },
  );
  const spec = JSON.parse(
    readFileSync(join(root, 'docs/openapi.json'), 'utf8'),
  );
  const collection = JSON.parse(readFileSync(generated, 'utf8'));
  const requests = new Map();
  function collect(items) {
    for (const item of items) {
      if (item.request) {
        const path =
          '/' +
          item.request.url.path
            .map((segment) =>
              segment.startsWith(':') ? `{${segment.slice(1)}}` : segment,
            )
            .join('/');
        const key = `${item.request.method} ${path}`;
        const matching = requests.get(key) ?? [];
        matching.push(item);
        requests.set(key, matching);
      } else collect(item.item ?? []);
    }
  }
  collect(collection.item);
  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!operation.responses) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        const content = response.content?.['application/json'];
        const example =
          content && 'example' in content
            ? content.example
            : Object.values(content?.examples ?? {}).find(
                (entry) => 'value' in entry,
              )?.value;
        if (example === undefined) continue;
        const key = `${method.toUpperCase()} ${path}`;
        const matching = requests.get(key) ?? [];
        if (matching.length === 0)
          throw new Error(`Missing generated request for ${key}`);
        for (const item of matching) {
          const examples = item.response.filter(
            (entry) => entry.code === Number(status),
          );
          if (examples.length !== 1)
            throw new Error(
              `Expected one generated ${status} response for ${key}`,
            );
          examples[0].body = JSON.stringify(example, null, 2);
        }
      }
    }
  }
  writeFileSync(
    join(root, 'Terminal49-API.postman_collection.json'),
    JSON.stringify(collection, null, 4),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
