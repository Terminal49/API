#!/usr/bin/env node

/**
 * Simple MCP Server Test Script
 * Tests the Terminal49 MCP server by sending JSON-RPC requests
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const T49_API_TOKEN = process.env.T49_API_TOKEN || 'kJVzEaVQzRmyGCwcXVcTJAwU';
const T49_API_BASE_URL = process.env.T49_API_BASE_URL || 'https://api.terminal49.com/v2';

// Start the MCP server
const server = spawn('node', ['node_modules/.bin/tsx', 'src/index.ts'], {
  env: {
    ...process.env,
    T49_API_TOKEN,
    T49_API_BASE_URL,
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity,
});

let requestId = 0;

// Listen for responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('\n📥 Response:', JSON.stringify(response, null, 2));
  } catch (e) {
    // Not JSON, probably a log message
    console.log('📝 Log:', line);
  }
});

// Helper to send requests
function sendRequest(method, params = {}) {
  requestId++;
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId,
  };
  console.log('\n📤 Request:', JSON.stringify(request, null, 2));
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Wait a bit for server to start
setTimeout(() => {
  console.log('\n🚀 Testing Terminal49 MCP Server...\n');

  // Test 1: Initialize
  console.log('=== Test 1: Initialize ===');
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });

  // Test 2: List Tools
  setTimeout(() => {
    console.log('\n=== Test 2: List Tools ===');
    sendRequest('tools/list');
  }, 1000);

  // Test 3: List Resources
  setTimeout(() => {
    console.log('\n=== Test 3: List Resources ===');
    sendRequest('resources/list');
  }, 2000);

  // Test 4: Call get_container (you can provide a real container ID)
  const containerId = process.argv[2]; // Pass container ID as argument
  setTimeout(() => {
    if (containerId) {
      console.log('\n=== Test 4: Call get_container ===');
      sendRequest('tools/call', {
        name: 'get_container',
        arguments: { id: containerId },
      });
    } else {
      console.log('\n⏭️  Skipping Test 4: No container ID provided');
      console.log('   Usage: node test-mcp.js <container-id>');
    }
  }, 3000);

  // Exit after all tests
  setTimeout(() => {
    console.log('\n✅ Tests complete!');
    server.kill();
    process.exit(0);
  }, containerId ? 6000 : 4000);
}, 500);

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});
