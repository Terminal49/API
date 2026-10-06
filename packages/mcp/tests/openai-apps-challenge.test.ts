import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import challengeHandler from '../../../api/openai-apps-challenge.ts';

class MockResponse extends EventEmitter {
  statusCode = 200;
  body = '';
  headers: Record<string, string> = {};

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  end(chunk?: string): void {
    this.body = chunk ?? '';
    this.emit('finish');
  }
}

function createRequest(method: string): Record<string, unknown> {
  return { method };
}

afterEach(() => {
  delete process.env.OPENAI_APPS_CHALLENGE;
});

describe('api/openai-apps-challenge', () => {
  it('returns only the configured challenge token for GET requests', () => {
    process.env.OPENAI_APPS_CHALLENGE = '  portal-issued-token  ';
    const res = new MockResponse();

    challengeHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('portal-issued-token');
    expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns an empty 404 response when the token is not configured', () => {
    const res = new MockResponse();

    challengeHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('');
  });

  it('rejects non-GET requests without exposing the token', () => {
    process.env.OPENAI_APPS_CHALLENGE = 'portal-issued-token';
    const res = new MockResponse();

    challengeHandler(createRequest('POST') as never, res as never);

    expect(res.statusCode).toBe(405);
    expect(res.body).toBe('');
    expect(res.headers.Allow).toBe('GET');
  });
});
