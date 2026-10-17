#!/usr/bin/env node

/**
 * Terminal49 CLI entry point. The program and its error handling live in
 * src/index.ts so tests run the same path.
 */

import { main } from '../src/index.js';

await main(process.argv);
