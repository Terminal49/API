// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import Terminal49 from 'terminal49';

const client = new Terminal49({
  apiKey: 'My API Key',
  baseURL: process.env['TEST_API_BASE_URL'] ?? 'http://127.0.0.1:4010',
});

describe('resource trackingRequests', () => {
  // Prism tests are disabled
  test.skip('create', async () => {
    const responsePromise = client.trackingRequests.create();
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('create: request options and params are passed correctly', async () => {
    // ensure the request options are being passed correctly by passing an invalid HTTP method in order to cause an error
    await expect(
      client.trackingRequests.create(
        {
          data: {
            type: 'tracking_request',
            attributes: {
              request_number: 'MEDUFR030802',
              request_type: 'bill_of_lading',
              scac: 'MSCU',
              ref_numbers: ['PO12345', 'HBL12345', 'CUSREF1234'],
              shipment_tags: ['camembert'],
            },
            relationships: {
              customer: { data: { id: 'f7cb530a-9e60-412c-a5bc-205a2f34ba54', type: 'party' } },
            },
          },
        },
        { path: '/_stainless_unknown_path' },
      ),
    ).rejects.toThrow(Terminal49.NotFoundError);
  });

  // Prism tests are disabled
  test.skip('retrieve', async () => {
    const responsePromise = client.trackingRequests.retrieve('id');
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('retrieve: request options and params are passed correctly', async () => {
    // ensure the request options are being passed correctly by passing an invalid HTTP method in order to cause an error
    await expect(
      client.trackingRequests.retrieve('id', { include: 'include' }, { path: '/_stainless_unknown_path' }),
    ).rejects.toThrow(Terminal49.NotFoundError);
  });

  // Prism tests are disabled
  test.skip('update', async () => {
    const responsePromise = client.trackingRequests.update('id');
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('update: request options and params are passed correctly', async () => {
    // ensure the request options are being passed correctly by passing an invalid HTTP method in order to cause an error
    await expect(
      client.trackingRequests.update(
        'id',
        { data: { attributes: { ref_number: 'REFNUMBER11' } } },
        { path: '/_stainless_unknown_path' },
      ),
    ).rejects.toThrow(Terminal49.NotFoundError);
  });

  // Prism tests are disabled
  test.skip('list', async () => {
    const responsePromise = client.trackingRequests.list();
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('list: request options and params are passed correctly', async () => {
    // ensure the request options are being passed correctly by passing an invalid HTTP method in order to cause an error
    await expect(
      client.trackingRequests.list(
        {
          'filter[created_at][end]': '2020-04-28T22:59:15Z',
          'filter[created_at][start]': '2020-04-28T22:59:15Z',
          'filter[request_number]': 'filter[request_number]',
          'filter[scac]': 'MSCU',
          'filter[status]': 'created',
          include: 'include',
          'page[number]': 0,
          'page[size]': 0,
          q: 'q',
        },
        { path: '/_stainless_unknown_path' },
      ),
    ).rejects.toThrow(Terminal49.NotFoundError);
  });
});
