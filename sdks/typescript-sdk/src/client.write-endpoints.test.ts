import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from './client.js';
import { jsonResponse } from './test/mock-fetch.js';

interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
}

function buildClient() {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.clone().text();
    calls.push({
      method: request.method,
      path: url.pathname.replace('/v2', ''),
      query: Object.fromEntries(url.searchParams),
      body: text ? JSON.parse(text) : undefined,
    });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    return jsonResponse({ data: { id: 'x', type: 'stub' } });
  };
  const client = new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: 'https://api.test/v2',
    fetchImpl,
    maxRetries: 0,
  });
  return { client, calls };
}

describe('entity custom fields', () => {
  it.each([
    ['containers', 'containers'],
    ['shipments', 'shipments'],
    ['trackingRequests', 'tracking_requests'],
  ] as const)(
    '%s exposes list/create/update/delete',
    async (manager, collection) => {
      const { client, calls } = buildClient();
      const m = client[manager];

      await m.customFields('id-1');
      await m.setCustomField('id-1', 'po_number', 'PO-1');
      await m.updateCustomField('id-1', 'po_number', 'PO-2');
      await m.deleteCustomField('id-1', 'po_number');

      expect(calls.map((c) => [c.method, c.path])).toEqual([
        ['GET', `/${collection}/id-1/custom_fields`],
        ['POST', `/${collection}/id-1/custom_fields`],
        ['PATCH', `/${collection}/id-1/custom_fields/po_number`],
        ['DELETE', `/${collection}/id-1/custom_fields/po_number`],
      ]);
      expect(calls[0].query).toEqual({ include: 'definition' });
      expect(calls[1].body).toEqual({
        data: {
          type: 'custom_field',
          attributes: { api_slug: 'po_number', value: 'PO-1' },
        },
      });
      expect(calls[2].body).toEqual({
        data: { type: 'custom_field', attributes: { value: 'PO-2' } },
      });
    },
  );
});

describe('party roles', () => {
  it.each(['containers', 'shipments'] as const)(
    '%s exposes list/add/remove',
    async (collection) => {
      const { client, calls } = buildClient();
      const m = client[collection];

      await m.partyRoles('id-1');
      await m.addPartyRole('id-1', 'consignee', 'party-9');
      await m.removePartyRole('id-1', 'role-3');

      expect(calls.map((c) => [c.method, c.path])).toEqual([
        ['GET', `/${collection}/id-1/party_roles`],
        ['POST', `/${collection}/id-1/party_roles`],
        ['DELETE', `/${collection}/id-1/party_roles/role-3`],
      ]);
      expect(calls[1].body).toEqual({
        data: {
          type: 'party_role',
          attributes: { role: 'consignee' },
          relationships: { party: { data: { type: 'party', id: 'party-9' } } },
        },
      });
    },
  );
});

describe('containers', () => {
  it('updates a container by id', async () => {
    const { client, calls } = buildClient();
    await client.containers.update('c-1', { ref_numbers: ['REF-1'] });
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/containers/c-1',
      body: {
        data: {
          type: 'container',
          id: 'c-1',
          attributes: { ref_numbers: ['REF-1'] },
        },
      },
    });
  });
});

describe('shipping lines', () => {
  it('fetches a shipping line by id', async () => {
    const { client, calls } = buildClient();
    await client.shippingLines.get('sl-1');
    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/shipping_lines/sl-1',
    });
  });
});

describe('documents', () => {
  it('lists documents with filters and pagination', async () => {
    const { client, calls } = buildClient();
    await client.documents.list(
      {
        filename: 'invoice',
        reference: 'REF',
        documentTypes: ['bill_of_lading', 'arrival_notice'],
        sort: '-created_at',
        include: 'shipments',
      },
      { page: 2, pageSize: 10 },
    );
    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/documents',
      query: {
        'filter[filename]': 'invoice',
        'filter[reference]': 'REF',
        'filter[document_types]': 'bill_of_lading,arrival_notice',
        sort: '-created_at',
        include: 'shipments',
        'page[number]': '2',
        'page[size]': '10',
      },
    });
  });

  it('covers every document operation', async () => {
    const { client, calls } = buildClient();
    const docs = client.documents;

    await docs.create({ name: 'BOL.pdf', attachedDocument: 'blob-1' });
    await docs.get('d-1', { include: 'shipments' });
    await docs.update('d-1', {
      documentTypeManual: 'bill_of_lading',
      extractedDataManual: null,
    });
    await docs.delete('d-1');
    await docs.types();
    await docs.downloadUrl('d-1');
    await docs.reextract('d-1');
    await docs.reclassify('d-1');
    await docs.relink('d-1');
    await docs.rotate('d-1', 90);

    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ['POST', '/documents'],
      ['GET', '/documents/d-1'],
      ['PATCH', '/documents/d-1'],
      ['DELETE', '/documents/d-1'],
      ['GET', '/documents/types'],
      ['GET', '/documents/d-1/download_url'],
      ['POST', '/documents/d-1/reextract'],
      ['POST', '/documents/d-1/reclassify'],
      ['POST', '/documents/d-1/relink'],
      ['POST', '/documents/d-1/rotate'],
    ]);
    expect(calls[0].body).toEqual({
      data: {
        type: 'document',
        attributes: { name: 'BOL.pdf', attached_document: 'blob-1' },
      },
    });
    expect(calls[1].query).toEqual({ include: 'shipments' });
    expect(calls[2].body).toEqual({
      data: {
        type: 'document',
        attributes: {
          document_type_manual: 'bill_of_lading',
          extracted_data_manual: null,
        },
      },
    });
    expect(calls[9].body).toEqual({ degrees: 90 });
  });

  it('rejects create without required attributes', async () => {
    const { client, calls } = buildClient();
    await expect(
      client.documents.create({ name: '', attachedDocument: 'blob-1' }),
    ).rejects.toThrow('name is required');
    expect(calls).toHaveLength(0);
  });
});

describe('email submissions and document schemas', () => {
  it('lists and fetches email submissions, and fetches a schema', async () => {
    const { client, calls } = buildClient();
    await client.emailSubmissions.list({ include: 'documents', page: 1 });
    await client.emailSubmissions.get('e-1');
    await client.documentSchemas.get('bill_of_lading');

    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ['GET', '/email_submissions'],
      ['GET', '/email_submissions/e-1'],
      ['GET', '/document_schemas/bill_of_lading'],
    ]);
    expect(calls[0].query).toEqual({
      include: 'documents',
      'page[number]': '1',
    });
  });
});

describe('webhooks', () => {
  it('lists events and triggers a test delivery', async () => {
    const { client, calls } = buildClient();
    await client.webhooks.events();
    await client.webhooks.trigger({
      url: 'https://example.com/hook',
      event: 'document_representation.created',
      secret: 's3cret',
      documentType: 'dray_delivery_order',
    });

    expect(calls[0]).toMatchObject({ method: 'GET', path: '/webhooks/events' });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: '/webhooks/trigger',
      body: {
        url: 'https://example.com/hook',
        event: 'document_representation.created',
        secret: 's3cret',
        sample: { document_type: 'dray_delivery_order' },
      },
    });
  });
});

describe('parties', () => {
  it('creates and updates parties', async () => {
    const { client, calls } = buildClient();
    const payload = { data: { attributes: { company_name: 'ACME' } } };
    await client.parties.create(payload);
    await client.parties.update('p-1', payload);

    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/parties', payload],
      ['PATCH', '/parties/p-1', payload],
    ]);
  });
});

describe('custom field list filters', () => {
  it('forwards custom field and definition filters', async () => {
    const { client, calls } = buildClient();
    await client.customFields.list({
      filters: {
        entityType: 'Container',
        entityId: 'c-1',
        definitionId: 'def-1',
      },
    });
    await client.customFieldDefinitions.list({
      pageSize: 5,
      filters: { entityType: 'Shipment', dataType: 'enum', displayName: 'PO' },
    });

    expect(calls[0].query).toEqual({
      'filter[entity_type]': 'Container',
      'filter[entity_id]': 'c-1',
      'filter[definition_id]': 'def-1',
    });
    expect(calls[1].query).toEqual({
      'page[size]': '5',
      'filter[entity_type]': 'Shipment',
      'filter[data_type]': 'enum',
      'filter[display_name]': 'PO',
    });
  });
});

describe('search', () => {
  it('runs through the typed client', async () => {
    const { client, calls } = buildClient();
    await client.search('MSCU1234567');
    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/search',
      query: { query: 'MSCU1234567' },
    });
  });
});

describe('resource methods on the client', () => {
  it('sends the documented method, path, query, and body', async () => {
    const { client, calls } = buildClient();
    const body = { data: { attributes: { name: 'n' } } };

    await client.webhooks.list({ page: 2, pageSize: 5 });
    await client.webhooks.get('w 1');
    await client.webhooks.create(body);
    await client.webhooks.update('w-1', body);
    await client.webhooks.delete('w-1');
    await client.webhooks.ips();
    await client.webhookNotifications.list({ page: 3 });
    await client.webhookNotifications.get('n-1');
    await client.webhookNotifications.examples('container.created');
    await client.webhookNotifications.examples();
    await client.vessels.get('v-1');
    await client.vessels.getByImo('9876543');
    await client.vessels.futurePositions('v-1');
    await client.vessels.futurePositionsWithCoords('v-1');
    await client.ports.get('p-1');
    await client.terminals.get('t-1');
    await client.parties.list({ pageSize: 10 });
    await client.parties.get('pa-1');
    await client.metroAreas.get('m-1');
    await client.customFieldDefinitions.get('d-1');
    await client.customFieldDefinitions.create(body);
    await client.customFieldDefinitions.update('d-1', body);
    await client.customFieldDefinitions.delete('d-1');
    await client.customFieldOptions.list('d-1', { page: 1, pageSize: 20 });
    await client.customFieldOptions.get('d-1', 'o-1');
    await client.customFieldOptions.create('d-1', body);
    await client.customFieldOptions.update('d-1', 'o-1', body);
    await client.customFieldOptions.delete('d-1', 'o-1');
    await client.customFields.get('cf-1');
    await client.customFields.create(body);
    await client.customFields.update('cf-1', body);
    await client.customFields.delete('cf-1');

    expect(calls.map((c) => [c.method, c.path, c.query, c.body])).toEqual([
      [
        'GET',
        '/webhooks',
        { 'page[number]': '2', 'page[size]': '5' },
        undefined,
      ],
      ['GET', '/webhooks/w%201', {}, undefined],
      ['POST', '/webhooks', {}, body],
      ['PATCH', '/webhooks/w-1', {}, body],
      ['DELETE', '/webhooks/w-1', {}, undefined],
      ['GET', '/webhooks/ips', {}, undefined],
      ['GET', '/webhook_notifications', { 'page[number]': '3' }, undefined],
      ['GET', '/webhook_notifications/n-1', {}, undefined],
      [
        'GET',
        '/webhook_notifications/examples',
        { event: 'container.created' },
        undefined,
      ],
      ['GET', '/webhook_notifications/examples', {}, undefined],
      ['GET', '/vessels/v-1', {}, undefined],
      ['GET', '/vessels/9876543', {}, undefined],
      ['GET', '/vessels/v-1/future_positions', {}, undefined],
      ['GET', '/vessels/v-1/future_positions_with_coordinates', {}, undefined],
      ['GET', '/ports/p-1', {}, undefined],
      ['GET', '/terminals/t-1', {}, undefined],
      ['GET', '/parties', { 'page[size]': '10' }, undefined],
      ['GET', '/parties/pa-1', {}, undefined],
      ['GET', '/metro_areas/m-1', {}, undefined],
      ['GET', '/custom_field_definitions/d-1', {}, undefined],
      ['POST', '/custom_field_definitions', {}, body],
      ['PATCH', '/custom_field_definitions/d-1', {}, body],
      ['DELETE', '/custom_field_definitions/d-1', {}, undefined],
      [
        'GET',
        '/custom_field_definitions/d-1/options',
        { 'page[number]': '1', 'page[size]': '20' },
        undefined,
      ],
      ['GET', '/custom_field_definitions/d-1/options/o-1', {}, undefined],
      ['POST', '/custom_field_definitions/d-1/options', {}, body],
      ['PATCH', '/custom_field_definitions/d-1/options/o-1', {}, body],
      ['DELETE', '/custom_field_definitions/d-1/options/o-1', {}, undefined],
      ['GET', '/custom_fields/cf-1', {}, undefined],
      ['POST', '/custom_fields', {}, body],
      ['PATCH', '/custom_fields/cf-1', {}, body],
      ['DELETE', '/custom_fields/cf-1', {}, undefined],
    ]);
  });

  it('clamps page[size] to the API maximum', async () => {
    const { client, calls } = buildClient();
    await client.parties.list({ pageSize: 500 });
    expect(calls[0].query).toEqual({ 'page[size]': '100' });
  });

  it('returns the response body the API served', async () => {
    const { client } = buildClient();
    await expect(client.webhooks.get('w-1')).resolves.toEqual({
      data: { id: 'x', type: 'stub' },
    });
  });
});
