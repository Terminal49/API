/**
 * CLI program definition.
 *
 * Sets up Commander with global flags and registers all command modules.
 * Exported as a factory so integration tests can create isolated instances.
 */

import { createRequire } from 'node:module';
import { Command, InvalidArgumentError, Option } from 'commander';
import { registerCommandsCommand } from './commands/commands.js';
import { registerConfigCommand } from './commands/config.js';
import { registerContainersCommand } from './commands/containers.js';
import { registerCustomFieldDefinitionsCommand } from './commands/custom-field-definitions.js';
import { registerCustomFieldOptionsCommand } from './commands/custom-field-options.js';
import { registerCustomFieldsCommand } from './commands/custom-fields.js';
import { registerMetroAreasCommand } from './commands/metro-areas.js';
import { registerPartiesCommand } from './commands/parties.js';
import { registerPortsCommand } from './commands/ports.js';
import { registerSearchCommand } from './commands/search.js';
import { registerShipmentsCommand } from './commands/shipments.js';
import { registerShippingLinesCommand } from './commands/shipping-lines.js';
import { registerTerminalsCommand } from './commands/terminals.js';
import { registerTrackCommand } from './commands/track.js';
import { registerTrackingRequestsCommand } from './commands/tracking-requests.js';
import { registerVesselsCommand } from './commands/vessels.js';
import { registerWebhookNotificationsCommand } from './commands/webhook-notifications.js';
import { registerWebhooksCommand } from './commands/webhooks.js';
import { positiveInt } from './util/input.js';

function loadPackageVersion(): string {
  const require = createRequire(import.meta.url);
  for (const path of ['../../package.json', '../package.json']) {
    try {
      return (require(path) as { version: string }).version;
    } catch (error) {
      if ((error as { code?: string }).code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
    }
  }
  return '0.0.0';
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('t49')
    .description('Terminal49 container tracking CLI — for LLM agents, chat interfaces, and humans')
    .version(loadPackageVersion())
    // Global flags
    .option('--json', 'Force JSON output (mutually exclusive with --table)')
    .option('--table', 'Force table output (mutually exclusive with --json)')
    .option('--compact', 'Minified JSON (reduces LLM token usage)')
    .option('--fields <fields>', 'Comma-separated field projection')
    .addOption(
      new Option('--format <format>', 'Response format').choices(['raw', 'mapped', 'both']),
    )
    .option('--token <token>', 'API token (overrides env/config)')
    .option('--base-url <url>', 'API base URL override')
    .option('--account-id <id>', 'Account id for user-scoped bearer tokens')
    .option('--timeout <ms>', 'Request timeout in milliseconds', positiveInt('--timeout'))
    .option(
      '--max-retries <n>',
      'Retry attempts for 429/5xx responses',
      positiveInt('--max-retries'),
    );

  program.hook('preAction', (_command: Command, actionCommand: Command) => {
    const global = actionCommand.optsWithGlobals();

    // Enforce mutual exclusion of --json and --table
    if (global.json && global.table) {
      throw new InvalidArgumentError('--json and --table are mutually exclusive');
    }
  });

  const registrars = [
    registerContainersCommand,
    registerShipmentsCommand,
    registerTrackingRequestsCommand,
    registerTrackCommand,
    registerShippingLinesCommand,
    registerSearchCommand,
    registerConfigCommand,
    registerCommandsCommand,
    registerWebhooksCommand,
    registerWebhookNotificationsCommand,
    registerVesselsCommand,
    registerPortsCommand,
    registerTerminalsCommand,
    registerPartiesCommand,
    registerMetroAreasCommand,
    registerCustomFieldsCommand,
    registerCustomFieldDefinitionsCommand,
    registerCustomFieldOptionsCommand,
  ];

  for (const register of registrars) {
    register(program);
  }

  program.showHelpAfterError('(run --help for usage)').showSuggestionAfterError();

  return program;
}
