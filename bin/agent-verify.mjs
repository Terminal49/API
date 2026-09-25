#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv[2];
if (mode && mode !== '--quick') {
  console.error('Usage: bin/agent-verify.mjs [--quick]');
  process.exit(2);
}

const steps = [
  {
    name: 'Node runtime',
    run: () => {
      const [major, minor] = process.versions.node.split('.').map(Number);
      if (major !== 24 || minor < 11) {
        throw new Error(
          `Node 24.11+ is required; received ${process.versions.node}`,
        );
      }
    },
  },
  {
    name: 'Agent trust guards',
    command: ['node', 'bin/check-agent-trust.mjs'],
  },
  {
    name: 'Vite+ and TypeScript checks',
    command: ['npx', '--no-install', 'vp', 'run', 'check'],
  },
  {
    name: 'Workspace builds',
    command: ['npx', '--no-install', 'vp', 'run', 'build'],
  },
  ...(mode === '--quick'
    ? []
    : [
        {
          name: 'Workspace tests',
          command: ['npx', '--no-install', 'vp', 'run', 'test'],
        },
      ]),
  {
    name: 'OpenAPI SDK type generation',
    command: ['node', 'bin/check-openapi-types.mjs'],
  },
  {
    name: 'MCP initialize and tools/list smoke',
    command: ['npm', 'run', 'test:protocol', '--workspace', '@terminal49/mcp'],
    env: { MCP_PROTOCOL_VERSION: '2025-06-18' },
  },
];

function runStep(step) {
  const startedAt = performance.now();
  process.stdout.write(`\n[RUN ] ${step.name}\n`);
  if (step.run) {
    step.run();
  } else {
    const [command, ...args] = step.command;
    const result = spawnSync(command, args, {
      cwd: root,
      env: { ...process.env, ...step.env },
      stdio: 'inherit',
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`command exited ${result.status ?? 'without a status'}`);
    }
  }
  const duration = Math.round(performance.now() - startedAt);
  process.stdout.write(`[PASS] ${step.name} (${duration} ms)\n`);
}

for (const step of steps) {
  try {
    runStep(step);
  } catch (error) {
    console.error(
      `[FAIL] ${step.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

console.log(
  `\nPASS agent-verify${mode === '--quick' ? ' --quick' : ''}: ${steps.length} steps`,
);
