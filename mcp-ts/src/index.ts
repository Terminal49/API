#!/usr/bin/env node

/**
 * Terminal49 MCP Server Entry Point
 * Stdio transport for local MCP clients (Claude Desktop, etc.)
 */

import { Terminal49McpServer } from './server.js';

// Validate API token
const apiToken = process.env.T49_API_TOKEN;
if (!apiToken) {
  console.error('ERROR: T49_API_TOKEN environment variable is required');
  console.error('');
  console.error('Please set your Terminal49 API token:');
  console.error('  export T49_API_TOKEN=your_token_here');
  console.error('');
  console.error('Get your API token at: https://app.terminal49.com/developers/api-keys');
  process.exit(1);
}

const apiBaseUrl = process.env.T49_API_BASE_URL;

// Create and run server
const server = new Terminal49McpServer(apiToken, apiBaseUrl);
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
