import { describe, expect, it } from 'vite-plus/test';
import {
  missingDefaultWriteTools,
  resolveSandboxConfig,
  writesEnabled,
} from './client.js';

const ENDPOINT = 'https://mcp.terminal49.com/mcp';

describe('resolveSandboxConfig', () => {
  it.each([
    ['nothing is set', {}],
    ['only the flag is set', { MCP_EVAL_ENABLE_WRITE: '1' }],
    ['only the sandbox key is set', { MCP_EVAL_SANDBOX_TOKEN: 'sandbox-key' }],
    [
      'the flag is not 1 or true',
      { MCP_EVAL_ENABLE_WRITE: 'yes', MCP_EVAL_SANDBOX_TOKEN: 'sandbox-key' },
    ],
    [
      'the sandbox key is blank',
      { MCP_EVAL_ENABLE_WRITE: 'true', MCP_EVAL_SANDBOX_TOKEN: '  ' },
    ],
  ])('skips the write evals when %s', (_case, env) => {
    expect(resolveSandboxConfig(env)).toBeNull();
  });

  it('never falls back to the read eval credentials', () => {
    expect(
      resolveSandboxConfig({
        MCP_EVAL_ENABLE_WRITE: '1',
        MCP_EVAL_TOKEN: 'read-key',
        MCP_EVAL_BEARER: 'read-bearer',
      }),
    ).toBeNull();
  });

  it('uses the sandbox key, and the sandbox user token when set', () => {
    expect(
      resolveSandboxConfig({
        MCP_EVAL_ENABLE_WRITE: 'true',
        MCP_EVAL_SANDBOX_TOKEN: ' sandbox-key ',
        MCP_EVAL_TOKEN: 'read-key',
      }),
    ).toEqual({
      sandbox: { endpoint: ENDPOINT, scheme: 'Token', token: 'sandbox-key' },
    });

    expect(
      resolveSandboxConfig({
        MCP_EVAL_ENABLE_WRITE: '1',
        MCP_EVAL_SANDBOX_TOKEN: 'sandbox-key',
        MCP_EVAL_SANDBOX_BEARER: 'user-token',
        MCP_EVAL_ENDPOINT: 'http://localhost:4000/mcp',
      }),
    ).toEqual({
      sandbox: {
        endpoint: 'http://localhost:4000/mcp',
        scheme: 'Token',
        token: 'sandbox-key',
      },
      user: {
        endpoint: 'http://localhost:4000/mcp',
        scheme: 'Bearer',
        token: 'user-token',
      },
    });
  });
});

describe('writesEnabled', () => {
  it('accepts only 1 and true', () => {
    expect(writesEnabled({ MCP_EVAL_ENABLE_WRITE: '1' })).toBe(true);
    expect(writesEnabled({ MCP_EVAL_ENABLE_WRITE: 'true' })).toBe(true);
    expect(writesEnabled({ MCP_EVAL_ENABLE_WRITE: '0' })).toBe(false);
    expect(writesEnabled({})).toBe(false);
  });
});

describe('missingDefaultWriteTools', () => {
  const writeTools = [
    'track_container',
    'stop_shipment_tracking',
    'resume_shipment_tracking',
    'cancel_tracking_request',
    'add_reference_numbers',
    'remove_reference_numbers',
    'assign_party',
    'unassign_party',
    'set_custom_field',
    'update_custom_field',
    'relink_document',
    'update_document',
  ];

  it('finds nothing missing when the gateway lists every default write tool', () => {
    expect(
      missingDefaultWriteTools(['search_container', 'whoami', ...writeTools]),
    ).toEqual([]);
  });

  it('names every write tool a read-only gateway leaves out', () => {
    expect(missingDefaultWriteTools(['search_container', 'whoami'])).toEqual(
      writeTools,
    );
  });

  it('names the document writes a gateway without documents_write leaves out', () => {
    expect(
      missingDefaultWriteTools(
        writeTools.filter(
          (name) => name !== 'relink_document' && name !== 'update_document',
        ),
      ),
    ).toEqual(['relink_document', 'update_document']);
  });
});
