/**
 * get_vessel tool
 * Reads a vessel's identity and last reported position and, on request, its
 * projected track to a port. The projection is a paid feature, so an account
 * without it still gets the vessel with a note instead of an error. A port
 * pair the API cannot project also gets a note, so the vessel is not lost.
 */

import type {
  Terminal49Client,
  Vessel,
  VesselPosition,
  VesselWithFuturePositions,
} from '@terminal49/sdk';
import { z } from 'zod';
import {
  httpStatus,
  isFeatureNotEnabled,
  type SoftResult,
  ToolInputError,
} from './soft-results.js';

/** Most projected positions one response carries. */
export const MAX_FUTURE_POSITIONS = 120;

const uuid = (description: string) => z.string().uuid().describe(description);

export const getVesselInputSchema = z.object({
  id: uuid(
    'The Terminal49 vessel ID (UUID format), for example vessel_id from get_container_transport_events. Identifier only; never pass conversation text.',
  ),
  eta_to: z
    .object({
      port_id: uuid('Terminal49 ID of the port the vessel is heading to.'),
      previous_port_id: uuid(
        'Terminal49 ID of the port the vessel left before heading to port_id.',
      ),
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .optional()
        .describe(
          'Start the projection from this latitude instead of the last reported position. Give longitude too.',
        ),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .optional()
        .describe(
          'Start the projection from this longitude instead of the last reported position. Give latitude too.',
        ),
    })
    .optional()
    .describe(
      'Project the vessel track to a port and estimate its arrival. Routing Data is a paid feature.',
    ),
});

export type GetVesselArgs = z.input<typeof getVesselInputSchema>;

const positionSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timestamp: z.string(),
});

const etaSchema = z.object({
  port_id: z.string(),
  previous_port_id: z.string(),
  starts_from: z.enum(['last_reported_position', 'given_coordinates']),
  estimated_arrival_at: z.string().nullable(),
  total_positions: z.number(),
  positions: z.array(positionSchema),
});

const vesselSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  imo: z.string().nullable(),
  mmsi: z.string().nullable(),
  position: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      speed_knots: z.number().nullable(),
      heading_degrees: z.number().nullable(),
      reported_at: z.string().nullable(),
    })
    .nullable(),
  eta: etaSchema.nullable().optional(),
  eta_note: z.string().optional(),
});

export const getVesselOutputSchema = vesselSchema.partial().extend({
  error: z.string().optional(),
  message: z.string().optional(),
  alternative: z.string().optional(),
});

export type VesselResult = z.infer<typeof vesselSchema>;
type Eta = z.infer<typeof etaSchema>;

export const VESSEL_FEATURE_NOT_ENABLED: SoftResult<'FeatureNotEnabled'> = {
  error: 'FeatureNotEnabled',
  message:
    'Vessel data is not enabled for this Terminal49 account. Contact sales@terminal49.com to enable it.',
  alternative:
    'Use get_shipment_details for the vessel name, voyage, and ETA at the port of discharge.',
};

export const ETA_FEATURE_NOTE =
  'The projected track is a paid feature (Routing Data) and is not enabled for this Terminal49 account. Contact sales@terminal49.com to enable it.';

export const ETA_PORTS_NOTE =
  'Terminal49 could not project a track for this port pair. Check that port_id is the next port of call and previous_port_id the port the vessel left before it.';

/**
 * Keeps at most MAX_FUTURE_POSITIONS points, evenly spaced, always with the
 * first and last. The API returns one position per minute, so a long leg has
 * thousands.
 */
export function downsample<T>(points: readonly T[]): T[] {
  if (points.length <= MAX_FUTURE_POSITIONS) return [...points];
  const step = (points.length - 1) / (MAX_FUTURE_POSITIONS - 1);
  const sampled: T[] = [];
  for (let index = 0; index < MAX_FUTURE_POSITIONS; index++) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

function toEta(
  request: NonNullable<GetVesselArgs['eta_to']>,
  projected: VesselWithFuturePositions,
): Eta {
  const positions = downsample(projected.positions).map(
    ({ latitude, longitude, timestamp }: VesselPosition) => ({
      latitude,
      longitude,
      timestamp,
    }),
  );
  return {
    port_id: request.port_id,
    previous_port_id: request.previous_port_id,
    starts_from:
      request.latitude === undefined
        ? 'last_reported_position'
        : 'given_coordinates',
    estimated_arrival_at: projected.positions.at(-1)?.timestamp ?? null,
    total_positions: projected.positions.length,
    positions,
  };
}

async function projectTrack(
  id: string,
  request: NonNullable<GetVesselArgs['eta_to']>,
  client: Terminal49Client,
): Promise<Pick<VesselResult, 'eta' | 'eta_note'>> {
  const ports = {
    portId: request.port_id,
    previousPortId: request.previous_port_id,
  };
  try {
    const projected: VesselWithFuturePositions =
      request.latitude === undefined || request.longitude === undefined
        ? await client.vessels.futurePositions(id, ports, { format: 'mapped' })
        : await client.vessels.futurePositionsWithCoords(
            id,
            {
              ...ports,
              latitude: request.latitude,
              longitude: request.longitude,
            },
            { format: 'mapped' },
          );
    return { eta: toEta(request, projected) };
  } catch (error) {
    if (isFeatureNotEnabled(error)) {
      return { eta: null, eta_note: ETA_FEATURE_NOTE };
    }
    // The vessel read runs alongside, so a 404 here is about the ports.
    const status = httpStatus(error);
    if (status === 404 || status === 422) {
      return { eta: null, eta_note: ETA_PORTS_NOTE };
    }
    throw error;
  }
}

export async function executeGetVessel(
  args: GetVesselArgs,
  client: Terminal49Client,
): Promise<VesselResult | SoftResult<'FeatureNotEnabled'>> {
  const { id, eta_to } = getVesselInputSchema.parse(args);
  if (
    eta_to &&
    (eta_to.latitude === undefined) !== (eta_to.longitude === undefined)
  ) {
    throw new ToolInputError(
      'Give eta_to.latitude and eta_to.longitude together, or neither.',
    );
  }

  let vessel: Vessel;
  let projection: Pick<VesselResult, 'eta' | 'eta_note'> | undefined;
  try {
    [vessel, projection] = await Promise.all([
      client.vessels.get(id, { format: 'mapped' }),
      eta_to ? projectTrack(id, eta_to, client) : Promise.resolve(undefined),
    ]);
  } catch (error) {
    if (isFeatureNotEnabled(error)) {
      return { ...VESSEL_FEATURE_NOT_ENABLED };
    }
    throw error;
  }

  const result: VesselResult = {
    id: vessel.id || id,
    name: vessel.name,
    imo: vessel.imo,
    mmsi: vessel.mmsi,
    position:
      vessel.latitude === null || vessel.longitude === null
        ? null
        : {
            latitude: vessel.latitude,
            longitude: vessel.longitude,
            speed_knots: vessel.speedKnots,
            heading_degrees: vessel.headingDegrees,
            reported_at: vessel.positionAt,
          },
  };
  return projection ? { ...result, ...projection } : result;
}
