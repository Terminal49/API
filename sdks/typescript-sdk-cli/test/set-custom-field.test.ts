import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

const definitionId = '8254e93f-7cd0-4d01-9407-1a5d91ac27a5';

function api() {
  return stubApi(({ method }) =>
    method === 'GET'
      ? {
          data: {
            id: definitionId,
            type: 'custom_field_definition',
            attributes: { api_slug: 'priority' },
          },
        }
      : { data: { id: 'cf-1', type: 'custom_field', attributes: {} } },
  );
}

const body = {
  data: {
    type: 'custom_field',
    attributes: { api_slug: 'priority', value: 'high' },
  },
};

describe('set-custom-field', () => {
  it('sends the api_slug argument as given', async () => {
    const requests = api();

    const result = await runProgram([
      '--json',
      'containers',
      'set-custom-field',
      'c-1',
      'priority',
      '--value',
      '"high"',
    ]);

    expect(result.status).toBe(0);
    expect(
      requests.map(({ method, url, body }) => [method, url.pathname, body]),
    ).toEqual([['POST', '/v2/containers/c-1/custom_fields', body]]);
  });

  it.each([
    ['containers', 'c-1'],
    ['shipments', 's-1'],
  ])(
    '%s set-custom-field resolves a definition id to its api_slug',
    async (resource, id) => {
      const requests = api();

      const result = await runProgram([
        '--json',
        resource,
        'set-custom-field',
        id,
        definitionId,
        '--value',
        '"high"',
      ]);

      expect(result.status).toBe(0);
      expect(
        requests.map(({ method, url, body }) => [method, url.pathname, body]),
      ).toEqual([
        ['GET', `/v2/custom_field_definitions/${definitionId}`, undefined],
        ['POST', `/v2/${resource}/${id}/custom_fields`, body],
      ]);
    },
  );
});
