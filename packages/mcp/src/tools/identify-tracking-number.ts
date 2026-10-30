/**
 * identify_tracking_number tool
 * Answers "which carrier is this number, what kind of number is it, and do we
 * already track it?" without creating a tracking request, so it adds no
 * billable volume. Backed by the beta infer_number endpoint and a search for
 * containers, shipments, and in-progress requests with exactly this number.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import {
  nullableBoolean,
  nullableNumber,
  nullableString,
} from './api-fields.js';
import { httpStatus, type SoftResult } from './soft-results.js';
import {
  IN_PROGRESS_REQUEST_STATUSES,
  normalizeTrackingNumber,
} from './track-container.js';

export const identifyTrackingNumberInputSchema = z.object({
  number: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .describe(
      'One container, Bill of Lading, or booking number. Identifier only; never pass conversation text.',
    ),
});

export type IdentifyTrackingNumberArgs = z.input<
  typeof identifyTrackingNumberInputSchema
>;

const carrierSchema = z.object({
  scac: z.string(),
  name: z.string().nullable(),
  confidence: z.number().nullable(),
});

const trackedRecordSchema = z.object({
  id: z.string(),
  shipping_line: z.string().nullable(),
});

const identificationSchema = z.object({
  number: z.string(),
  number_type: z
    .enum(['container', 'bill_of_lading', 'booking_number'])
    .nullable(),
  is_valid: z.boolean().nullable(),
  check_digit_passed: z.boolean().nullable(),
  invalid_reason: z.string().nullable(),
  carrier: z.object({
    decision: z.string().nullable(),
    selected: carrierSchema.nullable(),
    candidates: z.array(carrierSchema),
  }),
  already_tracked: z
    .object({
      containers: z.array(trackedRecordSchema),
      shipments: z.array(trackedRecordSchema),
      in_progress_request: z
        .object({
          id: z.string(),
          status: z.string(),
          request_number: z.string(),
          scac: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  already_tracked_note: z.string().optional(),
});

export const identifyTrackingNumberOutputSchema = identificationSchema
  .partial()
  .extend({
    error: z.string().optional(),
    message: z.string().optional(),
    alternative: z.string().optional(),
  });

export type TrackingNumberIdentification = z.infer<typeof identificationSchema>;

export type RateLimitedResult = SoftResult<'rate_limited'>;

export const RATE_LIMITED: RateLimitedResult = {
  error: 'rate_limited',
  message:
    'Terminal49 is limiting how often numbers can be identified. Nothing was created.',
  alternative:
    'Wait a minute and try again, or use search_container to check whether the number is already tracked.',
};

export const ALREADY_TRACKED_UNKNOWN_NOTE =
  'Terminal49 could not check whether this account already tracks the number. Use search_container to check before calling track_container.';

const NUMBER_TYPES = new Map<
  unknown,
  NonNullable<TrackingNumberIdentification['number_type']>
>([
  ['container', 'container'],
  ['bill_of_lading', 'bill_of_lading'],
  ['booking', 'booking_number'],
  ['booking_number', 'booking_number'],
]);

const rawCarrierSchema = z.object({
  scac: z.string(),
  name: nullableString,
  confidence: nullableNumber,
});

const rawInferenceSchema = z.object({
  data: z.object({
    attributes: z.object({
      number_type: z.unknown(),
      validation: z
        .object({
          is_valid: nullableBoolean,
          check_digit_passed: nullableBoolean,
          reason: nullableString,
        })
        .catch({ is_valid: null, check_digit_passed: null, reason: null }),
      shipping_line: z
        .object({
          decision: nullableString,
          selected: rawCarrierSchema.nullable().catch(null),
          candidates: z
            .array(z.unknown())
            .catch([])
            .transform((candidates) =>
              candidates.flatMap((candidate) => {
                const parsed = rawCarrierSchema.safeParse(candidate);
                return parsed.success ? [parsed.data] : [];
              }),
            ),
        })
        .catch({ decision: null, selected: null, candidates: [] }),
    }),
  }),
});

const searchHitSchema = z.object({
  id: z.string(),
  type: z.literal('search_result'),
  attributes: z.object({
    entity_type: nullableString,
    number: nullableString,
    scac: nullableString,
    status: nullableString,
  }),
});

const rawSearchSchema = z.object({ data: z.array(searchHitSchema) });

/** `/search` returns at most this many hits, so a full page may omit the exact one. */
const SEARCH_RESULT_CAP = 25;

type AlreadyTracked = Pick<
  TrackingNumberIdentification,
  'already_tracked' | 'already_tracked_note'
>;

const UNKNOWN: AlreadyTracked = {
  already_tracked: null,
  already_tracked_note: ALREADY_TRACKED_UNKNOWN_NOTE,
};

/**
 * The account's containers, shipments, and in-progress tracking requests whose
 * number is exactly `number`. Search also matches substrings and reference
 * numbers, so other hits never count.
 */
async function findAlreadyTracked(
  number: string,
  client: Terminal49Client,
): Promise<AlreadyTracked> {
  let raw: unknown;
  try {
    raw = await client.search(number);
  } catch (error) {
    if (httpStatus(error) === 429) throw error;
    return { ...UNKNOWN };
  }

  const parsed = rawSearchSchema.safeParse(raw);
  if (!parsed.success) return { ...UNKNOWN };
  const page = parsed.data.data;
  const hits = page.filter(
    (hit) =>
      hit.attributes.number !== null &&
      normalizeTrackingNumber(hit.attributes.number) === number,
  );
  const records = (entityTypes: readonly string[]) =>
    hits
      .filter((hit) => entityTypes.includes(hit.attributes.entity_type ?? ''))
      .map((hit) => ({ id: hit.id, shipping_line: hit.attributes.scac }));
  const request = hits.find(
    (hit) =>
      hit.attributes.entity_type === 'tracking_request' &&
      IN_PROGRESS_REQUEST_STATUSES.has(hit.attributes.status ?? ''),
  );

  const containers = records(['cargo', 'container']);
  const shipments = records(['shipment']);
  if (!request && containers.length === 0 && shipments.length === 0) {
    return page.length < SEARCH_RESULT_CAP
      ? { already_tracked: null }
      : { ...UNKNOWN };
  }
  return {
    already_tracked: {
      containers,
      shipments,
      in_progress_request: request
        ? {
            id: request.id,
            status: request.attributes.status ?? '',
            request_number: request.attributes.number ?? number,
            scac: request.attributes.scac,
          }
        : null,
    },
  };
}

export async function executeIdentifyTrackingNumber(
  args: IdentifyTrackingNumberArgs,
  client: Terminal49Client,
): Promise<TrackingNumberIdentification | RateLimitedResult> {
  const number = normalizeTrackingNumber(
    identifyTrackingNumberInputSchema.parse(args).number,
  );

  let inferred: unknown;
  let tracked: AlreadyTracked;
  try {
    [inferred, tracked] = await Promise.all([
      client.trackingRequests.inferNumber(number),
      findAlreadyTracked(number, client),
    ]);
  } catch (error) {
    if (httpStatus(error) === 429) {
      return { ...RATE_LIMITED };
    }
    throw error;
  }

  const { attributes } = rawInferenceSchema.parse(inferred).data;
  return {
    number,
    number_type: NUMBER_TYPES.get(attributes.number_type) ?? null,
    is_valid: attributes.validation.is_valid,
    check_digit_passed: attributes.validation.check_digit_passed,
    invalid_reason: attributes.validation.reason,
    carrier: attributes.shipping_line,
    ...tracked,
  };
}
