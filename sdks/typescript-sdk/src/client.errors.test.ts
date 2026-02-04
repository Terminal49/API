import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  FeatureNotEnabledError,
  NotFoundError,
  RateLimitError,
  Terminal49Client,
  Terminal49Error,
  UpstreamError,
  ValidationError,
} from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';

describe('Terminal49Client error handling', () => {
  it('throws AuthenticationError when apiToken is missing', () => {
    expect(() => new Terminal49Client({ apiToken: '' } as any)).toThrow(
      AuthenticationError,
    );
  });

  it('validates required tracking request fields', async () => {
    const { fetchImpl } = createMockFetch({
      '/tracking_requests': () => jsonResponse({ data: {} }, 201),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(
      client.createTrackingRequest({
        requestType: 'container',
        requestNumber: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      client.createTrackingRequest({
        requestType: '' as any,
        requestNumber: 'ABC123',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(client.inferTrackingNumber('')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('maps 401 to AuthenticationError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'invalid token' }] }, 401),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('maps 403 with feature message to FeatureNotEnabledError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'Feature not enabled' }] }, 403),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      FeatureNotEnabledError,
    );
  });

  it('maps 403 without feature message to AuthorizationError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'Access forbidden' }] }, 403),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('maps 404 to NotFoundError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'missing' }] }, 404),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('maps 429 to RateLimitError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'too many requests' }] }, 429),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('maps 5xx to UpstreamError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'server down' }] }, 503),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it('maps unexpected status to Terminal49Error with status in message', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'teapot' }] }, 418),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(client.getContainer('abc')).rejects.toThrowError(/418/);
    await expect(client.getContainer('abc')).rejects.toBeInstanceOf(
      Terminal49Error,
    );
  });

  it('extracts error messages with pointers', async () => {
    const { fetchImpl } = createMockFetch({
      '/tracking_requests': () =>
        jsonResponse(
          {
            errors: [
              {
                detail: 'request_number is required',
                source: { pointer: '/data/attributes/request_number' },
              },
            ],
          },
          400,
        ),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(
      client.createTrackingRequest({
        requestType: 'container',
        requestNumber: 'MSCU1234567',
      }),
    ).rejects.toThrowError(
      /request_number is required \(\/data\/attributes\/request_number\)/,
    );
  });
});
