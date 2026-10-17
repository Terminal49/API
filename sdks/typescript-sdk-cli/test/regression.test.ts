import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthenticationError, NetworkError } from '@terminal49/sdk';
import { Command, InvalidArgumentError } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { listFilters } from '../src/commands/tracking-requests.js';
import { getExitCode } from '../src/errors.js';
import { createProgram } from '../src/index.js';
import { resetApiStub, runProgram } from './helpers.js';

afterEach(resetApiStub);

function findCommand(program: Command, path: string[]): Command {
  let current = program;
  for (const name of path) {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) throw new Error(`Missing command: ${path.join(' ')}`);
    current = next;
  }
  return current;
}

function optionLongNames(command: Command): string[] {
  return command.options.map((option) => option.long);
}

describe('CLI regressions', () => {
  it('tracking-requests list maps --status to filter[status]', () => {
    expect(listFilters({ status: 'succeeded' })).toMatchObject({
      'filter[status]': 'succeeded',
    });
  });

  it('maps key error classes to stable exit codes', () => {
    expect(getExitCode(new NetworkError('connection failed'))).toBe(9);
    expect(getExitCode(new AuthenticationError('bad token'))).toBe(3);
    expect(getExitCode(new InvalidArgumentError('bad args'))).toBe(2);
  });

  it('config set rejects unknown keys and redacts token in get/list', async () => {
    const configHome = mkdtempSync(join(tmpdir(), 't49-cli-config-'));
    const token = 'tok_secret_123456';
    process.env.XDG_CONFIG_HOME = configHome;

    const unknown = await runProgram([
      '--json',
      'config',
      'set',
      'unknownKey',
      'value',
    ]);
    expect(unknown.status).toBe(2);
    expect(JSON.parse(unknown.stderr)).toMatchObject({
      ok: false,
      error: { code: 'USAGE_ERROR' },
    });

    const set = await runProgram(['--json', 'config', 'set', 'token', token]);
    expect(set.status).toBe(0);

    const get = await runProgram(['--json', 'config', 'get', 'token']);
    expect(get.status).toBe(0);
    expect(get.stdout).not.toContain(token);
    expect(JSON.parse(get.stdout)).toMatchObject({
      ok: true,
      data: { key: 'token', value: 'tok_...3456' },
    });

    const list = await runProgram(['--json', 'config', 'list']);
    expect(list.status).toBe(0);
    expect(list.stdout).not.toContain(token);
    expect(JSON.parse(list.stdout)).toMatchObject({
      ok: true,
      data: { token: 'tok_...3456' },
    });
  });

  it('shipments and containers list do not expose unsupported SDK filters', () => {
    const program = createProgram();
    const containers = optionLongNames(
      findCommand(program, ['containers', 'list']),
    );
    const shipments = optionLongNames(
      findCommand(program, ['shipments', 'list']),
    );

    expect(containers).not.toContain('--status');
    expect(containers).not.toContain('--port');
    expect(containers).not.toContain('--carrier');
    expect(containers).not.toContain('--updated-after');
    expect(shipments).not.toContain('--status');
    expect(shipments).not.toContain('--port');
    expect(shipments).not.toContain('--carrier');
    expect(shipments).not.toContain('--updated-after');
  });

  it('vessels future-positions requires both port ids', async () => {
    process.env.T49_API_TOKEN = 'token-123';
    const result = await runProgram([
      '--json',
      'vessels',
      'future-positions',
      'v-1',
      '--port-id',
      'port-2',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "required option '--previous-port-id <id>' not specified",
    );
  });

  it('vessels future-positions sends --port-id and --previous-port-id as their own params', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: Request | URL | string) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    process.env.T49_API_TOKEN = 'token-123';
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 't49-cli-'));

    const result = await runProgram([
      '--json',
      'vessels',
      'future-positions',
      'v-1',
      '--port-id',
      'port-2',
      '--previous-port-id',
      'port-1',
    ]);

    expect(result.status).toBe(0);
    expect(urls).toEqual([
      'https://api.test/v2/vessels/v-1/future_positions?port_id=port-2&previous_port_id=port-1',
    ]);
  });

  it('vessels future-positions-coords rejects a non-numeric latitude', async () => {
    process.env.T49_API_TOKEN = 'token-123';
    const result = await runProgram([
      '--json',
      'vessels',
      'future-positions-coords',
      'v-1',
      '--port-id',
      'port-2',
      '--previous-port-id',
      'port-1',
      '--latitude',
      'north',
      '--longitude',
      '-100.84',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--latitude must be a number');
  });

  it('custom-field-definitions list reads the account definitions, or the templates with --templates', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: Request | URL | string) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    process.env.T49_API_TOKEN = 'token-123';
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 't49-cli-'));

    const account = await runProgram([
      '--json',
      'custom-field-definitions',
      'list',
    ]);
    const templates = await runProgram([
      '--json',
      'custom-field-definitions',
      'list',
      '--templates',
    ]);

    expect([account.status, templates.status]).toEqual([0, 0]);
    expect(urls).toEqual([
      'https://api.test/v2/accounts/current/custom_field_definitions',
      'https://api.test/v2/custom_field_definitions',
    ]);
  });

  it('vessels future-positions-coords rejects an empty latitude without a request', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: Request | URL | string) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response('{}', { status: 200 });
    });
    process.env.T49_API_TOKEN = 'token-123';
    const result = await runProgram([
      '--json',
      'vessels',
      'future-positions-coords',
      'v-1',
      '--port-id',
      'p',
      '--previous-port-id',
      'q',
      '--latitude',
      '',
      '--longitude',
      '1',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--latitude must be a number');
    expect(urls).toEqual([]);
  });

  it('vessels future-positions-coords sends the spec query params', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: Request | URL | string) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    process.env.T49_API_TOKEN = 'token-123';
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 't49-cli-'));

    const result = await runProgram([
      '--json',
      'vessels',
      'future-positions-coords',
      'v-1',
      '--port-id',
      'port-2',
      '--previous-port-id',
      'port-1',
      '--latitude',
      '13.07',
      '--longitude',
      '-100.84',
    ]);

    expect(result.status).toBe(0);
    expect(urls).toEqual([
      'https://api.test/v2/vessels/v-1/future_positions_with_coordinates?port_id=port-2&previous_port_id=port-1&latitude=13.07&longitude=-100.84',
    ]);
  });

  it('containers route prints mapped ports and map prints the unmapped GeoJSON', async () => {
    const collection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [121.5, 31.2] },
          properties: {
            feature_type: 'port',
            location_id: 'loc-1',
            name: 'Shanghai',
            ports_sequence: 1,
          },
        },
      ],
    };
    const paths: string[] = [];
    vi.stubGlobal('fetch', async (input: Request | URL | string) => {
      paths.push(
        new URL(input instanceof Request ? input.url : String(input)).pathname,
      );
      return new Response(JSON.stringify(collection), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    process.env.T49_API_TOKEN = 'token-123';
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 't49-cli-'));

    const route = await runProgram(['--json', 'containers', 'route', 'c-1']);
    const map = await runProgram(['--json', 'containers', 'map', 'c-1']);
    const mapBoth = await runProgram([
      '--json',
      '--format',
      'both',
      'containers',
      'map',
      'c-1',
    ]);
    const mapTable = await runProgram(['--table', 'containers', 'map', 'c-1']);

    expect([route.status, map.status, mapBoth.status, mapTable.status]).toEqual(
      [0, 0, 0, 0],
    );
    expect(JSON.parse(mapBoth.stdout).data).toEqual({
      raw: collection,
      mapped: collection,
    });
    expect(mapTable.stdout).toBe(
      [
        '┌───────────────────┐',
        '│ Type              │',
        '├───────────────────┤',
        '│ FeatureCollection │',
        '└───────────────────┘',
        '',
      ].join('\n'),
    );
    expect(JSON.parse(route.stdout).data).toEqual({
      ports: [
        {
          locationId: 'loc-1',
          name: 'Shanghai',
          countryCode: null,
          label: null,
          sequence: 1,
          coordinates: { latitude: 31.2, longitude: 121.5 },
          inbound: { eta: null, ata: null },
          outbound: { etd: null, atd: null },
        },
      ],
      currentVessel: null,
      totalPorts: 1,
    });
    expect(JSON.parse(map.stdout).data).toEqual(collection);
    expect(paths).toEqual([
      '/v2/containers/c-1/map_geojson',
      '/v2/containers/c-1/map_geojson',
      '/v2/containers/c-1/map_geojson',
      '/v2/containers/c-1/map_geojson',
    ]);
  });

  it('containers route --table prints the ports and vessel the SDK maps from map_geojson', async () => {
    const geojson = readFileSync(
      new URL(
        '../../typescript-sdk/src/fixtures/containers.map_geojson.json',
        import.meta.url,
      ),
      'utf8',
    );
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(geojson, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    process.env.T49_API_TOKEN = 'token-123';
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 't49-cli-'));

    const result = await runProgram(['--table', 'containers', 'route', 'c-1']);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        '┌─────┬───────┬──────────────┬─────────┬──────────────────────┬──────────────────────┬──────────────┬──────────────────────┐',
        '│ Seq │ Label │ Port         │ Country │ Inbound ETA          │ Inbound ATA          │ Outbound ETD │ Outbound ATD         │',
        '├─────┼───────┼──────────────┼─────────┼──────────────────────┼──────────────────────┼──────────────┼──────────────────────┤',
        '│ 1   │ POL   │ Laem Chabang │ TH      │                      │                      │              │ 2025-11-08T00:44:52Z │',
        '├─────┼───────┼──────────────┼─────────┼──────────────────────┼──────────────────────┼──────────────┼──────────────────────┤',
        '│ 2   │ TS1   │ Xiamen       │ CN      │                      │ 2025-11-15T16:00:00Z │              │ 2025-11-19T16:00:00Z │',
        '├─────┼───────┼──────────────┼─────────┼──────────────────────┼──────────────────────┼──────────────┼──────────────────────┤',
        '│ 3   │ POD   │ Savannah     │ US      │ 2025-12-31T05:00:00Z │                      │              │                      │',
        '└─────┴───────┴──────────────┴─────────┴──────────────────────┴──────────────────────┴──────────────┴──────────────────────┘',
        'Current vessel',
        '┌─────────────┬─────────┬────────┬──────────────┬────────────────┬─────────┬────────────┬──────────────────────┐',
        '│ Vessel      │ IMO     │ Voyage │ Latitude     │ Longitude      │ Heading │ Speed (kn) │ Position At          │',
        '├─────────────┼─────────┼────────┼──────────────┼────────────────┼─────────┼────────────┼──────────────────────┤',
        '│ ZIM BANGKOK │ 9936525 │ 13E    │ 31.023033333 │ -131.128473333 │ 108     │ 21         │ 2025-12-11T11:46:03Z │',
        '└─────────────┴─────────┴────────┴──────────────┴────────────────┴─────────┴────────────┴──────────────────────┘',
        '',
      ].join('\n'),
    );
  });
});
