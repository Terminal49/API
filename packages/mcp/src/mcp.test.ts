import { describe, expect, it, vi } from 'vitest';
import { createTerminal49McpServer } from './server.js';

// Minimal mock transport implementing start/close
class MockTransport {
  start = vi.fn();
  close = vi.fn();
}

describe('MCP server wiring', () => {
  it('connects without throwing and registers MCP handlers', async () => {
    const server = createTerminal49McpServer('token', 'https://api.test');
    await server.connect(new MockTransport() as any);
    expect(typeof server).toBe('object');
    expect(typeof (server as any).registerTool).toBe('function');
  });
});
