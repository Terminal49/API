import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { executeListContainers } from './list-containers.js';
import { executeSummarizeContainers } from './summarize-containers.js';

// Exercise the real SDK mapping, not a mock that could mask dropped metadata.
describe('container tools refuse ignored filters', () => {
  for (const summary of [false, true]) {
    for (const ignored of [undefined, [], ['current_status']]) {
      it(`${summary ? 'summary' : 'list'} ${ignored?.length ? 'refuses ignored filters' : 'allows supported filters'}`, async () => {
        const client = new Terminal49Client({
          apiToken: 'TEST_KEY',
          fetchImpl: async () =>
            Response.json({
              data: [],
              meta: {
                total: 0,
                group_by: 'current_status',
                truncated: false,
                ...(ignored === undefined ? {} : { ignored_filters: ignored }),
              },
            }),
        });
        const result = summary
          ? executeSummarizeContainers(
              { group_by: 'current_status', current_status: ['available'] },
              client,
            )
          : executeListContainers({ current_status: ['available'] }, client);
        if (ignored?.length) {
          await expect(result).rejects.toThrow(
            'The container API did not apply these filters: current_status',
          );
        } else {
          await expect(result).resolves.toBeDefined();
        }
      });
    }
  }
});
