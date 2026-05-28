#!/usr/bin/env node

/**
 * Terminal49 MCP Server - stdio Entry Point
 * Run with: node dist/index.js or npm run mcp:stdio
 */

import './instrument.js';
import { runStdioServer } from './server.js';

runStdioServer();
