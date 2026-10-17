import { describe, expect, it } from 'vite-plus/test';
import {
  REDACTED_CONFIRMATION_TOKEN,
  redactSecrets,
  redactSecretsDeep,
} from './redaction.js';
import { REDACTED_URL } from './signed-urls.js';
import { issueConfirmationToken } from './tools/write-kit.js';

const S3_URL =
  'https://t49-documents-prod.s3.amazonaws.com/abc/invoice.pdf?X-Amz-Date=20261017T120000Z&X-Amz-Expires=3600&X-Amz-Signature=deadbeef';

const { confirmation_token: TOKEN } = issueConfirmationToken(
  'a-test-secret-that-is-long-enough-to-sign',
  {
    tool: 'stop_shipment_tracking',
    args: { shipment_id: '1f0e8a52-3c4d-4b6e-9f7a-8b9c0d1e2f3a' },
    accountId: 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a',
    credentialHash: 'hash',
  },
  'fingerprint',
);

describe('redactSecrets', () => {
  it('replaces a confirmation token inside text and JSON', () => {
    expect(redactSecrets(`token ${TOKEN} sent`)).toBe(
      `token ${REDACTED_CONFIRMATION_TOKEN} sent`,
    );
    expect(redactSecrets(JSON.stringify({ confirmation_token: TOKEN }))).toBe(
      JSON.stringify({ confirmation_token: REDACTED_CONFIRMATION_TOKEN }),
    );
  });

  it('replaces signed URLs too', () => {
    expect(redactSecrets(`see ${S3_URL}`)).toBe(`see ${REDACTED_URL}`);
  });

  it('keeps text without secrets', () => {
    const text = 'Stopped tracking shipment MAEU123456789 at 2026-10-17';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('redactSecretsDeep', () => {
  it('redacts strings at any depth and keeps everything else', () => {
    const input = {
      count: 2,
      ok: true,
      empty: null,
      nested: [{ uri: S3_URL, name: 'invoice.pdf' }, TOKEN],
    };

    expect(redactSecretsDeep(input)).toEqual({
      count: 2,
      ok: true,
      empty: null,
      nested: [
        { uri: REDACTED_URL, name: 'invoice.pdf' },
        REDACTED_CONFIRMATION_TOKEN,
      ],
    });
    expect(input.nested[1]).toBe(TOKEN);
  });
});
