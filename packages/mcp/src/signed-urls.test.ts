import { describe, expect, it } from 'vite-plus/test';
import {
  REDACTED_URL,
  redactSignedUrls,
  redactSignedUrlsDeep,
} from './signed-urls.js';

const S3_URL =
  'https://t49-documents-prod.s3.amazonaws.com/abc/invoice.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20261017&X-Amz-Date=20261017T120000Z&X-Amz-Expires=3600&X-Amz-Signature=deadbeef';

describe('redactSignedUrls', () => {
  it.each([
    ['S3', S3_URL],
    [
      'Google Cloud Storage',
      'https://storage.googleapis.com/b/o.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc',
    ],
    [
      'Azure',
      'https://acct.blob.core.windows.net/c/o.pdf?sv=2024-01-01&se=2026-10-17&sp=r&sig=abc',
    ],
    [
      'CloudFront',
      'https://d111.cloudfront.net/o.pdf?Expires=1760000000&Signature=abc&Key-Pair-Id=K1',
    ],
  ])('redacts a %s signed URL inside text', (_name, url) => {
    expect(redactSignedUrls(`see ${url} now`)).toBe(`see ${REDACTED_URL} now`);
  });

  it('leaves unsigned URLs alone', () => {
    const text =
      'https://api.terminal49.com/v2/documents?page[number]=2 and https://terminal49.com/docs';
    expect(redactSignedUrls(text)).toBe(text);
  });

  it('stops a URL at the quote that ends a JSON string', () => {
    expect(redactSignedUrls(JSON.stringify({ uri: S3_URL }))).toBe(
      `{"uri":"${REDACTED_URL}"}`,
    );
  });
});

describe('redactSignedUrlsDeep', () => {
  it('redacts strings at any depth and keeps everything else', () => {
    const input = {
      count: 2,
      ok: true,
      empty: null,
      nested: [{ uri: S3_URL, name: 'invoice.pdf' }, S3_URL],
    };

    expect(redactSignedUrlsDeep(input)).toEqual({
      count: 2,
      ok: true,
      empty: null,
      nested: [{ uri: REDACTED_URL, name: 'invoice.pdf' }, REDACTED_URL],
    });
    expect(input.nested[1]).toBe(S3_URL);
  });
});
