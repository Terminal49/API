import { z } from 'zod';
import type { FakeRequest, FakeResponse, FakeRoutes } from './fake-api.js';
import { REF_CONTAINER_ID, refContainer } from './reference-record.js';

export const CF_CONTAINER_ID = REF_CONTAINER_ID;
export const CF_CONTAINER_PATH = `/containers/${CF_CONTAINER_ID}`;
export const CF_TRACKING_REQUEST_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

export const PO_DEFINITION_ID = '7e1d2c3b-4a59-4687-9a8b-7c6d5e4f3a2b';
export const PRIORITY_DEFINITION_ID = '8f2e3d4c-5b6a-4798-8b9c-8d7e6f5a4b3c';

const definition = (
  id: string,
  attributes: Record<string, unknown>,
): Record<string, unknown> => ({
  id,
  type: 'custom_field_definition',
  attributes: {
    description: null,
    reference_type: null,
    validation: null,
    sensitive: false,
    discarded_at: null,
    ...attributes,
  },
});

/** The account's definitions: a container text field and a shipment enum. */
export const customFieldDefinitions = {
  data: [
    definition(PO_DEFINITION_ID, {
      api_slug: 'po_number',
      display_name: 'PO number',
      entity_type: 'Cargo',
      data_type: 'short_text',
    }),
    definition(PRIORITY_DEFINITION_ID, {
      api_slug: 'priority',
      display_name: 'Priority',
      entity_type: 'Shipment',
      data_type: 'enum',
    }),
  ],
};

export const priorityOptions = {
  data: [
    {
      id: 'option-low',
      type: 'custom_field_option',
      attributes: { label: 'Low', value: 'low', position: 1 },
    },
    {
      id: 'option-high',
      type: 'custom_field_option',
      attributes: { label: 'High', value: 'high', position: 2 },
    },
  ],
};

/** Routes for the definitions and the priority options. */
export const definitionRoutes: FakeRoutes = {
  'GET /accounts/current/custom_field_definitions': {
    body: customFieldDefinitions,
  },
  [`GET /custom_field_definitions/${PRIORITY_DEFINITION_ID}/options`]: {
    body: priorityOptions,
  },
};

/** The value a POST or PATCH request sent. */
export const sentValue = (request: FakeRequest) =>
  z
    .object({
      data: z.object({ attributes: z.object({ value: z.unknown() }) }),
    })
    .parse(request.body).data.attributes.value;

const customFieldBody = (apiSlug: string, value: unknown) => ({
  id: `cf-${apiSlug}`,
  type: 'custom_field',
  attributes: {
    api_slug: apiSlug,
    value,
    display_value: typeof value === 'string' ? value.toUpperCase() : null,
  },
});

/**
 * Routes for one record whose custom field values follow every POST, PATCH
 * and DELETE, like the real API. `path` is the record path, such as
 * /containers/{id}.
 */
export function storedCustomFields(
  path: string,
  initial: Record<string, unknown> = {},
  record: unknown = refContainer([]),
) {
  const values = new Map(Object.entries(initial));
  const routes: FakeRoutes = {
    ...definitionRoutes,
    [`GET ${path}`]: { body: record },
    [`GET ${path}/custom_fields`]: () => ({
      body: {
        data: [...values].map(([slug, value]) => customFieldBody(slug, value)),
      },
    }),
    [`POST ${path}/custom_fields`]: (request): FakeResponse => {
      const { api_slug, value } = z
        .object({
          data: z.object({
            attributes: z.object({ api_slug: z.string(), value: z.unknown() }),
          }),
        })
        .parse(request.body).data.attributes;
      values.set(api_slug, value);
      return { status: 201, body: { data: customFieldBody(api_slug, value) } };
    },
  };
  for (const slug of ['po_number', 'priority']) {
    routes[`PATCH ${path}/custom_fields/${slug}`] = (request) => {
      const value = sentValue(request);
      values.set(slug, value);
      return { body: { data: customFieldBody(slug, value) } };
    };
    routes[`DELETE ${path}/custom_fields/${slug}`] = () => {
      values.delete(slug);
      return { status: 204 };
    };
  }
  return { routes, values };
}
