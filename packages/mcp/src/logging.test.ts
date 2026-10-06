import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from 'vite-plus/test';
import { sanitizeMcpLogEvent, logMcpEvent } from './logging.js';

describe('sanitizeMcpLogEvent', () => {
  it('redacts sensitive keys', () => {
    const input = {
      event: 'tool.execute.start',
      api_key: 'secret-key',
      password: 'hunter2',
      token: 'bearer-token',
      request_id: 'safe-uuid',
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result.event).toBe('tool.execute.start');
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.request_id).toBe('safe-uuid'); // request_id is explicitly exempt
  });

  it('redacts container and shipment identifiers', () => {
    const input = {
      event: 'tool.execute.start',
      container_number: 'CAIU1234567',
      bill_of_lading: 'MAEU123456789',
      booking_number: 'BK12345',
      ref_numbers: ['REF1', 'REF2'],
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result.container_number).toBe('[REDACTED]');
    expect(result.bill_of_lading).toBe('[REDACTED]');
    expect(result.booking_number).toBe('[REDACTED]');
    expect(result.ref_numbers).toBe('[REDACTED]');
  });

  it('redacts keys ending with _id except request_id', () => {
    const input = {
      container_id: 'uuid-123',
      shipment_id: 'uuid-456',
      account_id: 'acct-789',
      request_id: 'req-001',
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result.container_id).toBe('[REDACTED]');
    expect(result.shipment_id).toBe('[REDACTED]');
    expect(result.account_id).toBe('[REDACTED]');
    expect(result.request_id).toBe('req-001');
  });

  it('redacts keys ending with _token or _secret', () => {
    const input = {
      access_token: 'token-value',
      client_secret: 'secret-value',
      refresh_token: 'refresh-value',
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result.access_token).toBe('[REDACTED]');
    expect(result.client_secret).toBe('[REDACTED]');
    expect(result.refresh_token).toBe('[REDACTED]');
  });

  it('sanitizes error field to safe category', () => {
    const input = {
      event: 'tool.execute.error',
      error: 'NotFoundError',
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result.error).toBe('NotFoundError');
  });

  it('replaces invalid error values with generic Error', () => {
    const input = {
      event: 'tool.execute.error',
      error: 'Secret token abc123 failed',
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result.error).toBe('Error');
  });

  it('recursively sanitizes nested objects', () => {
    const input = {
      event: 'test',
      nested: {
        api_key: 'nested-secret',
        safe_value: 'visible',
      },
    };

    const result = sanitizeMcpLogEvent(input);

    expect((result.nested as any).api_key).toBe('[REDACTED]');
    expect((result.nested as any).safe_value).toBe('visible');
  });

  it('preserves non-sensitive operational fields', () => {
    const input = {
      event: 'tool.execute.complete',
      tool: 'get_container',
      duration_ms: 150,
      timestamp: '2026-08-17T12:00:00Z',
      item_count: 5,
    };

    const result = sanitizeMcpLogEvent(input);

    expect(result).toEqual(input);
  });
});

describe('logMcpEvent', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('writes sanitized JSON to stderr', () => {
    logMcpEvent({
      event: 'test',
      api_key: 'secret',
      tool: 'get_container',
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(output.event).toBe('test');
    expect(output.api_key).toBe('[REDACTED]');
    expect(output.tool).toBe('get_container');
  });
});
