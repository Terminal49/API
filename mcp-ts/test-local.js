#!/usr/bin/env node

/**
 * Interactive test script for Terminal49 MCP Server
 * Tests all MCP protocol operations locally
 */

import { Terminal49McpServer } from './src/server.js';

const apiToken = process.env.T49_API_TOKEN;
if (!apiToken) {
  console.error('ERROR: T49_API_TOKEN environment variable is required');
  console.error('Set it with: export T49_API_TOKEN=your_token_here');
  process.exit(1);
}

console.log('🚀 Terminal49 MCP Server - Interactive Test\n');

const server = new Terminal49McpServer(apiToken);
const mcpServer = server.getServer();

async function testInitialize() {
  console.log('📋 Test 1: Initialize');
  const request = {
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  };

  try {
    const response = await mcpServer.request(request);
    console.log('✅ Initialize successful');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ Initialize failed:', error.message);
  }
  console.log('');
}

async function testListTools() {
  console.log('📋 Test 2: List Tools');
  const request = {
    method: 'tools/list',
    params: {},
  };

  try {
    const response = await mcpServer.request(request);
    console.log('✅ List tools successful');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ List tools failed:', error.message);
  }
  console.log('');
}

async function testListResources() {
  console.log('📋 Test 3: List Resources');
  const request = {
    method: 'resources/list',
    params: {},
  };

  try {
    const response = await mcpServer.request(request);
    console.log('✅ List resources successful');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ List resources failed:', error.message);
  }
  console.log('');
}

async function testGetContainer(containerId) {
  console.log('📋 Test 4: Get Container');
  console.log(`Container ID: ${containerId}`);

  const request = {
    method: 'tools/call',
    params: {
      name: 'get_container',
      arguments: {
        id: containerId,
      },
    },
  };

  try {
    const response = await mcpServer.request(request);
    console.log('✅ Get container successful');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ Get container failed:', error.message);
  }
  console.log('');
}

async function testReadResource(containerId) {
  console.log('📋 Test 5: Read Container Resource');
  console.log(`URI: t49:container/${containerId}`);

  const request = {
    method: 'resources/read',
    params: {
      uri: `t49:container/${containerId}`,
    },
  };

  try {
    const response = await mcpServer.request(request);
    console.log('✅ Read resource successful');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ Read resource failed:', error.message);
  }
  console.log('');
}

// Run all tests
async function runTests() {
  await testInitialize();
  await testListTools();
  await testListResources();

  // Get container ID from command line or use example
  const containerId = process.argv[2] || '123e4567-e89b-12d3-a456-426614174000';

  console.log('⚠️  The following tests will make API calls to Terminal49:');
  console.log(`   Container ID: ${containerId}`);
  console.log('');

  await testGetContainer(containerId);
  await testReadResource(containerId);

  console.log('✅ All tests complete!');
}

runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
