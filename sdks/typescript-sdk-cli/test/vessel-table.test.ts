import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

const futurePositions = {
  data: {
    id: 'v-1',
    type: 'vessel',
    attributes: {
      name: 'EVER GIVEN',
      imo: '9811000',
      positions: [
        {
          latitude: 13.07,
          longitude: -100.84,
          heading: 90,
          timestamp: '2026-10-15T00:00:00Z',
          estimated: true,
        },
        {
          latitude: 14.1,
          longitude: -101.2,
          heading: null,
          timestamp: '2026-10-16T00:00:00Z',
          estimated: true,
        },
      ],
    },
  },
};

const expectedTable = [
  'Vessel EVER GIVEN (IMO 9811000)',
  '┌──────────────────────┬──────────┬───────────┬─────────┬───────────┐',
  '│ Timestamp            │ Latitude │ Longitude │ Heading │ Estimated │',
  '├──────────────────────┼──────────┼───────────┼─────────┼───────────┤',
  '│ 2026-10-15T00:00:00Z │ 13.07    │ -100.84   │ 90      │ true      │',
  '├──────────────────────┼──────────┼───────────┼─────────┼───────────┤',
  '│ 2026-10-16T00:00:00Z │ 14.1     │ -101.2    │         │ true      │',
  '└──────────────────────┴──────────┴───────────┴─────────┴───────────┘',
  '',
].join('\n');

describe('vessels future positions table', () => {
  it.each([
    ['mapped', 'future-positions'],
    ['raw', 'future-positions'],
    ['both', 'future-positions'],
    ['mapped', 'future-positions-coords'],
  ])('--format %s %s prints one row per position', async (format, command) => {
    stubApi(() => futurePositions);
    const coords =
      command === 'future-positions-coords'
        ? ['--latitude', '13', '--longitude', '-100']
        : [];

    const result = await runProgram([
      '--table',
      '--format',
      format,
      'vessels',
      command,
      'v-1',
      '--port-id',
      'p-2',
      '--previous-port-id',
      'p-1',
      ...coords,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expectedTable);
  });
});
