import type { ResponseFormat, Terminal49Client } from '@terminal49/sdk';
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
  format?: ResponseFormat;
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

export type ActionContext = {
  client: Terminal49Client;
  globals: GlobalOptions;
  /** The format the SDK answers in: `--format`, then config `defaultFormat`, then `mapped`. */
  format: ResponseFormat;
};

type ListOutput = {
  data: unknown;
  pagination?: { links?: unknown; meta?: unknown };
};

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

async function createContext(command: Command): Promise<ActionContext> {
  const globals = resolveGlobals(command);
  const { client, format } = await createClient({
    token: globals.token,
    baseUrl: globals.baseUrl,
    format: globals.format,
    maxRetries: globals.maxRetries,
    accountId: globals.accountId,
    timeoutMs: globals.timeoutMs,
  });
  return { client, globals, format };
}

export function action<TArgs extends unknown[]>(
  name: string,
  run: (ctx: ActionContext, ...args: TArgs) => Promise<unknown>,
) {
  return async (...args: [...TArgs, Command]): Promise<void> => {
    const command = args[args.length - 1] as Command;
    const positional = args.slice(0, -1) as TArgs;

    const handler = withErrorHandling<unknown[]>(async () => {
      const ctx = await createContext(command);
      const formatter = createFormatter(ctx.globals);
      // Single-resource results pass through as-is, so `--format raw` keeps
      // the whole JSON:API document (`included`, `links`, `meta`).
      formatter.output(name, await run(ctx, ...positional));
    });
    await handler.apply(undefined, args);
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The rows of a mapped list: a mapped array, a `PaginatedResult`, or a JSON:API document when the SDK has no mapper. */
function rowsOf(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record?.items)) return record.items;
  if (Array.isArray(record?.data)) return record.data;
  return value;
}

function paginationOf(value: unknown): ListOutput['pagination'] {
  const record = asRecord(value);
  if (record?.links === undefined && record?.meta === undefined) {
    return undefined;
  }
  return { links: record.links, meta: record.meta };
}

/**
 * The one output shape every list command shares. `raw` is the whole JSON:API
 * document, `mapped` is the row array, and `both` pairs them.
 */
export function listOutput(
  result: unknown,
  format: ResponseFormat,
): ListOutput {
  switch (format) {
    case 'raw':
      return { data: result, pagination: paginationOf(result) };
    case 'mapped':
      return { data: rowsOf(result), pagination: paginationOf(result) };
    case 'both': {
      const pair = asRecord(result);
      return {
        data: { raw: pair?.raw, mapped: rowsOf(pair?.mapped) },
        pagination: paginationOf(pair?.raw),
      };
    }
    default: {
      const exhaustive: never = format;
      return exhaustive;
    }
  }
}

export function warnUnsupportedFilters(result: unknown): void {
  const record = asRecord(result);
  const unsupportedFilters =
    record?.unsupportedFilters ?? asRecord(record?.mapped)?.unsupportedFilters;
  if (!Array.isArray(unsupportedFilters) || unsupportedFilters.length === 0)
    return;
  process.stderr.write(
    `Warning: unsupported filters ignored by SDK: ${unsupportedFilters.join(', ')}\n`,
  );
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

/** Runs a list command: `run` returns the SDK list result, which `listOutput` shapes. */
export function listAction(
  name: string,
  run: (ctx: ActionContext) => Promise<unknown>,
  iterate?: (ctx: ActionContext) => AsyncIterable<unknown>,
) {
  return async (...args: unknown[]): Promise<void> => {
    const command = args[args.length - 1] as Command;

    const handler = withErrorHandling<unknown[]>(async () => {
      const ctx = await createContext(command);

      if (ctx.globals.all) {
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

      const output = listOutput(await run(ctx), ctx.format);
      createFormatter(ctx.globals).output(
        name,
        output.data,
        output.pagination && { pagination: output.pagination },
      );
    });
    await handler.apply(undefined, args);
  };
}
