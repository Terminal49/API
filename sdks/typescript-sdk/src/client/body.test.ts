import { describe, expect, it } from 'vitest';
import { readSuccessBody } from './body.js';

describe('readSuccessBody', () => {
  it('parses a JSON body', async () => {
    const res = new Response(JSON.stringify({ hits: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(readSuccessBody(res)).resolves.toEqual({ hits: 1 });
  });

  it('returns raw text for a non-JSON success body instead of undefined', async () => {
    const res = new Response('not json', { status: 200 });
    await expect(readSuccessBody(res)).resolves.toBe('not json');
  });

  it('returns undefined for an empty body', async () => {
    const res = new Response('', { status: 200 });
    await expect(readSuccessBody(res)).resolves.toBeUndefined();
  });

  it('returns undefined for a 204 No Content', async () => {
    const res = new Response(null, { status: 204 });
    await expect(readSuccessBody(res)).resolves.toBeUndefined();
  });
});
