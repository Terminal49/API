/**
 * t49 commands
 *
 * Lists all available commands with their syntax, args, flags,
 * and descriptions. Designed for LLM agent discovery:
 *
 *   t49 commands --json
 *
 * Returns structured metadata that an agent can use to construct
 * any subsequent CLI call with full type information.
 */

import type { Argument, Command, Option } from 'commander';
import { withErrorHandling } from '../errors.js';
import { createFormatter } from '../output/formatter.js';

interface CommandMetadata {
  name: string;
  description: string;
  usage: string;
  args: {
    name: string;
    required: boolean;
    description: string;
    choices?: string[];
  }[];
  options: {
    flags: string[];
    description: string;
    required: boolean;
    choices?: string[];
    valueName?: string;
  }[];
  subcommands: CommandMetadata[];
}

interface GlobalOptionMetadata {
  flags: string[];
  description: string;
  required: boolean;
  choices?: string[];
  valueName?: string;
}

const OUTPUT_CONTRACT = {
  successEnvelope: {
    ok: true,
    command: '<command>',
    data: '<result>',
    pagination: 'optional pagination metadata',
    meta: 'optional command metadata',
  },
  errorEnvelope: {
    ok: false,
    error: {
      code: 'UPPER_SNAKE_ERROR_CODE',
      message: 'Human-readable error message',
      details: 'optional structured details',
      retryable: 'optional boolean',
      retryAfterMs: 'optional number',
    },
  },
};

const EXIT_CODE_CONTRACT = [
  { code: 0, meaning: 'Success' },
  { code: 1, meaning: 'General or unknown error' },
  { code: 2, meaning: 'Usage or argument error' },
  { code: 3, meaning: 'Authentication or authorization error' },
  { code: 4, meaning: 'Rate limited' },
  { code: 5, meaning: 'Not found' },
  { code: 6, meaning: 'Validation error' },
  { code: 8, meaning: 'Upstream or server error' },
  { code: 9, meaning: 'Network or connection error' },
];

function collectCommands(program: Command): CommandMetadata[] {
  return program.commands.map((command) => ({
    name: command.name(),
    description: command.description(),
    usage: command.usage(),
    args: collectArgs(command.registeredArguments),
    options: collectOptions(command.options),
    subcommands: command.commands.length > 0 ? collectCommands(command) : [],
  }));
}

function collectArgs(args: readonly Argument[]): CommandMetadata['args'] {
  return args.map((arg) => ({
    name: arg.name(),
    required: arg.required,
    description: arg.description,
    choices: arg.argChoices,
  }));
}

function collectOptions(options: readonly Option[]): GlobalOptionMetadata[] {
  return options.map((option) => ({
    flags: [option.short, option.long].filter(Boolean) as string[],
    description: option.description,
    required: option.mandatory,
    choices: option.argChoices,
    valueName: valueNameFromFlags(option.flags),
  }));
}

function valueNameFromFlags(flags: string): string | undefined {
  return flags.match(/[<[]([^>\]]+)/)?.[1]?.replace(/\.\.\.$/, '');
}

export function registerCommandsCommand(program: Command): void {
  program
    .command('commands')
    .description('List available commands and supported flags')
    .option('--json', 'Force JSON output')
    .action(
      withErrorHandling('commands', async (_options: { json?: boolean }, command: Command) => {
        const opts = command.optsWithGlobals();
        const formatter = createFormatter({
          json: Boolean(opts.json),
          compact: opts.compact,
        });
        formatter.output('commands', {
          command: 'commands',
          globalOptions: collectOptions(program.options),
          outputContract: OUTPUT_CONTRACT,
          exitCodeContract: EXIT_CODE_CONTRACT,
          items: collectCommands(program),
        });
      }),
    );
}
