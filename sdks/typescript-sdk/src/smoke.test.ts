import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { Terminal49Client } from './client.js';

const token = process.env.T49_API_TOKEN;
const baseUrl = process.env.T49_API_BASE_URL;

const describeIf = token ? describe : describe.skip;

describeIf('Terminal49Client smoke', () => {
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
