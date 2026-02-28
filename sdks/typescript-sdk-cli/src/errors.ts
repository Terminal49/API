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
 *   4 - Authorization / feature error
 *   5 - Not found
 *   6 - Validation error
 *   7 - Rate limited
 *   8 - Upstream / server error
 *   9 - Network / connection error
 */

import { Command } from 'commander';
import {
  AuthenticationError,
  AuthorizationError,
  FeatureNotEnabledError,
  NotFoundError,
  RateLimitError,
  Terminal49Error,
  UpstreamError,
  ValidationError,
} from '@terminal49/sdk';
import { createFormatter } from './output/formatter.js';

export type CliExitCode =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

export interface ErrorContext {
  command: Command | null;
}

function getCommandContext(args: any[]): ErrorContext {
  const command = args.find((candidate) => candidate instanceof Command) as Command | null;
  return { command };
}

function resolveContext(context: ErrorContext): { json: boolean; compact: boolean } {
  const opts = context.command?.optsWithGlobals?.() ?? {};
  return {
    json: Boolean((opts as { json?: boolean }).json),
    compact: Boolean((opts as { compact?: boolean }).compact),
  };
}

function getExitCode(error: unknown): CliExitCode {
  if (error instanceof ValidationError) return 6;
  if (error instanceof AuthenticationError) return 3;
  if (error instanceof FeatureNotEnabledError) return 4;
  if (error instanceof AuthorizationError) return 4;
  if (error instanceof NotFoundError) return 5;
  if (error instanceof RateLimitError) return 7;
  if (error instanceof UpstreamError) return 8;
  if (error instanceof Terminal49Error) return 1;
  if (error instanceof Error) {
    if (/(network|ENOTFOUND|fetch)/i.test(error.message)) return 9;
  }
  return 1;
}

function getErrorCode(error: unknown): string {
  if (error instanceof ValidationError) return 'VALIDATION_ERROR';
  if (error instanceof AuthenticationError) return 'AUTH_ERROR';
  if (error instanceof FeatureNotEnabledError) return 'FEATURE_DISABLED';
  if (error instanceof AuthorizationError) return 'FORBIDDEN';
  if (error instanceof NotFoundError) return 'NOT_FOUND';
  if (error instanceof RateLimitError) return 'RATE_LIMITED';
  if (error instanceof UpstreamError) return 'UPSTREAM_ERROR';
  if (error instanceof Terminal49Error) return error.name;
  return 'INTERNAL_ERROR';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export function withErrorHandling<TArgs extends any[]>(
  commandName: string,
  action: (...args: TArgs) => Promise<unknown>,
) {
  return async (...args: TArgs): Promise<void> => {
    try {
      await action(...args);
      return;
    } catch (error) {
      const { command } = getCommandContext(args);
      const { json, compact } = resolveContext({ command });
      const exitCode = getExitCode(error);
      const formatter = createFormatter({
        json,
        compact,
      });
      formatter.outputError(commandName, {
        code: getErrorCode(error),
        message: getErrorMessage(error),
        status: (error as { status?: number }).status,
        details: (error as Terminal49Error)?.details,
      });
      process.exit(exitCode);
    }
  };
}
