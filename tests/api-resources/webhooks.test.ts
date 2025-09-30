// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import Terminal49 from 'terminal49';

const client = new Terminal49({
  apiKey: 'My API Key',
  baseURL: process.env['TEST_API_BASE_URL'] ?? 'http://127.0.0.1:4010',
});

describe('resource webhooks', () => {
  // Prism tests are disabled
  test.skip('create: only required params', async () => {
    const responsePromise = client.webhooks.create({
      data: { attributes: { active: true, url: 'https://webhook.site/' }, type: 'webhook' },
    });
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('create: required and optional params', async () => {
    const response = await client.webhooks.create({
      data: {
        attributes: {
          active: true,
          url: 'https://webhook.site/',
          events: [
            'container.transport.vessel_arrived',
            'container.transport.vessel_discharged',
            'container.transport.vessel_loaded',
            'container.transport.vessel_departed',
            'container.transport.rail_departed',
            'container.transport.rail_arrived',
            'container.transport.rail_loaded',
            'container.transport.rail_unloaded',
            'container.transport.transshipment_arrived',
            'container.transport.transshipment_discharged',
            'container.transport.transshipment_loaded',
            'container.transport.transshipment_departed',
            'container.transport.feeder_arrived',
            'container.transport.feeder_discharged',
            'container.transport.feeder_loaded',
            'container.transport.feeder_departed',
            'container.transport.empty_out',
            'container.transport.full_in',
            'container.transport.full_out',
            'container.transport.empty_in',
            'container.transport.vessel_berthed',
            'shipment.estimated.arrival',
            'tracking_request.succeeded',
            'tracking_request.failed',
            'tracking_request.awaiting_manifest',
            'tracking_request.tracking_stopped',
            'container.created',
            'container.updated',
            'container.pod_terminal_changed',
            'container.transport.arrived_at_inland_destination',
            'container.transport.estimated.arrived_at_inland_destination',
            'container.pickup_lfd.changed',
          ],
          headers: [{ name: 'name', value: 'value' }],
        },
        type: 'webhook',
      },
    });
  });

  // Prism tests are disabled
  test.skip('retrieve', async () => {
    const responsePromise = client.webhooks.retrieve('id');
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('update: only required params', async () => {
    const responsePromise = client.webhooks.update('id', { data: { attributes: {}, type: 'webhook' } });
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('update: required and optional params', async () => {
    const response = await client.webhooks.update('id', {
      data: {
        attributes: {
          active: true,
          events: ['container.transport.vessel_arrived'],
          headers: [{ name: 'name', value: 'value' }],
          url: 'https://webhook.site/#!/39084fbb-d887-42e8-be08-b9183ad02362',
        },
        type: 'webhook',
      },
    });
  });

  // Prism tests are disabled
  test.skip('list', async () => {
    const responsePromise = client.webhooks.list();
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
      client.webhooks.list({ 'page[number]': 0, 'page[size]': 0 }, { path: '/_stainless_unknown_path' }),
    ).rejects.toThrow(Terminal49.NotFoundError);
  });

  // Prism tests are disabled
  test.skip('delete', async () => {
    const responsePromise = client.webhooks.delete('id');
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });

  // Prism tests are disabled
  test.skip('listIPs', async () => {
    const responsePromise = client.webhooks.listIPs();
    const rawResponse = await responsePromise.asResponse();
    expect(rawResponse).toBeInstanceOf(Response);
    const response = await responsePromise;
    expect(response).not.toBeInstanceOf(Response);
    const dataAndResponse = await responsePromise.withResponse();
    expect(dataAndResponse.data).toBe(response);
    expect(dataAndResponse.response).toBe(rawResponse);
  });
});
