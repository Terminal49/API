import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import verificationHandler from '../../../api/google-connected-apps.ts';

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

const consoleFile = '  {"verification_tokens": ["console-issued-token"]}\n';

afterEach(() => {
  delete process.env.GOOGLE_CONNECTED_APPS_VERIFICATION;
});

describe('api/google-connected-apps', () => {
  it('returns the configured verification file as JSON for GET requests', () => {
    process.env.GOOGLE_CONNECTED_APPS_VERIFICATION = consoleFile;
    const res = new MockResponse();

    verificationHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      verification_tokens: ['console-issued-token'],
    });
    expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns an empty 404 response when the file is not configured', () => {
    const res = new MockResponse();

    verificationHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('');
  });

  it.each([
    ['not JSON', 'console-issued-token'],
    ['no tokens', '{"verification_tokens": []}'],
    ['wrong shape', '{"token": "console-issued-token"}'],
  ])('returns 404 when the configured value has %s', (_label, value) => {
    process.env.GOOGLE_CONNECTED_APPS_VERIFICATION = value;
    const res = new MockResponse();

    verificationHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('');
  });

  it('rejects non-GET requests without exposing the file', () => {
    process.env.GOOGLE_CONNECTED_APPS_VERIFICATION = consoleFile;
    const res = new MockResponse();

    verificationHandler(createRequest('POST') as never, res as never);

    expect(res.statusCode).toBe(405);
    expect(res.body).toBe('');
    expect(res.headers.Allow).toBe('GET');
  });
});
