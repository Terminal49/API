import { z } from 'zod';
import { ValidationError } from '@terminal49/sdk';
import type {
  ShipmentListFilters,
  ContainerListFilters,
} from '@terminal49/sdk';
import {
  shipmentFilterShape,
  containerFilterShape,
  shipmentSortSchema,
  containerSortSchema,
  SHIPMENT_FILTER_KEYS,
  CONTAINER_FILTER_KEYS,
} from '../generated/list-filter-schemas.js';
export { SHIPMENT_FILTER_KEYS, CONTAINER_FILTER_KEYS };

const paginationShape = {
  page: z
    .number()
    .int()
    .positive()
    .describe('Page number, starting at 1. Fetch one page per call.')
    .optional(),
  page_size: z
    .number()
    .int()
    .positive()
    .max(25)
    .describe('Items requested on this page, from 1 to 25.')
    .default(25),
};

export const shipmentListInputSchema = z.strictObject({
  number: shipmentFilterShape.number,
  tracking_stopped: shipmentFilterShape.tracking_stopped,
  actively_tracked: shipmentFilterShape.actively_tracked,
  voyage_status: shipmentFilterShape.voyage_status,
  pod_code: shipmentFilterShape.pod_code,
  pol_code: shipmentFilterShape.pol_code,
  pod_arrival: shipmentFilterShape.pod_arrival,
  created_at: shipmentFilterShape.created_at,
  tags: shipmentFilterShape.tags,
  advanced_filters: z
    .strictObject(shipmentFilterShape)
    .describe(
      'All confirmed public shipment filters. Supply a filter here or at the top level, never both. Different filters combine with AND; consult each field for array semantics. IDs must come from account-visible resources.',
    )
    .optional(),
  sort: shipmentSortSchema,
  include_containers: z
    .boolean()
    .describe('Include related containers in this page; default false.')
    .default(false),
  ...paginationShape,
});

export const containerListInputSchema = z.strictObject({
  number: containerFilterShape.number,
  current_status: containerFilterShape.current_status,
  pod_code: containerFilterShape.pod_code,
  pol_code: containerFilterShape.pol_code,
  shipping_line_scac: containerFilterShape.shipping_line_scac,
  has_holds: containerFilterShape.has_holds,
  has_fees: containerFilterShape.has_fees,
  requires_attention: containerFilterShape.requires_attention,
  actively_tracked: containerFilterShape.actively_tracked,
  arrival: containerFilterShape.arrival,
  pickup_lfd: containerFilterShape.pickup_lfd,
  tags: containerFilterShape.tags,
  custom_fields: z
    .record(
      z.string().trim().min(1).max(100),
      z.string().trim().min(1).max(200),
    )
    .refine(
      (value) => Object.keys(value).length > 0,
      'expected at least one field',
    )
    .describe(
      'The account\'s own custom fields, keyed by display name (for example "Sales Rep") or api_slug. Text fields match a value the container or its shipment contains (case-sensitive); enum values match an option, case-insensitively; comma-separated text values mean OR. Yes/no fields take true or false; date fields take YYYY-MM-DD with an optional >=, <=, >, <, or = prefix; number fields take an exact number. @exists and @not_exists test presence. Different fields combine with AND. Unknown names return an error listing the account\'s fields.',
    )
    .optional(),
  advanced_filters: z
    .strictObject(containerFilterShape)
    .describe(
      'All confirmed public container filters. Supply a filter here or at the top level, never both. Different filters combine with AND; consult each field for array semantics. Dynamic IDs and carrier codes must come from visible resources.',
    )
    .optional(),
  sort: containerSortSchema,
  include: z
    .array(z.enum(['shipment', 'pod_terminal']))
    .max(2)
    .describe('Related resources included in this page.')
    .optional(),
  ...paginationShape,
});
export type ListShipmentsArgs = z.input<typeof shipmentListInputSchema>;
export type ListContainersArgs = z.input<typeof containerListInputSchema>;

function canonicalFilters(
  args: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const advanced = (args.advanced_filters ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (args[key] !== undefined && advanced[key] !== undefined) {
      throw new ValidationError(
        `Invalid list filter "${key}": duplicate filter; use the top level or advanced_filters, not both.`,
        400,
        { filter: key },
      );
    }
    const value = args[key] ?? advanced[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
export function getShipmentFilters(
  args: ListShipmentsArgs,
): ShipmentListFilters {
  const filters = canonicalFilters(
    shipmentListInputSchema.parse(args),
    SHIPMENT_FILTER_KEYS,
  );
  if (filters.tag !== undefined && filters.tags !== undefined) {
    throw new ValidationError(
      'Invalid list filter "tag": tag and tags are aliases; supply only one.',
      400,
      { filter: 'tag' },
    );
  }
  return filters as ShipmentListFilters;
}
export function getContainerFilters(
  args: ListContainersArgs,
): ContainerListFilters {
  return canonicalFilters(
    containerListInputSchema.parse(args),
    CONTAINER_FILTER_KEYS,
  ) as ContainerListFilters;
}

export const listResponseMetadataSchema = z.strictObject({
  applied_filters: z
    .record(z.string(), z.unknown())
    .describe(
      'Canonical filters applied to this page, excluding response shape, sorting, and pagination.',
    ),
  sort: z.string().optional(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1).max(25),
  has_more: z
    .boolean()
    .nullable()
    .describe(
      'True when the API provides a next link; false when it explicitly reports none; null when next-link information is missing.',
    ),
  next_page: z.number().int().min(1).optional(),
  custom_fields: z
    .array(
      z.strictObject({
        field: z.string(),
        api_slug: z.string(),
        data_type: z.string(),
        value: z.string(),
      }),
    )
    .describe('How each requested custom field name resolved to an API filter.')
    .optional(),
});

export function getListResponseMetadata(
  result: unknown,
  filters: ShipmentListFilters | ContainerListFilters,
  args: { sort?: string; page?: number },
  pageSize: number,
): z.infer<typeof listResponseMetadataSchema> {
  const links = (result as { links?: Record<string, unknown> } | null)?.links;
  const next = links?.next;
  const hasMore =
    !links || !Object.hasOwn(links, 'next') ? null : Boolean(next);
  let nextPage: number | undefined;
  const href =
    typeof next === 'string' ? next : (next as { href?: string } | null)?.href;
  if (href) {
    try {
      const value = new URL(
        href,
        'https://api.terminal49.com',
      ).searchParams.get('page[number]');
      if (
        value &&
        /^\d+$/.test(value) &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) >= 1
      )
        nextPage = Number(value);
    } catch {}
  }
  return {
    applied_filters: { ...filters },
    ...(args.sort !== undefined ? { sort: args.sort } : {}),
    page: args.page ?? 1,
    page_size: pageSize,
    has_more: hasMore,
    ...(nextPage !== undefined ? { next_page: nextPage } : {}),
  };
}
