import type { Terminal49Client } from '@terminal49/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { createClient } from '../client-factory.js';
import { withErrorHandling } from '../errors.js';
import { createFormatter } from '../output/formatter.js';
import { positiveInt } from '../util/input.js';

export interface GlobalOptions {
  json?: boolean;
  table?: boolean;
  compact?: boolean;
  fields?: string;
  format?: 'raw' | 'mapped' | 'both';
  token?: string;
  baseUrl?: string;
  maxRetries?: number;
  accountId?: string;
  timeoutMs?: number;
  all?: boolean;
  maxPages?: number;
  maxRows?: number;
}

type CommanderGlobalOptions = GlobalOptions & {
  timeout?: number;
};

type ActionContext = {
  client: Terminal49Client;
  globals: GlobalOptions;
};

type EnvelopeResult = {
  data: unknown;
  meta?: {
    pagination?: unknown;
    meta?: unknown;
  };
};

function isEnvelopeResult(result: unknown): result is EnvelopeResult {
  return Boolean(result && typeof result === 'object' && 'data' in result);
}

export function resolveGlobals(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals() as CommanderGlobalOptions;
  if (
    opts.format !== undefined &&
    opts.format !== 'raw' &&
    opts.format !== 'mapped' &&
    opts.format !== 'both'
  ) {
    throw new InvalidArgumentError('--format must be one of raw, mapped, both');
  }
  const { timeout, ...globals } = opts;
  return {
    ...globals,
    timeoutMs: globals.timeoutMs ?? timeout,
  };
}

export function action<TArgs extends unknown[]>(
  name: string,
  run: (ctx: ActionContext, ...args: TArgs) => Promise<unknown>,
) {
  return async (...args: [...TArgs, Command]): Promise<void> => {
    const command = args[args.length - 1] as Command;
    const positional = args.slice(0, -1) as TArgs;

    const handler = withErrorHandling<unknown[]>(async () => {
      const globals = resolveGlobals(command);
      const formatter = createFormatter({
        json: globals.json,
        table: globals.table,
        compact: globals.compact,
        fields: globals.fields,
      });
      const client = await createClient({
        token: globals.token,
        baseUrl: globals.baseUrl,
        format: globals.format,
        maxRetries: globals.maxRetries,
        accountId: globals.accountId,
        timeoutMs: globals.timeoutMs,
      });

      const result = await run({ client, globals }, ...positional);
      if (isEnvelopeResult(result)) {
        formatter.output(name, result.data, result.meta);
      } else {
        formatter.output(name, result);
      }
    });
    await handler.apply(undefined, args);
  };
}

export function addListOptions(command: Command): Command {
  return command
    .option('--all', 'Emit all pages as newline-delimited JSON')
    .option(
      '--max-pages <n>',
      'Maximum pages to fetch with --all',
      positiveInt('--max-pages'),
    )
    .option(
      '--max-rows <n>',
      'Maximum rows to emit with --all',
      positiveInt('--max-rows'),
    )
    .option('--page <n>', 'Page number', positiveInt('--page'))
    .option('--page-size <n>', 'Page size', positiveInt('--page-size'));
}

export function listAction(
  name: string,
  run: (ctx: ActionContext) => Promise<EnvelopeResult>,
  iterate?: (ctx: ActionContext) => AsyncIterable<unknown>,
) {
  return async (...args: unknown[]): Promise<void> => {
    const command = args[args.length - 1] as Command;

    const handler = withErrorHandling<unknown[]>(async () => {
      const globals = resolveGlobals(command);
      const client = await createClient({
        token: globals.token,
        baseUrl: globals.baseUrl,
        format: globals.format,
        maxRetries: globals.maxRetries,
        accountId: globals.accountId,
        timeoutMs: globals.timeoutMs,
      });
      const ctx = { client, globals };

      if (globals.all) {
        if (!iterate) {
          throw new InvalidArgumentError(
            '--all is not supported for this command',
          );
        }

        for await (const item of iterate(ctx)) {
          process.stdout.write(`${JSON.stringify(item)}\n`);
        }
        return;
      }

      const formatter = createFormatter({
        json: globals.json,
        table: globals.table,
        compact: globals.compact,
        fields: globals.fields,
      });
      const result = await run(ctx);
      formatter.output(name, result.data, result.meta);
    });
    await handler.apply(undefined, args);
  };
}
