import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const generatedPath = fileURLToPath(
  new URL('./generated/terminal49.js', import.meta.url),
);

function compileConsumer(source: string) {
  const directory = mkdtempSync(join(tmpdir(), 't49-contract-'));
  const consumerPath = join(directory, 'consumer.ts');

  try {
    writeFileSync(
      consumerPath,
      `import type { components } from ${JSON.stringify(generatedPath)};\n${source}`,
    );
    const program = ts.createProgram([consumerPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('generated public resource contracts', () => {
  it('accepts a container payload using the public resource discriminant', () => {
    const diagnostics = compileConsumer(`
const container: components['schemas']['container'] = {
  id: 'container-1',
  type: 'container',
  attributes: { number: 'MSCU1234567' },
};
const resourceType: 'container' = container.type;
`);
    expect(diagnostics).toEqual([]);
  });

  it('rejects an account resource used as a container', () => {
    const diagnostics = compileConsumer(`
const container: components['schemas']['container'] = {
  id: 'container-1',
  type: 'account',
  attributes: {},
};
`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2322);
    expect(diagnostics[0]?.message).toContain('"account"');
    expect(diagnostics[0]?.message).toContain('"container"');
  });

  it('preserves named route links and nullable single-resource access', () => {
    expect(
      compileConsumer(`
const location: components['schemas']['route_location'] = {
  id: 'route-location-1',
  type: 'route_location',
  attributes: {},
  relationships: {
    route: { data: { id: 'route-1', type: 'route' } },
    location: { data: { id: 'port-1', type: 'port' } },
    inbound_vessel: { data: null },
    outbound_vessel: { data: { id: 'vessel-1', type: 'vessel' } },
    facility: { data: null },
    future_relationship: { data: [{ id: 'future-1', type: 'future' }] },
  },
};
const routeId: string | undefined = location.relationships?.route?.data?.id;
const routeType: 'route' | undefined = location.relationships?.route?.data?.type;
const locationType: 'port' | 'terminal' | undefined = location.relationships?.location?.data?.type;
const inboundType: 'vessel' | undefined = location.relationships?.inbound_vessel?.data?.type;
const outboundType: 'vessel' | undefined = location.relationships?.outbound_vessel?.data?.type;
const facilityType: 'port' | 'terminal' | undefined = location.relationships?.facility?.data?.type;
type Relationships = NonNullable<components['schemas']['route_location']['relationships']>;
const unknownLocation: Relationships = { location: { data: null } };
const terminalLocation: Relationships = { location: { data: { id: 'terminal-1', type: 'terminal' } } };
`),
    ).toEqual([]);
  });

  it.each([
    'route',
    'location',
    'inbound_vessel',
    'outbound_vessel',
    'facility',
  ])('rejects the wrong resource target for %s', (relationship) => {
    const diagnostics = compileConsumer(`
type Relationships = NonNullable<components['schemas']['route_location']['relationships']>;
const relationships: Relationships = {
  ${relationship}: { data: { id: 'account-1', type: 'account' } },
};
`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2322);
    expect(diagnostics[0]?.message).toContain('"account"');
  });

  it('rejects an array where a named single-resource link is expected', () => {
    const diagnostics = compileConsumer(`
type Relationships = NonNullable<components['schemas']['route_location']['relationships']>;
const relationships: Relationships = {
  outbound_vessel: { data: [{ id: 'vessel-1', type: 'vessel' }] },
};
`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2739);
    expect(diagnostics[0]?.message).toContain('id, type');
  });

  it.each(['location', 'inbound_vessel', 'outbound_vessel', 'facility'])(
    'requires a null guard before reading %s linkage',
    (relationship) => {
      const diagnostics = compileConsumer(`
type Relationships = NonNullable<components['schemas']['route_location']['relationships']>;
type Link = NonNullable<Relationships['${relationship}']>['data'];
function readId(link: Link) { return link.id; }
`);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe(18049);
      expect(diagnostics[0]?.message).toBe(
        "'link' is possibly 'null' or 'undefined'.",
      );
    },
  );
});
