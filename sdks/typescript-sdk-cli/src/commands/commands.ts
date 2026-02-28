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

import { Command } from 'commander';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

interface CommandMetadata {
  name: string;
  description: string;
  usage: string;
  options: {
    flags: string[];
    description: string;
  }[];
  subcommands: CommandMetadata[];
}

function collectCommands(program: Command): CommandMetadata[] {
  return program.commands.map((command) => ({
    name: command.name(),
    description: command.description(),
    usage: command.usage(),
    options: command.options.map((option) => ({
      flags: [option.short, option.long].filter(Boolean) as string[],
      description: option.description,
    })),
    subcommands: command.commands.length > 0 ? collectCommands(command) : [],
  }));
}

export function registerCommandsCommand(program: Command): void {
  program
    .command('commands')
    .description('List available commands and supported flags')
    .option('--json', 'Force JSON output')
    .action(
      withErrorHandling(
        'commands',
        async (_options: { json?: boolean }, command: Command) => {
          const opts = command.optsWithGlobals();
          const formatter = createFormatter({
            json: Boolean(opts.json),
            compact: opts.compact,
          });
          formatter.output('commands', {
            command: 'commands',
            items: collectCommands(program),
          });
        },
      ),
    );
}
