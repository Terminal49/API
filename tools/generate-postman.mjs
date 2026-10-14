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
  function resolveParameter(parameter) {
    const visited = new Set();
    while (parameter.$ref) {
      if (!parameter.$ref.startsWith('#/') || visited.has(parameter.$ref)) {
        throw new Error(`Unsupported parameter reference: ${parameter.$ref}`);
      }
      visited.add(parameter.$ref);
      parameter = parameter.$ref
        .slice(2)
        .split('/')
        .reduce(
          (value, key) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')],
          spec,
        );
      if (!parameter) throw new Error('Missing referenced OpenAPI parameter');
    }
    return parameter;
  }

  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!operation.responses) continue;
      const parameters = new Map();
      for (const input of [
        ...(operations.parameters ?? []),
        ...(operation.parameters ?? []),
      ]) {
        const parameter = resolveParameter(input);
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
        for (const item of requests.get(`${method.toUpperCase()} ${path}`) ??
          []) {
          for (const request of [
            item.request,
            ...item.response.map((response) => response.originalRequest),
          ]) {
            const variable = request?.url?.variable?.find(
              (value) => value.key === parameter.name,
            );
            if (!variable)
              throw new Error(
                `Missing generated path parameter ${parameter.name}`,
              );
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
