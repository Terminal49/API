/**
 * CLI program definition.
 *
 * Sets up Commander with global flags and registers all command modules.
 * Exported as a factory so integration tests can create isolated instances.
 */

import { Command } from 'commander';
import { registerContainersCommand } from './commands/containers.js';
import { registerConfigCommand } from './commands/config.js';
import { registerCommandsCommand } from './commands/commands.js';
import { registerCustomFieldDefinitionsCommand } from './commands/custom-field-definitions.js';
import { registerCustomFieldOptionsCommand } from './commands/custom-field-options.js';
import { registerCustomFieldsCommand } from './commands/custom-fields.js';
import { registerSearchCommand } from './commands/search.js';
import { registerShippingLinesCommand } from './commands/shipping-lines.js';
import { registerShipmentsCommand } from './commands/shipments.js';
import { registerMetroAreasCommand } from './commands/metro-areas.js';
import { registerPartiesCommand } from './commands/parties.js';
import { registerPortsCommand } from './commands/ports.js';
import { registerTerminalsCommand } from './commands/terminals.js';
import { registerTrackCommand } from './commands/track.js';
import { registerTrackingRequestsCommand } from './commands/tracking-requests.js';
import { registerVesselsCommand } from './commands/vessels.js';
import { registerWebhooksCommand } from './commands/webhooks.js';
import { registerWebhookNotificationsCommand } from './commands/webhook-notifications.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('t49')
    .description(
      'Terminal49 container tracking CLI — for LLM agents, chat interfaces, and humans',
    )
    .version('0.1.0')
    // Global flags
    .option('--json', 'Force JSON output')
    .option('--table', 'Force table output')
    .option('--raw', 'Output raw JSON:API document')
    .option('--compact', 'Minified JSON (reduces LLM token usage)')
    .option('--fields <fields>', 'Comma-separated field projection')
    .option('--auth-scheme <scheme>', 'Authorization header scheme (Token|Bearer)')
    .option('--token <token>', 'API token (overrides env/config)')
    .option('--base-url <url>', 'API base URL override')
    .option('--format <format>', 'Response format: raw | mapped | both', 'mapped')
    .option('--max-retries <attempts>', 'Retry attempts for 429/5xx responses', (value) =>
      Number.parseInt(value, 10),
    )
    .option('-q, --quiet', 'Suppress non-data output')
    .option('-v, --verbose', 'Verbose diagnostics to stderr')
    .option('--no-color', 'Disable color output');

  program.hook('preAction', (_command: Command, actionCommand: Command) => {
    const global = actionCommand.optsWithGlobals();
    if (typeof global.authScheme === 'string') {
      process.env.T49_AUTH_SCHEME = global.authScheme;
    }
  });

  registerContainersCommand(program);
  registerShipmentsCommand(program);
  registerTrackingRequestsCommand(program);
  registerTrackCommand(program);
  registerShippingLinesCommand(program);
  registerSearchCommand(program);
  registerConfigCommand(program);
  registerCommandsCommand(program);
  registerWebhooksCommand(program);
  registerWebhookNotificationsCommand(program);
  registerVesselsCommand(program);
  registerPortsCommand(program);
  registerTerminalsCommand(program);
  registerPartiesCommand(program);
  registerMetroAreasCommand(program);
  registerCustomFieldsCommand(program);
  registerCustomFieldDefinitionsCommand(program);
  registerCustomFieldOptionsCommand(program);

  return program;
}
