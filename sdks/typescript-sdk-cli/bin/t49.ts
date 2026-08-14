#!/usr/bin/env node

/**
 * Terminal49 CLI entry point.
 *
 * This file bootstraps the Commander program defined in src/index.ts,
 * loads global configuration, and executes the matched command.
 */

import type { Command } from 'commander';
import { getExitCode, printError } from '../src/errors.js';
import { createProgram } from '../src/index.js';

const program = createProgram();

function configureCommanderErrors(command: Command): void {
  command.exitOverride();
  command.configureOutput({
    outputError: () => {},
  });
  for (const subcommand of command.commands) {
    configureCommanderErrors(subcommand);
  }
}

configureCommanderErrors(program);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    ((error as { code?: string }).code === 'commander.helpDisplayed' ||
      (error as { code?: string }).code === 'commander.version')
  ) {
    process.exit((error as { exitCode?: number }).exitCode ?? 0);
  }

  printError(error, { command: program });
  process.exit(getExitCode(error));
}
