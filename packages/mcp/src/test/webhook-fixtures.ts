/**
 * Webhook fixtures that carry a secret, header values and URL keys. Each
 * secret part holds a sentinel, so a test can check that none of them reach
 * tool output or telemetry.
 */

export const WEBHOOK_ID = '497f6eca-6276-4993-bfeb-53cbbbba6f08';
export const SECOND_WEBHOOK_ID = '5c2d8e1f-3a4b-4c6d-9e8f-0a1b2c3d4e5f';
export const NOTIFICATION_ID = 'a76187fc-5749-43f9-9053-cfaad9790a31';
export const REFERENCE_ID = 'bdeca506-9741-4ab1-a0a7-cfd1d908e923';

export const SECRET_SENTINEL = 'SECRET-SENTINEL-7781';
export const HEADER_VALUE_SENTINEL = 'HEADER-VALUE-SENTINEL-5523';
export const QUERY_SENTINEL = 'QUERY-SENTINEL-9902';
export const PATH_KEY_SENTINEL = 'PathKeySentinel0123456789AbCdEf';
export const LOWERCASE_KEY_SENTINEL = 'lowercasekeysentinel';
export const HOST_KEY_SENTINEL = 'hostkey7781sentinel';

/** Every sentinel a webhook fixture carries. */
export const WEBHOOK_SENTINELS = [
  SECRET_SENTINEL,
  HEADER_VALUE_SENTINEL,
  QUERY_SENTINEL,
  PATH_KEY_SENTINEL,
  LOWERCASE_KEY_SENTINEL,
  HOST_KEY_SENTINEL,
] as const;

export const WEBHOOK_URL = `https://user:${SECRET_SENTINEL}@${HOST_KEY_SENTINEL}.hooks.example.com:8443/services/${LOWERCASE_KEY_SENTINEL}/${PATH_KEY_SENTINEL}?token=${QUERY_SENTINEL}#${QUERY_SENTINEL}`;

export function rawWebhook(id = WEBHOOK_ID) {
  return {
    id,
    type: 'webhook',
    attributes: {
      url: WEBHOOK_URL,
      active: true,
      events: [
        'container.transport.vessel_arrived',
        'container.pickup_lfd.changed',
      ],
      secret: SECRET_SENTINEL,
      headers: [
        { name: 'Authorization', value: `Bearer ${HEADER_VALUE_SENTINEL}` },
        { name: 'X-Api-Key', value: HEADER_VALUE_SENTINEL },
      ],
    },
  };
}

/** The summary list_webhooks returns for {@link rawWebhook}. */
export function webhookSummary(id = WEBHOOK_ID) {
  return {
    id,
    active: true,
    events: [
      'container.transport.vessel_arrived',
      'container.pickup_lfd.changed',
    ],
    url: {
      scheme: 'https',
      host: '[redacted].hooks.example.com:8443',
      path: '/services/[redacted]/[redacted]',
      has_query: true,
      host_redacted: true,
      path_redacted: true,
    },
    has_secret: true,
    header_names: ['Authorization', 'X-Api-Key'],
  };
}

export const webhookListBody = {
  data: [rawWebhook(), rawWebhook(SECOND_WEBHOOK_ID)],
  meta: { size: 2, total: 2 },
  links: {
    self: 'https://api.test/v2/webhooks?page%5Bnumber%5D=1',
    next: null,
  },
};

export const eventCatalogBody = {
  data: [
    {
      id: 'tracking-request-events',
      type: 'webhook_event_category',
      attributes: {
        name: 'Tracking Request Events',
        events: [
          {
            name: 'tracking_request.succeeded',
            description: 'Shipment created and linked to the tracking request.',
          },
        ],
      },
    },
  ],
};

export function rawNotification(id = NOTIFICATION_ID) {
  return {
    id,
    type: 'webhook_notification',
    attributes: {
      id,
      event: 'tracking_request.succeeded',
      delivery_status: 'failed',
      created_at: '2026-10-16T21:25:34Z',
      // Not in the spec, but a field the API could add. It must never reach output.
      body: { secret: SECRET_SENTINEL },
    },
    relationships: {
      reference_object: {
        data: { id: REFERENCE_ID, type: 'tracking_request' },
      },
      webhook: { data: { id: WEBHOOK_ID, type: 'webhook' } },
      webhook_notification_logs: { data: [] },
    },
  };
}

/** The row list_webhook_notifications returns for {@link rawNotification}. */
export function notificationRow(id = NOTIFICATION_ID) {
  return {
    id,
    event: 'tracking_request.succeeded',
    delivery_status: 'failed',
    created_at: '2026-10-16T21:25:34Z',
    webhook_id: WEBHOOK_ID,
    reference: { type: 'tracking_request', id: REFERENCE_ID },
  };
}

/** The webhook comes back in `included` even though the tools never ask. */
export const notificationListBody = {
  data: [rawNotification()],
  included: [rawWebhook()],
  meta: { size: 1, total: 1 },
  links: { self: 'https://api.test/v2/webhook_notifications' },
};
