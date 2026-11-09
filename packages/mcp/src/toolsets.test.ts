import { describe, expect, it } from 'vite-plus/test';
import { resolveToolSelection, ToolSelectionRequestError } from './toolsets.js';
import { DEFAULT_TOOLSETS, selectTools } from './tools/registry.js';

const RECORD_WRITES = ['set_party_role', 'set_custom_field'];

function selectedRecordWrites(
  input: Parameters<typeof resolveToolSelection>[0],
): string[] {
  return selectTools(resolveToolSelection(input))
    .map((tool) => tool.name)
    .filter((name) => RECORD_WRITES.includes(name));
}

describe('resolveToolSelection', () => {
  it('serves the default toolsets when the operator sets none', () => {
    expect(resolveToolSelection({ env: {}, credentialType: 'user' })).toEqual({
      toolsets: DEFAULT_TOOLSETS,
      readOnly: false,
    });
  });

  it('serves the toolsets the operator allows', () => {
    const selection = resolveToolSelection({
      env: { T49_MCP_TOOLSETS: ' core , operations,developer ' },
      credentialType: 'user',
    });

    expect(selection.toolsets).toEqual(['core', 'operations', 'developer']);
  });

  it('rejects an operator allowlist with an unknown toolset', () => {
    expect(() =>
      resolveToolSelection({
        env: { T49_MCP_TOOLSETS: 'core,admin' },
        credentialType: 'user',
      }),
    ).toThrow(/T49_MCP_TOOLSETS/);
  });

  it.each([',', ' , ', ', ,'])(
    'rejects an operator allowlist of only separators: %j',
    (value) => {
      expect(() =>
        resolveToolSelection({
          env: { T49_MCP_TOOLSETS: value },
          credentialType: 'api_key',
        }),
      ).toThrow(/T49_MCP_TOOLSETS/);
    },
  );

  it('rejects a toolsets header of only separators', () => {
    expect(() =>
      resolveToolSelection({
        env: {},
        credentialType: 'api_key',
        toolsetsHeader: ' , ',
      }),
    ).toThrow(ToolSelectionRequestError);
  });

  it('narrows to the intersection of the header and the allowlist', () => {
    const selection = resolveToolSelection({
      env: { T49_MCP_TOOLSETS: 'core,documents' },
      credentialType: 'api_key',
      toolsetsHeader: 'documents,operations',
    });

    expect(selection.toolsets).toEqual(['documents']);
  });

  it('never widens the allowlist from the header', () => {
    const selection = resolveToolSelection({
      env: {},
      credentialType: 'api_key',
      toolsetsHeader: 'operations,developer',
    });

    expect(selection.toolsets).toEqual(['operations']);
  });

  it('ignores an empty toolsets header', () => {
    const selection = resolveToolSelection({
      env: {},
      credentialType: 'api_key',
      toolsetsHeader: '  ',
    });

    expect(selection.toolsets).toEqual(DEFAULT_TOOLSETS);
  });

  it('rejects a toolsets header with an unknown toolset', () => {
    expect(() =>
      resolveToolSelection({
        env: {},
        credentialType: 'api_key',
        toolsetsHeader: 'core,everything',
      }),
    ).toThrow(ToolSelectionRequestError);
  });

  it('turns on read-only mode from the env or the header', () => {
    expect(
      resolveToolSelection({
        env: { T49_MCP_READ_ONLY: 'true' },
        credentialType: 'user',
      }).readOnly,
    ).toBe(true);
    expect(
      resolveToolSelection({
        env: {},
        credentialType: 'user',
        readOnlyHeader: 'TRUE',
      }).readOnly,
    ).toBe(true);
  });

  it('accepts 1 and 0 as read-only header values', () => {
    expect(
      resolveToolSelection({
        env: {},
        credentialType: 'user',
        readOnlyHeader: '1',
      }).readOnly,
    ).toBe(true);
    expect(
      resolveToolSelection({
        env: {},
        credentialType: 'user',
        readOnlyHeader: '0',
      }).readOnly,
    ).toBe(false);
  });

  it('does not let the header turn off read-only mode set in the env', () => {
    expect(
      resolveToolSelection({
        env: { T49_MCP_READ_ONLY: '1' },
        credentialType: 'user',
        readOnlyHeader: 'false',
      }).readOnly,
    ).toBe(true);
  });

  it('rejects a read-only header that is not a boolean', () => {
    expect(() =>
      resolveToolSelection({
        env: {},
        credentialType: 'user',
        readOnlyHeader: 'yes',
      }),
    ).toThrow(ToolSelectionRequestError);
  });

  it('rejects a read-only env value that is not a boolean', () => {
    expect(() =>
      resolveToolSelection({
        env: { T49_MCP_READ_ONLY: 'yes' },
        credentialType: 'user',
      }),
    ).toThrow(/T49_MCP_READ_ONLY/);
  });

  it('limits the shared env token to core and trade', () => {
    const selection = resolveToolSelection({
      env: { T49_MCP_TOOLSETS: 'core,documents,operations,trade' },
      credentialType: 'shared_token',
    });

    expect(selection.toolsets).toEqual(['core', 'trade']);
  });

  it('lets the operator allow more toolsets for the shared env token', () => {
    const selection = resolveToolSelection({
      env: {
        T49_MCP_TOOLSETS: 'core,documents,operations',
        T49_MCP_ALLOW_SHARED_TOKEN_WRITES: 'true',
      },
      credentialType: 'shared_token',
    });

    expect(selection.toolsets).toEqual(['core', 'documents', 'operations']);
  });

  it('serves the record write tools to a signed-in user by default', () => {
    expect(selectedRecordWrites({ env: {}, credentialType: 'user' })).toEqual(
      RECORD_WRITES,
    );
  });

  it('keeps the record write tools from the shared env token by default', () => {
    expect(
      selectedRecordWrites({ env: {}, credentialType: 'shared_token' }),
    ).toEqual([]);
  });

  it('lets a client keep core reads without the record write tools', () => {
    expect(
      selectedRecordWrites({
        env: {},
        credentialType: 'user',
        toolsetsHeader: 'core',
      }),
    ).toEqual([]);
  });
});
