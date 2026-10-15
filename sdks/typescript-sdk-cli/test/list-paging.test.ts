import type { Command } from 'commander';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createProgram } from '../src/index.js';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

function commandPaths(command: Command, path: string[] = []): string[][] {
  return command.commands.flatMap((child) => {
    const childPath = [...path, child.name()];
    return child.commands.length > 0
      ? commandPaths(child, childPath)
      : [childPath];
  });
}

function findCommand(path: string[]): Command {
  return path.reduce<Command>((current, name) => {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) throw new Error(`Missing command: ${path.join(' ')}`);
    return next;
  }, createProgram());
}

const commandsWithAll = commandPaths(createProgram()).filter((path) =>
  findCommand(path).options.some((option) => option.long === '--all'),
);

function pageOf(page: number) {
  return {
    data: [{ id: `row-${page}`, type: 'party', attributes: {} }],
    links:
      page < 2
        ? { next: `https://api.test/v2/x?page[number]=${page + 1}` }
        : {},
  };
}

describe('list paging flags', () => {
  it('advertises --all only on the lists that can iterate', () => {
    expect(commandsWithAll.map((path) => path.join(' '))).toEqual([
      'containers list',
      'shipments list',
      'tracking-requests list',
      'parties list',
    ]);
  });

  it.each(commandsWithAll)('%s %s --all emits every row', async (...path) => {
    stubApi(({ url }) =>
      pageOf(Number(url.searchParams.get('page[number]') ?? '1')),
    );

    const result = await runProgram([...path, '--all']);

    expect(result.status).toBe(0);
    const rows = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows.map((row) => row.id)).toEqual(['row-1', 'row-2']);
  });

  it.each([
    [
      ['containers', 'list', '--include', 'shipment'],
      '?include=shipment&page[number]=1&page[size]=3',
    ],
    [
      ['shipments', 'list', '--number', 'BL1'],
      '?filter[number]=BL1&include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal&page[number]=1&page[size]=3',
    ],
    [
      ['tracking-requests', 'list', '--status', 'failed'],
      '?filter[status]=failed&page[number]=1&page[size]=3',
    ],
    [['parties', 'list'], '?page[number]=1&page[size]=3'],
  ])(
    '%s --all sends the filters and --page-size and stops at --max-rows inside a page',
    async (command, search) => {
      const requests = stubApi(() => ({
        data: ['a', 'b', 'c'].map((suffix) => ({
          id: `row-${suffix}`,
          type: 'party',
          attributes: {},
        })),
        links: { next: 'https://api.test/v2/x?page[number]=2' },
      }));

      const result = await runProgram([
        ...command,
        '--all',
        '--page-size',
        '3',
        '--max-rows',
        '2',
      ]);

      expect(result.status).toBe(0);
      const rows = result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows.map((row) => row.id)).toEqual(['row-a', 'row-b']);
      expect(requests.map(({ url }) => decodeURIComponent(url.search))).toEqual(
        [search],
      );
    },
  );

  it.each([
    [
      ['containers', 'list', '--include', 'shipment'],
      '?include=shipment&page[number]=2&page[size]=5',
    ],
    [
      ['shipments', 'list', '--number', 'BL1'],
      '?filter[number]=BL1&include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal&page[number]=2&page[size]=5',
    ],
    [
      ['tracking-requests', 'list', '--status', 'failed'],
      '?filter[status]=failed&page[number]=2&page[size]=5',
    ],
  ])(
    '%s without --all sends the filters, --page, and --page-size',
    async (command, search) => {
      const requests = stubApi(() => ({ data: [] }));

      const result = await runProgram([
        '--json',
        ...command,
        '--page',
        '2',
        '--page-size',
        '5',
      ]);

      expect(result.status).toBe(0);
      expect(requests.map(({ url }) => decodeURIComponent(url.search))).toEqual(
        [search],
      );
    },
  );

  it.each(commandsWithAll)(
    '%s %s --all stops at --max-pages while the API still links a next page',
    async (...path) => {
      const requests = stubApi(({ url }) => ({
        data: [
          {
            id: `row-${url.searchParams.get('page[number]') ?? '1'}`,
            type: 'party',
            attributes: {},
          },
        ],
        links: { next: 'https://api.test/v2/x?page[number]=99' },
      }));

      const result = await runProgram([...path, '--all', '--max-pages', '1']);

      expect(result.status).toBe(0);
      expect(
        result.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).id),
      ).toEqual(['row-1']);
      expect(requests).toHaveLength(1);
    },
  );

  it('parties list --all stops at an empty page even with a next link', async () => {
    const requests = stubApi(() => ({
      data: [],
      links: { next: 'https://api.test/v2/parties?page[number]=2' },
    }));

    const result = await runProgram(['parties', 'list', '--all']);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(requests.map(({ url }) => url.search)).toEqual(['?page[number]=1']);
  });

  it.each([
    ['webhooks', 'list'],
    ['webhook-notifications', 'list'],
    ['parties', 'list'],
  ])('%s %s sends --page and --page-size to the API', async (...path) => {
    const requests = stubApi(() => ({ data: [] }));

    const result = await runProgram([
      '--json',
      ...path,
      '--page',
      '2',
      '--page-size',
      '5',
    ]);

    expect(result.status).toBe(0);
    expect(requests.map(({ url }) => url.search)).toEqual([
      '?page[number]=2&page[size]=5',
    ]);
  });

  it.each([
    ['custom-fields', 'list'],
    ['custom-field-definitions', 'list'],
    ['custom-field-options', 'list', 'def-1'],
    ['shipping-lines', 'list'],
  ])(
    '%s %s offers no paging flags because the API returns the whole list',
    (...path) => {
      const longNames = findCommand(path.slice(0, 2)).options.map(
        (option) => option.long,
      );
      expect(longNames).not.toContain('--page');
      expect(longNames).not.toContain('--page-size');
      expect(longNames).not.toContain('--all');
    },
  );
});
