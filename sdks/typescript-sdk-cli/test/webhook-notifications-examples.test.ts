import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

describe('webhook-notifications examples', () => {
  it('sends --event as the event query parameter', async () => {
    const requests = stubApi(() => ({
      data: { id: 'n-1', type: 'webhook_notification', attributes: {} },
    }));

    const result = await runProgram([
      'webhook-notifications',
      'examples',
      '--event',
      'container.created',
      '--json',
    ]);

    expect(result.status).toBe(0);
    expect(requests.map(({ method, url }) => [method, url.href])).toEqual([
      [
        'GET',
        'https://api.test/v2/webhook_notifications/examples?event=container.created',
      ],
    ]);
  });

  it('rejects a call without --event before calling the API', async () => {
    const requests = stubApi(() => ({ data: {} }));

    const result = await runProgram([
      'webhook-notifications',
      'examples',
      '--json',
    ]);

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: 'USAGE_ERROR',
        message: "error: required option '--event <event>' not specified",
      },
    });
    expect(requests).toEqual([]);
  });
});
