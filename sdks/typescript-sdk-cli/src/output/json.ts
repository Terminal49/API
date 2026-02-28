/**
 * JSON envelope formatter.
 *
 * Wraps all CLI output in a predictable envelope:
 *   { ok: true, command: "...", data: {...}, pagination?: {...}, meta?: {...} }
 *   { ok: false, command: "...", error: { code, message, status, details } }
 *
 * Supports --compact for token-efficient LLM output.
 */

export interface CliSuccessEnvelope<T = unknown> {
  ok: true;
  command: string;
  data: T;
  pagination?: unknown;
  meta?: unknown;
}

export interface CliErrorEnvelope {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
  };
}

export function createSuccessEnvelope<T>(
  command: string,
  data: T,
  pagination?: unknown,
  meta?: unknown,
): CliSuccessEnvelope<T> {
  const envelope: CliSuccessEnvelope<T> = {
    ok: true,
    command,
    data,
  };
  if (pagination !== undefined) envelope.pagination = pagination;
  if (meta !== undefined) envelope.meta = meta;
  return envelope;
}

export function createErrorEnvelope(
  command: string,
  error: CliErrorEnvelope['error'],
): CliErrorEnvelope {
  return {
    ok: false,
    command,
    error: {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    },
  };
}

export function serializeEnvelope<T>(envelope: CliSuccessEnvelope<T> | CliErrorEnvelope, compact = false): string {
  return compact ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2);
}
