#!/usr/bin/env node

/**
 * Terminal49 CLI entry point.
 *
 * This file bootstraps the Commander program defined in src/index.ts,
 * loads global configuration, and executes the matched command.
 */

import { createProgram } from '../src/index.js';

const program = createProgram();
program.parse(process.argv);
