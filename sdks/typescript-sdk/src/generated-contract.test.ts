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

// Each case type-checks the full generated OpenAPI module, which outlasts the
// default 5s timeout when the workspace test suites run concurrently.
describe('generated public resource contracts', { timeout: 30_000 }, () => {
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
});
