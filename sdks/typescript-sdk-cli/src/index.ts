/**
 * CLI program definition.
 *
 * Sets up Commander with global flags and registers all command modules.
 * Exported as a factory so integration tests can create isolated instances.
 */

import { Command } from 'commander';

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
    .option('--token <token>', 'API token (overrides env/config)')
    .option('--base-url <url>', 'API base URL override')
    .option('--format <format>', 'Response format: raw | mapped | both', 'mapped')
    .option('-q, --quiet', 'Suppress non-data output')
    .option('-v, --verbose', 'Verbose diagnostics to stderr')
    .option('--no-color', 'Disable color output');

  // Commands will be registered here in Phase 1-2 implementation:
  // registerContainersCommand(program);
  // registerShipmentsCommand(program);
  // registerTrackingRequestsCommand(program);
  // registerTrackCommand(program);
  // registerShippingLinesCommand(program);
  // registerSearchCommand(program);
  // registerConfigCommand(program);
  // registerCommandsCommand(program);

  return program;
}
