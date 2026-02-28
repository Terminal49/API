/**
 * Output dispatcher.
 *
 * Selects between JSON and table output based on:
 *   1. Explicit --json or --table flag
 *   2. TTY detection (TTY → table, pipe → JSON)
 *
 * Applies --fields projection and --compact mode before output.
 */

import { isOutputTTY } from '../util/tty.js';
import { createErrorEnvelope, createSuccessEnvelope, serializeEnvelope } from './json.js';
import { projectFields } from './fields.js';
import { renderTable } from './table.js';

export interface FormatterOptions {
  json?: boolean;
  table?: boolean;
  compact?: boolean;
  fields?: string;
  raw?: boolean;
  format?: 'raw' | 'mapped' | 'both';
  noColor?: boolean;
}

export interface Formatter {
  output<T>(
    command: string,
    data: T,
    meta?: { pagination?: unknown; meta?: unknown },
  ): void;
  outputError(command: string, error: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
  }): void;
}

export function createFormatter(opts: FormatterOptions = {}): Formatter {
  const isJson = () => {
    if (opts.json) return true;
    if (opts.table) return false;
    return !isOutputTTY();
  };

  return {
    output<T>(command: string, data: T, meta?: { pagination?: unknown; meta?: unknown }) {
      const payload = projectFields(data, opts.fields);
      if (isJson()) {
        const envelope = createSuccessEnvelope(
          command,
          payload,
          meta?.pagination,
          meta?.meta,
        );
        process.stdout.write(`${serializeEnvelope(envelope, Boolean(opts.compact))}\n`);
        return;
      }

      process.stdout.write(renderTable(command, payload));
    },
    outputError(command, error) {
      const payload = createErrorEnvelope(command, error);
      const body = serializeEnvelope(payload, Boolean(opts.compact));
      process.stderr.write(`${body}\n`);
    },
  };
}
