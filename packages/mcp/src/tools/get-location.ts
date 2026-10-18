/**
 * get_location tool
 * Reads a port, terminal, or metro area. A terminal's FIRMS code and address
 * and its port's time zone matter for pickups, because the last free day is
 * counted in terminal-local time.
 */

import { NotFoundError, type Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { nullableString, relationshipRef } from './api-fields.js';
import { httpStatus, ToolInputError } from './soft-results.js';

export const LOCATION_KINDS = ['port', 'terminal', 'metro_area'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

const LOCATION_LABELS: Record<LocationKind, string> = {
  port: 'port',
  terminal: 'terminal',
  metro_area: 'metro area',
};

export const getLocationInputSchema = z.object({
  kind: z
    .enum(LOCATION_KINDS)
    .describe('What to look up: port, terminal, or metro_area.'),
  id: z
    .string()
    .trim()
    .min(1)
    .max(36)
    .describe(
      'The Terminal49 location ID (UUID format). A port or metro_area also accepts its five-character UN/LOCODE, such as USLAX. Identifier only; never pass conversation text.',
    ),
});

export type GetLocationArgs = z.input<typeof getLocationInputSchema>;

const portSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  code: z.string().nullable(),
  time_zone: z.string().nullable(),
});

const addressSchema = z.object({
  street: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  state_abbr: z.string().nullable(),
  zip: z.string().nullable(),
  country: z.string().nullable(),
});

export const getLocationOutputSchema = z.object({
  kind: z.enum(LOCATION_KINDS),
  id: z.string(),
  name: z.string().nullable(),
  time_zone: z.string().nullable(),
  code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state_abbr: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  nickname: z.string().nullable().optional(),
  firms_code: z.string().nullable().optional(),
  smdg_code: z.string().nullable().optional(),
  bic_facility_code: z.string().nullable().optional(),
  address: addressSchema.optional(),
  port: portSummarySchema.nullable().optional(),
});

export type LocationResult = z.infer<typeof getLocationOutputSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UN_LOCODE = /^[A-Z]{2}[A-Z0-9]{3}$/i;

/** The API sends coordinates as decimal strings. */
const coordinate = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite())
  .nullable()
  .catch(null);

const placeAttributesSchema = z.object({
  name: nullableString,
  code: nullableString,
  city: nullableString,
  state_abbr: nullableString,
  country_code: nullableString,
  time_zone: nullableString,
  latitude: coordinate,
  longitude: coordinate,
});

const rawPlaceSchema = z.object({
  data: z.object({ id: z.string(), attributes: placeAttributesSchema }),
});

const rawTerminalSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      name: nullableString,
      nickname: nullableString,
      firms_code: nullableString,
      smdg_code: nullableString,
      bic_facility_code: nullableString,
      street: nullableString,
      city: nullableString,
      state: nullableString,
      state_abbr: nullableString,
      zip: nullableString,
      country: nullableString,
    }),
    relationships: z.object({ port: relationshipRef }).catch({ port: null }),
  }),
});

/** Checks the id per kind, because only ports and metro areas take a UN/LOCODE. */
function locationId(kind: LocationKind, id: string): string {
  if (UUID.test(id)) return id;
  if (kind !== 'terminal' && UN_LOCODE.test(id)) return id.toUpperCase();
  throw new ToolInputError(
    kind === 'terminal'
      ? 'A terminal id must be a Terminal49 UUID.'
      : `A ${LOCATION_LABELS[kind]} id must be a Terminal49 UUID or a five-character UN/LOCODE.`,
  );
}

async function getPlace(
  kind: 'port' | 'metro_area',
  id: string,
  client: Terminal49Client,
): Promise<LocationResult> {
  const raw =
    kind === 'port'
      ? await client.ports.get(id, { format: 'raw' })
      : await client.metroAreas.get(id, { format: 'raw' });
  // An unknown metro area answers 200 with data: null.
  const parsed = rawPlaceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new NotFoundError(`No ${LOCATION_LABELS[kind]} found with id ${id}`);
  }
  const { data } = parsed.data;
  const { city, ...attributes } = data.attributes;
  const place: LocationResult = { kind, id: data.id, ...attributes };
  if (kind === 'port') place.city = city;
  return place;
}

async function getTerminal(
  id: string,
  client: Terminal49Client,
): Promise<LocationResult> {
  const { data } = rawTerminalSchema.parse(
    await client.terminals.get(id, { format: 'raw' }),
  );
  const { name, nickname, firms_code, smdg_code, bic_facility_code } =
    data.attributes;
  const { street, city, state, state_abbr, zip, country } = data.attributes;
  const portId = data.relationships.port?.data?.id;
  const port = portId
    ? await getPlace('port', portId, client).catch((error: unknown) => {
        if (error instanceof NotFoundError || httpStatus(error) === 404) {
          return null;
        }
        throw error;
      })
    : null;

  return {
    kind: 'terminal',
    id: data.id,
    name,
    time_zone: port?.time_zone ?? null,
    nickname,
    firms_code,
    smdg_code,
    bic_facility_code,
    address: { street, city, state, state_abbr, zip, country },
    port: port && {
      id: port.id,
      name: port.name,
      code: port.code ?? null,
      time_zone: port.time_zone,
    },
  };
}

export async function executeGetLocation(
  args: GetLocationArgs,
  client: Terminal49Client,
): Promise<LocationResult> {
  const { kind, id } = getLocationInputSchema.parse(args);
  const checkedId = locationId(kind, id);
  return kind === 'terminal'
    ? getTerminal(checkedId, client)
    : getPlace(kind, checkedId, client);
}
