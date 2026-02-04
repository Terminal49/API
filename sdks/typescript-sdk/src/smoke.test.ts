import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { Terminal49Client } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  process.env.DOTENV_CONFIG_PATH,
  path.resolve(__dirname, '../../../.env.local'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env'),
].filter(Boolean) as string[];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const token = process.env.T49_API_TOKEN;
const baseUrl = process.env.T49_API_BASE_URL;

if (!token) {
  describe.skip('Terminal49Client smoke (requires T49_API_TOKEN)', () => {});
} else {
  describe('Terminal49Client smoke', () => {
  const client = new Terminal49Client({
    apiToken: token as string,
    apiBaseUrl: baseUrl,
    defaultFormat: 'raw',
  });

  it('lists shipping lines', async () => {
    const result = await client.shippingLines.list(undefined, { format: 'raw' });
    expect((result as any)?.data).toBeDefined();
  });

  it('lists tracking requests', async () => {
    const result = await client.trackingRequests.list();
    expect((result as any)?.data).toBeDefined();
  });

  const inferNumber = process.env.T49_INFER_NUMBER;
  const itIf = inferNumber ? it : it.skip;

  itIf('infers tracking number', async () => {
    const result = await client.trackingRequests.inferNumber(inferNumber as string);
    expect(result).toBeTruthy();
  });
  });
}
