import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from './client.js';
import { jsonResponse } from './test/mock-fetch.js';

interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
}

function servedBody(method: string, pathname: string) {
  return {
    data: { id: `${method} ${pathname.replace('/v2', '')}`, type: 'stub' },
  };
}

function buildClient(config: { accountId?: string } = {}) {
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
    return jsonResponse(servedBody(request.method, url.pathname));
  };
  const client = new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: 'https://api.test/v2',
    fetchImpl,
    maxRetries: 0,
    ...config,
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
  it.each([
    {
      collection: 'containers',
      role: 'pickup_dray_carrier',
      addRole: (client: Terminal49Client) =>
        client.containers.addPartyRole('id-1', {
          role: 'pickup_dray_carrier',
          partyId: 'party-9',
        }),
    },
    {
      collection: 'shipments',
      role: 'consignee',
      addRole: (client: Terminal49Client) =>
        client.shipments.addPartyRole('id-1', {
          role: 'consignee',
          partyId: 'party-9',
        }),
    },
  ] as const)(
    '$collection exposes list/add/remove',
    async ({ collection, role, addRole }) => {
      const { client, calls } = buildClient();
      const m = client[collection];

      await m.partyRoles('id-1');
      await addRole(client);
      await m.removePartyRole('id-1', 'role-3');

      expect(calls.map((c) => [c.method, c.path])).toEqual([
        ['GET', `/${collection}/id-1/party_roles`],
        ['POST', `/${collection}/id-1/party_roles`],
        ['DELETE', `/${collection}/id-1/party_roles/role-3`],
      ]);
      expect(calls[1].body).toEqual({
        data: {
          type: 'party_role',
          attributes: { role },
          relationships: { party: { data: { type: 'party', id: 'party-9' } } },
        },
      });
    },
  );
});

describe('containers', () => {
  it('updates a container by id', async () => {
    const { client, calls } = buildClient();
    await client.containers.update('c-1', {
      ref_numbers: ['REF-1'],
      seal_number: 'SEAL-1',
      equipment_type: 'reefer',
      equipment_length: 40,
      equipment_height: 'high_cube',
      weight_in_lbs: 1000,
    });
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/containers/c-1',
      body: {
        data: {
          type: 'container',
          id: 'c-1',
          attributes: {
            ref_numbers: ['REF-1'],
            seal_number: 'SEAL-1',
            equipment_type: 'reefer',
            equipment_length: 40,
            equipment_height: 'high_cube',
            weight_in_lbs: 1000,
          },
        },
      },
    });
  });
});

describe('tracking requests', () => {
  it('cancels a tracking request without a body', async () => {
    const { client, calls } = buildClient();

    const result = await client.trackingRequests.cancel('tr 1');

    expect(calls).toEqual([
      {
        method: 'PATCH',
        path: '/tracking_requests/tr%201/cancel',
        query: {},
        body: undefined,
      },
    ]);
    expect(result).toEqual({
      data: { id: 'PATCH /tracking_requests/tr%201/cancel', type: 'stub' },
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
      documentType: 'bill_of_lading',
      classificationNotes: 'Reviewed by ops',
      extractedDataManual: { bill_of_lading_number: 'BL-1' },
    });
    await docs.update('d-1', {
      classificationNotes: null,
      extractedDataManual: null,
    });
    await docs.delete('d-1');
    await docs.types();
    await docs.downloadUrl('d-1');
    await docs.reextract('d-1');
    await docs.reclassify('d-1');
    await docs.relink('d-1');
    await docs.rotate('d-1', 270);

    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ['POST', '/documents'],
      ['GET', '/documents/d-1'],
      ['PATCH', '/documents/d-1'],
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
          document_type: 'bill_of_lading',
          classification_notes: 'Reviewed by ops',
          extracted_data_manual: { bill_of_lading_number: 'BL-1' },
        },
      },
    });
    expect(calls[3].body).toEqual({
      data: {
        type: 'document',
        attributes: { classification_notes: null, extracted_data_manual: null },
      },
    });
    expect(calls[10].body).toEqual({ degrees: 270 });
  });

  it('rejects create without required attributes', async () => {
    const { client, calls } = buildClient();
    await expect(
      client.documents.create({ name: '', attachedDocument: 'blob-1' }),
    ).rejects.toThrow('name is required');
    await expect(
      client.documents.create({ name: 'BOL.pdf', attachedDocument: '' }),
    ).rejects.toThrow('attached_document is required');
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
  it('creates and updates parties with the documented JSON:API body', async () => {
    const { client, calls } = buildClient();
    await client.parties.create({ company_name: 'ACME' });
    await client.parties.update('p-1', { company_name: 'ACME 2' });

    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      [
        'POST',
        '/parties',
        { data: { type: 'party', attributes: { company_name: 'ACME' } } },
      ],
      [
        'PATCH',
        '/parties/p-1',
        { data: { type: 'party', attributes: { company_name: 'ACME 2' } } },
      ],
    ]);
  });
});

describe('custom field list filters', () => {
  it('forwards custom field and definition filters', async () => {
    const { client, calls } = buildClient();
    await client.customFields.list({
      filters: {
        entityType: 'Cargo',
        entityId: 'c-1',
        definitionId: 'def-1',
      },
    });
    await client.customFieldDefinitions.list({
      pageSize: 5,
      filters: { entityType: 'Shipment', dataType: 'enum', displayName: 'PO' },
    });

    expect(calls[0].query).toEqual({
      'filter[entity_type]': 'Cargo',
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

  it('filters by the TrackingRequest entity type', async () => {
    const { client, calls } = buildClient();
    await client.customFields.list({
      filters: { entityType: 'TrackingRequest' },
    });

    expect(calls.map((c) => c.query)).toEqual([
      { 'filter[entity_type]': 'TrackingRequest' },
    ]);
  });
});

describe('account custom field definitions', () => {
  it('lists and creates account definitions on the account route', async () => {
    const { client, calls } = buildClient();
    const { client: scoped, calls: scopedCalls } = buildClient({
      accountId: 'acct-1',
    });
    const body = { data: { type: 'custom_field_definition', attributes: {} } };

    await client.customFieldDefinitions.list({
      filters: { entityType: 'Cargo' },
    });
    await client.customFieldDefinitions.create(body);
    await scoped.customFieldDefinitions.list();
    await scoped.customFieldDefinitions.create(body);

    expect(calls.map((c) => [c.method, c.path, c.query, c.body])).toEqual([
      [
        'GET',
        '/accounts/current/custom_field_definitions',
        { 'filter[entity_type]': 'Cargo' },
        undefined,
      ],
      ['POST', '/accounts/current/custom_field_definitions', {}, body],
    ]);
    expect(scopedCalls.map((c) => [c.method, c.path])).toEqual([
      ['GET', '/accounts/acct-1/custom_field_definitions'],
      ['POST', '/accounts/acct-1/custom_field_definitions'],
    ]);
  });

  it('lists Terminal49 templates on the top-level route', async () => {
    const { client, calls } = buildClient({ accountId: 'acct-1' });

    await client.customFieldDefinitions.list({
      scope: 'templates',
      filters: { dataType: 'enum' },
    });

    expect(calls.map((c) => [c.method, c.path, c.query])).toEqual([
      ['GET', '/custom_field_definitions', { 'filter[data_type]': 'enum' }],
    ]);
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
    await client.vessels.futurePositions('v-1', {
      portId: 'port-2',
      previousPortId: 'port-1',
    });
    await client.vessels.futurePositionsWithCoords('v-1', {
      portId: 'port-2',
      previousPortId: 'port-1',
      latitude: 13.07,
      longitude: -100.84,
    });
    await client.ports.get('p-1');
    await client.terminals.get('t-1');
    await client.parties.list({ pageSize: 10 });
    await client.parties.get('pa-1');
    await client.metroAreas.get('m-1');
    await client.customFieldDefinitions.get('d-1');
    await client.customFieldDefinitions.create(body);
    await client.customFieldDefinitions.update('d-1', body);
    await client.customFieldDefinitions.delete('d-1');
    await client.customFieldOptions.list('d-1');
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
      [
        'GET',
        '/vessels/v-1/future_positions',
        { port_id: 'port-2', previous_port_id: 'port-1' },
        undefined,
      ],
      [
        'GET',
        '/vessels/v-1/future_positions_with_coordinates',
        {
          port_id: 'port-2',
          previous_port_id: 'port-1',
          latitude: '13.07',
          longitude: '-100.84',
        },
        undefined,
      ],
      ['GET', '/ports/p-1', {}, undefined],
      ['GET', '/terminals/t-1', {}, undefined],
      ['GET', '/parties', { 'page[size]': '10' }, undefined],
      ['GET', '/parties/pa-1', {}, undefined],
      ['GET', '/metro_areas/m-1', {}, undefined],
      ['GET', '/custom_field_definitions/d-1', {}, undefined],
      ['POST', '/accounts/current/custom_field_definitions', {}, body],
      ['PATCH', '/custom_field_definitions/d-1', {}, body],
      ['DELETE', '/custom_field_definitions/d-1', {}, undefined],
      ['GET', '/custom_field_definitions/d-1/options', {}, undefined],
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

  it('sends include on webhook notification list and get', async () => {
    const { client, calls } = buildClient();
    await client.webhookNotifications.list({
      page: 2,
      include: ['webhook', 'reference_object'],
    });
    await client.webhookNotifications.get('n-1', { include: 'webhook' });

    expect(calls.map((c) => [c.path, c.query])).toEqual([
      [
        '/webhook_notifications',
        { include: 'webhook,reference_object', 'page[number]': '2' },
      ],
      ['/webhook_notifications/n-1', { include: 'webhook' }],
    ]);
  });

  it('clamps page[size] to the API maximum', async () => {
    const { client, calls } = buildClient();
    await client.parties.list({ pageSize: 500 });
    expect(calls[0].query).toEqual({ 'page[size]': '100' });
  });
});

describe('return values', () => {
  it.each([
    ['GET', '/webhooks/w-1', (c: Terminal49Client) => c.webhooks.get('w-1')],
    ['GET', '/webhooks/events', (c: Terminal49Client) => c.webhooks.events()],
    [
      'POST',
      '/webhooks/trigger',
      (c: Terminal49Client) =>
        c.webhooks.trigger({
          url: 'https://example.com/hook',
          event: 'container.updated',
        }),
    ],
    [
      'GET',
      '/webhook_notifications',
      (c: Terminal49Client) => c.webhookNotifications.list(),
    ],
    [
      'GET',
      '/webhook_notifications/n-1',
      (c: Terminal49Client) => c.webhookNotifications.get('n-1'),
    ],
    [
      'POST',
      '/parties',
      (c: Terminal49Client) => c.parties.create({ company_name: 'ACME' }),
    ],
    [
      'PATCH',
      '/parties/p-1',
      (c: Terminal49Client) =>
        c.parties.update('p-1', { company_name: 'ACME' }),
    ],
    [
      'GET',
      '/shipping_lines/sl-1',
      (c: Terminal49Client) => c.shippingLines.get('sl-1'),
    ],
    [
      'PATCH',
      '/containers/c-1',
      (c: Terminal49Client) => c.containers.update('c-1', { ref_numbers: [] }),
    ],
    [
      'GET',
      '/containers/c-1/custom_fields',
      (c: Terminal49Client) => c.containers.customFields('c-1'),
    ],
    [
      'POST',
      '/shipments/s-1/custom_fields',
      (c: Terminal49Client) => c.shipments.setCustomField('s-1', 'po', 'PO-1'),
    ],
    [
      'PATCH',
      '/tracking_requests/t-1/custom_fields/po',
      (c: Terminal49Client) =>
        c.trackingRequests.updateCustomField('t-1', 'po', 'PO-2'),
    ],
    [
      'GET',
      '/tracking_requests/t-1/custom_fields',
      (c: Terminal49Client) => c.trackingRequests.customFields('t-1'),
    ],
    [
      'POST',
      '/tracking_requests/t-1/custom_fields',
      (c: Terminal49Client) =>
        c.trackingRequests.setCustomField('t-1', 'po', 'PO-1'),
    ],
    [
      'PATCH',
      '/containers/c-1/custom_fields/po',
      (c: Terminal49Client) =>
        c.containers.updateCustomField('c-1', 'po', 'PO-2'),
    ],
    [
      'PATCH',
      '/shipments/s-1/custom_fields/po',
      (c: Terminal49Client) =>
        c.shipments.updateCustomField('s-1', 'po', 'PO-2'),
    ],
    [
      'GET',
      '/containers/c-1/party_roles',
      (c: Terminal49Client) => c.containers.partyRoles('c-1'),
    ],
    [
      'POST',
      '/containers/c-1/party_roles',
      (c: Terminal49Client) =>
        c.containers.addPartyRole('c-1', {
          role: 'pickup_dray_carrier',
          partyId: 'pa-1',
        }),
    ],
    [
      'GET',
      '/shipments/s-1/party_roles',
      (c: Terminal49Client) => c.shipments.partyRoles('s-1'),
    ],
    [
      'POST',
      '/shipments/s-1/party_roles',
      (c: Terminal49Client) =>
        c.shipments.addPartyRole('s-1', { role: 'consignee', partyId: 'pa-1' }),
    ],
    ['GET', '/documents', (c: Terminal49Client) => c.documents.list()],
    [
      'POST',
      '/documents',
      (c: Terminal49Client) =>
        c.documents.create({ name: 'BOL.pdf', attachedDocument: 'blob-1' }),
    ],
    ['GET', '/documents/d-1', (c: Terminal49Client) => c.documents.get('d-1')],
    [
      'PATCH',
      '/documents/d-1',
      (c: Terminal49Client) =>
        c.documents.update('d-1', { documentType: 'bill_of_lading' }),
    ],
    ['GET', '/documents/types', (c: Terminal49Client) => c.documents.types()],
    [
      'GET',
      '/documents/d-1/download_url',
      (c: Terminal49Client) => c.documents.downloadUrl('d-1'),
    ],
    [
      'POST',
      '/documents/d-1/reextract',
      (c: Terminal49Client) => c.documents.reextract('d-1'),
    ],
    [
      'POST',
      '/documents/d-1/reclassify',
      (c: Terminal49Client) => c.documents.reclassify('d-1'),
    ],
    [
      'POST',
      '/documents/d-1/relink',
      (c: Terminal49Client) => c.documents.relink('d-1'),
    ],
    [
      'POST',
      '/documents/d-1/rotate',
      (c: Terminal49Client) => c.documents.rotate('d-1', 90),
    ],
    [
      'GET',
      '/email_submissions',
      (c: Terminal49Client) => c.emailSubmissions.list(),
    ],
    [
      'GET',
      '/email_submissions/e-1',
      (c: Terminal49Client) => c.emailSubmissions.get('e-1'),
    ],
    [
      'GET',
      '/document_schemas/bill_of_lading',
      (c: Terminal49Client) => c.documentSchemas.get('bill_of_lading'),
    ],
    ['GET', '/custom_fields', (c: Terminal49Client) => c.customFields.list()],
    [
      'GET',
      '/accounts/current/custom_field_definitions',
      (c: Terminal49Client) => c.customFieldDefinitions.list(),
    ],
    ['GET', '/webhooks', (c: Terminal49Client) => c.webhooks.list()],
    [
      'POST',
      '/webhooks',
      (c: Terminal49Client) => c.webhooks.create({ data: {} }),
    ],
    [
      'PATCH',
      '/webhooks/w-1',
      (c: Terminal49Client) => c.webhooks.update('w-1', { data: {} }),
    ],
    ['GET', '/webhooks/ips', (c: Terminal49Client) => c.webhooks.ips()],
    [
      'GET',
      '/webhook_notifications/examples',
      (c: Terminal49Client) => c.webhookNotifications.examples(),
    ],
    ['GET', '/vessels/v-1', (c: Terminal49Client) => c.vessels.get('v-1')],
    [
      'GET',
      '/vessels/9876543',
      (c: Terminal49Client) => c.vessels.getByImo('9876543'),
    ],
    [
      'GET',
      '/vessels/v-1/future_positions',
      (c: Terminal49Client) =>
        c.vessels.futurePositions('v-1', {
          portId: 'port-2',
          previousPortId: 'port-1',
        }),
    ],
    [
      'GET',
      '/vessels/v-1/future_positions_with_coordinates',
      (c: Terminal49Client) =>
        c.vessels.futurePositionsWithCoords('v-1', {
          portId: 'port-2',
          previousPortId: 'port-1',
          latitude: 13.07,
          longitude: -100.84,
        }),
    ],
    ['GET', '/ports/p-1', (c: Terminal49Client) => c.ports.get('p-1')],
    ['GET', '/terminals/t-1', (c: Terminal49Client) => c.terminals.get('t-1')],
    ['GET', '/parties', (c: Terminal49Client) => c.parties.list()],
    ['GET', '/parties/pa-1', (c: Terminal49Client) => c.parties.get('pa-1')],
    [
      'GET',
      '/metro_areas/m-1',
      (c: Terminal49Client) => c.metroAreas.get('m-1'),
    ],
    [
      'GET',
      '/custom_field_definitions/d-1',
      (c: Terminal49Client) => c.customFieldDefinitions.get('d-1'),
    ],
    [
      'POST',
      '/accounts/current/custom_field_definitions',
      (c: Terminal49Client) => c.customFieldDefinitions.create({ data: {} }),
    ],
    [
      'PATCH',
      '/custom_field_definitions/d-1',
      (c: Terminal49Client) =>
        c.customFieldDefinitions.update('d-1', { data: {} }),
    ],
    [
      'GET',
      '/custom_field_definitions/d-1/options',
      (c: Terminal49Client) => c.customFieldOptions.list('d-1'),
    ],
    [
      'GET',
      '/custom_field_definitions/d-1/options/o-1',
      (c: Terminal49Client) => c.customFieldOptions.get('d-1', 'o-1'),
    ],
    [
      'POST',
      '/custom_field_definitions/d-1/options',
      (c: Terminal49Client) => c.customFieldOptions.create('d-1', { data: {} }),
    ],
    [
      'PATCH',
      '/custom_field_definitions/d-1/options/o-1',
      (c: Terminal49Client) =>
        c.customFieldOptions.update('d-1', 'o-1', { data: {} }),
    ],
    [
      'GET',
      '/custom_fields/cf-1',
      (c: Terminal49Client) => c.customFields.get('cf-1'),
    ],
    [
      'POST',
      '/custom_fields',
      (c: Terminal49Client) => c.customFields.create({ data: {} }),
    ],
    [
      'PATCH',
      '/custom_fields/cf-1',
      (c: Terminal49Client) => c.customFields.update('cf-1', { data: {} }),
    ],
  ] as const)('%s %s returns the served body', async (method, path, call) => {
    const { client } = buildClient();
    await expect(call(client)).resolves.toEqual(
      servedBody(method, `/v2${path}`),
    );
  });
});
