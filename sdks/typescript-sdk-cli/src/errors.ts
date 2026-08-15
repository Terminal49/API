/**
 * CLI error handling.
 *
 * Maps SDK errors (Terminal49Error hierarchy) to CLI-specific error codes
 * and POSIX exit codes. Formats errors for both human (stderr) and
 * machine (JSON envelope) consumption.
 *
 * Exit codes:
 *   0 - Success
 *   1 - General error
 *   2 - Usage / argument error
 *   3 - Authentication error
 *   4 - Rate limited
 *   5 - Not found
 *   6 - Validation error
 *   7 - Reserved
 *   8 - Upstream / server error
 *   9 - Network / connection error
 */

import {
  AuthenticationError as AuthError,
  NetworkError,
  RateLimitError,
  Terminal49Error,
  ValidationError,
} from '@terminal49/sdk';
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { isOutputTTY } from './util/tty.js';

export type CliExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ErrorContext {
  command: Command | null;
}

function getCommandContext(args: unknown[]): ErrorContext {
  const command = args.find((candidate) => candidate instanceof Command) as Command | null;
  return { command };
}

function resolveContext(context: ErrorContext): {
  json: boolean;
  compact: boolean;
} {
  const opts = context.command?.optsWithGlobals?.() ?? {};
  return {
    json: Boolean((opts as { json?: boolean }).json),
    compact: Boolean((opts as { compact?: boolean }).compact),
  };
}

export function getExitCode(error: unknown): CliExitCode {
  if (error instanceof InvalidArgumentError || error instanceof CommanderError) return 2;
  if (error instanceof NetworkError) return 9;
  if (error instanceof AuthError || getStatus(error) === 401 || getStatus(error) === 403) return 3;
  if (error instanceof RateLimitError || getStatus(error) === 429) return 4;
  if (error instanceof ValidationError || getStatus(error) === 422) return 6;
  if (error instanceof Terminal49Error) return getHttpExitCode(error.status);
  return 1;
}

export function getErrorCode(error: unknown): string {
  if (error instanceof InvalidArgumentError || error instanceof CommanderError)
    return 'USAGE_ERROR';
  if (error instanceof NetworkError) return 'NETWORK_ERROR';
  if (error instanceof AuthError || getStatus(error) === 401 || getStatus(error) === 403)
    return 'AUTH_ERROR';
  if (error instanceof RateLimitError || getStatus(error) === 429) return 'RATE_LIMITED';
  if (error instanceof ValidationError || getStatus(error) === 422) return 'VALIDATION_ERROR';
  if (error instanceof Terminal49Error) {
    if (error.status === 404) return 'NOT_FOUND';
    if (error.status && error.status >= 500) return 'UPSTREAM_ERROR';
    return toUpperSnake(error.name || 'TERMINAL49_ERROR');
  }
  return 'INTERNAL_ERROR';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;
}

function getHttpExitCode(status: number | undefined): CliExitCode {
  if (status === 400 || status === 422) return 6;
  if (status === 401 || status === 403) return 3;
  if (status === 404) return 5;
  if (status === 429) return 4;
  if (status && status >= 500) return 8;
  return 1;
}

function toUpperSnake(input: string): string {
  return input
    .replace(/Error$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function printError(error: unknown, context: ErrorContext = { command: null }): void {
  const { json, compact } = resolveContext(context);
  const code = getErrorCode(error);
  const payload = {
    ok: false as const,
    error: {
      code,
      message: getErrorMessage(error),
      details: error instanceof Terminal49Error ? error.details : undefined,
      retryable: code === 'RATE_LIMITED' ? true : undefined,
      retryAfterMs: code === 'RATE_LIMITED' ? getRetryAfterMs(error) : undefined,
    },
  };

  if (json || !isOutputTTY('stderr')) {
    process.stderr.write(
      `${compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2)}\n`,
    );
    return;
  }

  process.stderr.write(`${payload.error.code}: ${payload.error.message}\n`);
}

export function withErrorHandling<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<unknown>,
): (...args: TArgs) => Promise<void>;
export function withErrorHandling<TArgs extends unknown[]>(
  commandName: string,
  action: (...args: TArgs) => Promise<unknown>,
): (...args: TArgs) => Promise<void>;
export function withErrorHandling<TArgs extends unknown[]>(
  commandNameOrAction: string | ((...args: TArgs) => Promise<unknown>),
  maybeAction?: (...args: TArgs) => Promise<unknown>,
) {
  const action = typeof commandNameOrAction === 'function' ? commandNameOrAction : maybeAction;

  return async (...args: TArgs): Promise<void> => {
    try {
      await action?.(...args);
      return;
    } catch (error) {
      const { command } = getCommandContext(args);
      const exitCode = getExitCode(error);
      printError(error, { command });
      process.exit(exitCode);
    }
  };
}
