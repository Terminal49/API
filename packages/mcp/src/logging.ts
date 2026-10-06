const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'api_key',
  'apikey',
  'args',
  'arguments',
  'authorization',
  'bill_of_lading',
  'booking_number',
  'bookingnumber',
  'container_number',
  'containernumber',
  'cookie',
  'errors',
  'filters',
  'id',
  'input',
  'message',
  'number',
  'output',
  'password',
  'query',
  'ref_numbers',
  'refnumbers',
  'reference_numbers',
  'referencenumbers',
  'request_number',
  'requestnumber',
  'shipmentnumber',
  'secret',
  'set-cookie',
  'stack',
  'token',
]);

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return (
    SENSITIVE_KEYS.has(normalizedKey) ||
    (normalizedKey !== 'request_id' && normalizedKey.endsWith('_id')) ||
    normalizedKey.endsWith('_token') ||
    normalizedKey.endsWith('_secret') ||
    /(?:Id|ID|Token|Secret)$/.test(key)
  );
}

function sanitizeErrorCategory(value: unknown): string {
  if (
    typeof value === 'string' &&
    /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(value)
  ) {
    return value;
  }

  return 'Error';
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object') {
    return sanitizeMcpLogEvent(value as Record<string, unknown>);
  }

  return value;
}

/**
 * Removes customer identifiers, request inputs, credentials, and upstream
 * messages before an operational MCP event is serialized to stderr.
 */
export function sanitizeMcpLogEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).map(([key, value]) => [
      key,
      key === 'error'
        ? sanitizeErrorCategory(value)
        : isSensitiveKey(key)
          ? REDACTED_VALUE
          : sanitizeValue(value),
    ]),
  );
}

export function logMcpEvent(event: Record<string, unknown>): void {
  console.error(JSON.stringify(sanitizeMcpLogEvent(event)));
}
