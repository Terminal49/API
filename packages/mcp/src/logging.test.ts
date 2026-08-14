import { afterEach, describe, expect, it, vi } from 'vitest';
import { logMcpEvent, sanitizeMcpLogEvent } from './logging.js';

describe('MCP operational log sanitization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts customer identifiers, request inputs, and upstream messages', () => {
    const sanitized = sanitizeMcpLogEvent({
      event: 'tool.execute.error',
      tool: 'track_container',
      container_id: 'container-123',
      request_id: 'request-123',
      query: 'ACME purchase order 456',
      number: 'MSCU1234567',
      filters: {
        port: 'USLAX',
        'filter[ref_number]': 'customer-reference',
      },
      error: 'NotFoundError',
      message: 'Container MSCU1234567 was not found',
      duration_ms: 42,
      item_count: 0,
    });

    expect(sanitized).toEqual({
      event: 'tool.execute.error',
      tool: 'track_container',
      container_id: '[REDACTED]',
      request_id: 'request-123',
      query: '[REDACTED]',
      number: '[REDACTED]',
      filters: '[REDACTED]',
      error: 'NotFoundError',
      message: '[REDACTED]',
      duration_ms: 42,
      item_count: 0,
    });
  });

  it('normalizes an unsafe error category instead of logging it', () => {
    expect(
      sanitizeMcpLogEvent({
        event: 'tool.execute.error',
        error: 'Error for container MSCU1234567',
        errors: ['transport.close: token secret-value'],
      }),
    ).toEqual({
      event: 'tool.execute.error',
      error: 'Error',
      errors: '[REDACTED]',
    });
  });

  it('recursively redacts sensitive values before writing JSON to stderr', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'search_container',
      result: {
        shipment_id: 'shipment-123',
        ref_numbers: ['private-reference'],
        count: 1,
      },
      duration_ms: 8,
    });

    expect(consoleError).toHaveBeenCalledOnce();
    const serialized = String(consoleError.mock.calls[0]?.[0]);
    expect(serialized).not.toContain('shipment-123');
    expect(serialized).not.toContain('private-reference');
    expect(JSON.parse(serialized)).toEqual({
      event: 'tool.execute.complete',
      tool: 'search_container',
      result: {
        shipment_id: '[REDACTED]',
        ref_numbers: '[REDACTED]',
        count: 1,
      },
      duration_ms: 8,
    });
  });
});
