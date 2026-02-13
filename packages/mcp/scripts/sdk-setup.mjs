#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mcpDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(mcpDir, '../..');
const sdkDir = path.resolve(repoDir, 'sdks/typescript-sdk');
const sdkSemver = '^0.1.0';

function run(command, cwd = mcpDir) {
  console.log(`$ ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

function fail(message) {
  console.error(`sdk:setup error: ${message}`);
  process.exit(1);
}

const source = (process.env.T49_SDK_SOURCE ?? 'published').trim().toLowerCase();

if (!['published', 'local'].includes(source)) {
  fail("T49_SDK_SOURCE must be 'published' or 'local'");
}

if (source === 'local') {
  if (!existsSync(path.join(sdkDir, 'package.json'))) {
    fail(`local SDK package not found at ${sdkDir}`);
  }

  console.log('Setting MCP SDK source to local workspace build...');
  run(`npm ci --prefix "${sdkDir}"`, repoDir);
  run(`npm run --prefix "${sdkDir}" build`, repoDir);
  run(`npm install --prefix "${mcpDir}" --no-package-lock --no-save "${sdkDir}"`, repoDir);
  console.log(`Using local SDK from ${sdkDir}`);
} else {
  console.log(`Setting MCP SDK source to published package ${sdkSemver}...`);
  run(
    `npm install --prefix "${mcpDir}" --no-package-lock --no-save "@terminal49/sdk@${sdkSemver}"`,
    repoDir,
  );
  console.log(`Using published @terminal49/sdk@${sdkSemver}`);
}
