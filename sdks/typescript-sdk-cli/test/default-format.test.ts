import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

const createdRequest = {
  data: {
    id: 'tr-1',
    type: 'tracking_request',
    attributes: {
      request_type: 'bill_of_lading',
      request_number: 'MAEU123',
      scac: 'MAEU',
      status: 'pending',
    },
  },
};

const inferred = {
  data: {
    id: 'infer-1',
    type: 'infer_number_result',
    attributes: {
      number_type: 'bill_of_lading',
      shipping_line: { selected: { scac: 'MAEU' }, candidates: [] },
    },
  },
};

function answer({ url }: { url: URL }): unknown {
  return url.pathname.endsWith('/infer_number') ? inferred : createdRequest;
}

describe('commands without --format print the mapped result', () => {
  it('tracking-requests create', async () => {
    stubApi(answer);

    const result = await runProgram([
      '--json',
      'tracking-requests',
      'create',
      'bill_of_lading',
      'MAEU123',
      '--scac',
      'MAEU',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).data).toMatchObject({
      id: 'tr-1',
      requestType: 'bill_of_lading',
      requestNumber: 'MAEU123',
    });
  });

  it('track', async () => {
    stubApi(answer);

    const result = await runProgram(['--json', 'track', 'MAEU123']);

    expect(result.status).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.trackingRequest).toMatchObject({
      id: 'tr-1',
      requestType: 'bill_of_lading',
      requestNumber: 'MAEU123',
    });
    expect(data.raw).toBeUndefined();
  });
});
