import { describe, expect, it } from 'vitest';
import {
  computeBackoffDelay,
  isIdempotentMethod,
  isRetryableNetworkError,
  isRetryableStatus,
  parseRetryAfterMs,
  shouldRetryRequest,
} from './retry-policy.js';

describe('retry-policy', () => {
  describe('isIdempotentMethod', () => {
    it('treats GET and HEAD as idempotent', () => {
      expect(isIdempotentMethod('GET')).toBe(true);
      expect(isIdempotentMethod('get')).toBe(true);
      expect(isIdempotentMethod('HEAD')).toBe(true);
    });

    it('treats writes as non-idempotent', () => {
      expect(isIdempotentMethod('POST')).toBe(false);
      expect(isIdempotentMethod('PATCH')).toBe(false);
      expect(isIdempotentMethod('DELETE')).toBe(false);
      expect(isIdempotentMethod('PUT')).toBe(false);
    });
  });

  describe('isRetryableStatus', () => {
    it('retries 429 and 5xx', () => {
      expect(isRetryableStatus(429)).toBe(true);
      expect(isRetryableStatus(500)).toBe(true);
      expect(isRetryableStatus(503)).toBe(true);
    });

    it('does not retry 4xx other than 429', () => {
      expect(isRetryableStatus(400)).toBe(false);
      expect(isRetryableStatus(404)).toBe(false);
      expect(isRetryableStatus(200)).toBe(false);
    });
  });

  describe('isRetryableNetworkError', () => {
    it('treats fetch/connection errors as retryable', () => {
      expect(isRetryableNetworkError(new TypeError('fetch failed'))).toBe(true);
      const econn = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
      expect(isRetryableNetworkError(econn)).toBe(true);
      const dns = Object.assign(new Error('boom'), { code: 'ENOTFOUND' });
      expect(isRetryableNetworkError(dns)).toBe(true);
    });

    it('does not treat an AbortError (timeout) as a retryable network error', () => {
      const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
      expect(isRetryableNetworkError(abort)).toBe(false);
    });
  });

  describe('shouldRetryRequest', () => {
    it('allows retry for idempotent methods', () => {
      expect(shouldRetryRequest({ method: 'GET' })).toBe(true);
      expect(shouldRetryRequest({ method: 'HEAD' })).toBe(true);
    });

    it('blocks retry for writes without an Idempotency-Key', () => {
      expect(shouldRetryRequest({ method: 'POST' })).toBe(false);
      expect(shouldRetryRequest({ method: 'PATCH' })).toBe(false);
    });

    it('allows retry for writes that carry an Idempotency-Key', () => {
      expect(
        shouldRetryRequest({ method: 'POST', hasIdempotencyKey: true }),
      ).toBe(true);
    });
  });

  describe('parseRetryAfterMs', () => {
    it('parses delta-seconds', () => {
      expect(parseRetryAfterMs('2')).toBe(2000);
      expect(parseRetryAfterMs('0')).toBe(0);
    });

    it('parses an HTTP-date relative to now', () => {
      const now = Date.parse('2026-01-01T00:00:00Z');
      const date = new Date(now + 5000).toUTCString();
      expect(parseRetryAfterMs(date, now)).toBe(5000);
    });

    it('returns undefined for missing or malformed values', () => {
      expect(parseRetryAfterMs(null)).toBeUndefined();
      expect(parseRetryAfterMs('')).toBeUndefined();
      expect(parseRetryAfterMs('not-a-date')).toBeUndefined();
    });

    it('never returns a negative delay for a past date', () => {
      const now = Date.parse('2026-01-01T00:00:00Z');
      const past = new Date(now - 5000).toUTCString();
      expect(parseRetryAfterMs(past, now)).toBe(0);
    });
  });

  describe('computeBackoffDelay', () => {
    it('uses exponential backoff when no Retry-After is present', () => {
      expect(computeBackoffDelay(0)).toBe(500);
      expect(computeBackoffDelay(1)).toBe(1000);
      expect(computeBackoffDelay(2)).toBe(2000);
    });

    it('honors Retry-After over exponential backoff', () => {
      expect(computeBackoffDelay(0, 3000)).toBe(3000);
      expect(computeBackoffDelay(2, 100)).toBe(100);
    });
  });
});
