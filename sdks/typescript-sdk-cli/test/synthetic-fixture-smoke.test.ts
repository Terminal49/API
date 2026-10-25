import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { renderTable } from '../src/output/table.js';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'api',
  'synthetic',
);

function readFixture<T = unknown>(name: string): T {
  const raw = readFileSync(join(fixtureDir, name), 'utf8');
  return JSON.parse(raw) as T;
}

describe('synthetic fixture smoke', () => {
  it('keeps every list fixture in the mapped list envelope', () => {
    const listFixtures = readdirSync(fixtureDir).filter((name) =>
      name.endsWith('.list.json'),
    );
    expect(listFixtures.length).toBeGreaterThan(0);

    for (const name of listFixtures) {
      const payload = readFixture<any>(name);
      expect(payload.ok, name).toBe(true);
      expect(Array.isArray(payload.data), name).toBe(true);
    }
  });

  it('renders high-signal search table rows from synthetic payload', () => {
    const payload = readFixture<any>('search.container-number.json');
    expect(payload.ok).toBe(true);

    const output = renderTable('search', payload.data);
    expect(output).toContain('Match');
    expect(output).toContain('Result Type');
    expect(output).toContain('Details');
    expect(output).toContain('SYNTHBOL000001');
    expect(output).toContain('shipment');
    expect(output).toContain('SCAC SYNU');
  });

  it('renders useful columns for the custom field definitions list', () => {
    const payload = readFixture<any>('custom-field-definitions.list.json');
    expect(payload.ok).toBe(true);

    const output = renderTable('custom-field-definitions.list', payload.data);
    expect(output).toContain('Entity');
    expect(output).toContain('Slug');
    expect(output).toContain('Display Name');
    expect(output).toContain('Data Type');
  });

  it('renders useful columns for the parties list', () => {
    const payload = readFixture<any>('parties.list.json');
    expect(payload.ok).toBe(true);

    const output = renderTable('parties.list', payload.data);
    expect(output).toContain('ID');
    expect(output).toContain('Company');
  });

  it('renders JSON:API single-resource payloads in table mode', () => {
    const payload = readFixture<any>('terminals.get.json');
    expect(payload.ok).toBe(true);

    const terminalId = payload?.data?.data?.id;
    const output = renderTable('terminals.get', payload.data);
    expect(output).toContain('id');
    expect(output).toContain('type');
    expect(output).toContain(String(terminalId));
  });

  for (const [name, value] of [
    ['demurrage', '2026-01-20'],
    ['rail', 'SYNR'],
  ] as const) {
    it(`matches the ${name} command output and renders its synthetic table`, async () => {
      const raw = JSON.parse(
        readFileSync(
          new URL(
            '../../typescript-sdk/src/fixtures/containers.get.include.json',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      stubApi(() => raw);

      const json = await runProgram([
        '--json',
        'containers',
        name,
        'container-1',
      ]);
      expect(json.status).toBe(0);
      const output = JSON.parse(json.stdout);
      expect(output.command).toBe(`containers.${name}`);
      expect({ ok: output.ok, data: output.data }).toEqual(
        readFixture(`containers.${name}.json`),
      );

      const table = await runProgram([
        '--table',
        'containers',
        name,
        'container-1',
      ]);
      expect(table.status).toBe(0);
      expect(table.stdout).toContain(value);
      expect(table.stdout).toBe(
        readFileSync(
          join(
            dirname(fixtureDir),
            '..',
            'table',
            'synthetic',
            `containers.${name}.txt`,
          ),
          'utf8',
        ),
      );
    });
  }

  it('captures upstream and validation error envelope fixtures', () => {
    const upstream = readFixture<any>('custom-fields.list.error.json');
    const validation = readFixture<any>(
      'webhook-notifications.examples.error.json',
    );

    for (const payload of [upstream, validation]) {
      expect(Object.keys(payload)).toEqual(['ok', 'error']);
    }
    expect(upstream.ok).toBe(false);
    expect(upstream.error.code).toBe('UPSTREAM_ERROR');
    expect(validation.ok).toBe(false);
    expect(validation.error.code).toBe('VALIDATION_ERROR');
  });
});
