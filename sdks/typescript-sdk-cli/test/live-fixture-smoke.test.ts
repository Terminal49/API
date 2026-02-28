import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderTable } from '../src/output/table.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'api',
  'live',
);

function readFixture<T = unknown>(name: string): T {
  const raw = readFileSync(join(fixtureDir, name), 'utf8');
  return JSON.parse(raw) as T;
}

describe('live fixture smoke', () => {
  it('renders high-signal search table rows from live payload', () => {
    const payload = readFixture<any>('search.container-number.json');
    expect(payload.ok).toBe(true);

    const output = renderTable('search', payload.data);
    expect(output).toContain('Match');
    expect(output).toContain('Result Type');
    expect(output).toContain('Details');
    expect(output).toContain('HLCUIT1251213429');
    expect(output).toContain('shipment');
    expect(output).toContain('SCAC HLCU');
  });

  it('renders useful columns for custom field definitions raw list', () => {
    const payload = readFixture<any>('custom-field-definitions.list.json');
    expect(payload.ok).toBe(true);

    const output = renderTable('custom-field-definitions.list', payload.data);
    expect(output).toContain('Entity');
    expect(output).toContain('Slug');
    expect(output).toContain('Display Name');
    expect(output).toContain('Data Type');
  });

  it('renders useful columns for parties raw list', () => {
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
    expect(output).toContain('ID');
    expect(output).toContain('Type');
    expect(output).toContain(String(terminalId));
  });

  it('captures upstream and validation error envelope fixtures', () => {
    const upstream = readFixture<any>('custom-fields.list.error.json');
    const validation = readFixture<any>('webhook-notifications.examples.error.json');

    expect(upstream.ok).toBe(false);
    expect(upstream.error.code).toBe('UPSTREAM_ERROR');
    expect(validation.ok).toBe(false);
    expect(validation.error.code).toBe('VALIDATION_ERROR');
  });
});
