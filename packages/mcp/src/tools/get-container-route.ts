import {
  FeatureNotEnabledError,
  NotFoundError,
  Terminal49Client,
  type ContainerRoute,
  type RouteVesselPort,
} from '@terminal49/sdk';
import { z } from 'zod';
import { logMcpEvent } from '../logging.js';

export interface FeatureNotEnabledResult {
  error: 'FeatureNotEnabled';
  message: string;
  alternative: string;
}

export interface NotFoundResult {
  error: 'NotFound';
  message: string;
  alternative: string;
}

export interface NoRouteDataResult {
  error: 'NoRouteData';
  message: string;
  alternative: string;
}

type SoftError = FeatureNotEnabledResult | NotFoundResult | NoRouteDataResult;

export interface GetContainerRouteArgs {
  id: string;
}

const portRefSchema = z
  .object({ name: z.string().nullable(), label: z.string().nullable() })
  .nullable();

const routeSummarySchema = z.object({
  total_ports: z.number(),
  ports: z.array(
    z.object({
      sequence: z.number().nullable(),
      label: z.string().nullable(),
      name: z.string().nullable(),
      country_code: z.string().nullable(),
      inbound: z.object({
        eta: z.string().nullable(),
        ata: z.string().nullable(),
      }),
      outbound: z.object({
        etd: z.string().nullable(),
        atd: z.string().nullable(),
      }),
    }),
  ),
  current_vessel: z
    .object({
      name: z.string().nullable(),
      imo: z.string().nullable(),
      voyage: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      heading: z.number().nullable(),
      speed_knots: z.number().nullable(),
      position_at: z.string().nullable(),
      departure_port: portRefSchema,
      arrival_port: portRefSchema,
    })
    .nullable(),
});

export type RouteSummary = z.infer<typeof routeSummarySchema>;

export const routeSummaryOrSoftErrorSchema = routeSummarySchema
  .partial()
  .extend({
    error: z.string().optional(),
    message: z.string().optional(),
    alternative: z.string().optional(),
  });

export async function executeGetContainerRoute(
  args: GetContainerRouteArgs,
  client: Terminal49Client,
): Promise<RouteSummary | SoftError> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Container ID is required');
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'get_container_route',
    container_id: args.id,
    timestamp: new Date().toISOString(),
  });

  try {
    const route: ContainerRoute = await client.containers.route(args.id, {
      format: 'mapped',
    });
    const duration = Date.now() - startTime;

    if (route.ports.length === 0 && route.currentVessel === null) {
      return logSoftError(args.id, duration, NO_ROUTE_DATA);
    }

    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'get_container_route',
      container_id: args.id,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return formatRoute(route);
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as any;

    if (
      err instanceof FeatureNotEnabledError ||
      (err?.status === 403 && /not enabled|feature/i.test(err.message))
    ) {
      return logSoftError(args.id, duration, FEATURE_NOT_ENABLED);
    }

    if (err instanceof NotFoundError || err?.status === 404) {
      return logSoftError(args.id, duration, NOT_FOUND);
    }

    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'get_container_route',
      container_id: args.id,
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}

const FEATURE_NOT_ENABLED: FeatureNotEnabledResult = {
  error: 'FeatureNotEnabled',
  message:
    'Route data is a paid feature (Routing Data) and is not enabled for this Terminal49 account. ' +
    'Contact sales@terminal49.com to enable it.',
  alternative:
    'Use get_container_transport_events to see historical movement, or get_container for the POL, POD, and ETA.',
};

const NOT_FOUND: NotFoundResult = {
  error: 'NotFound',
  message:
    'No container was found with this ID, so there is no route to return.',
  alternative:
    'Use search_container to find the correct container ID, or get_container for basic details.',
};

const NO_ROUTE_DATA: NoRouteDataResult = {
  error: 'NoRouteData',
  message:
    'Terminal49 has no route data for this container yet. This is common before the container is loaded on a vessel.',
  alternative:
    'Use get_container_transport_events to see milestones so far, or get_container for the POL, POD, and ETA.',
};

function logSoftError<T extends SoftError>(
  containerId: string,
  duration: number,
  result: T,
): T {
  logMcpEvent({
    event: 'tool.execute.error',
    tool: 'get_container_route',
    container_id: containerId,
    error: result.error,
    message: result.message,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
  });
  return { ...result };
}

function formatRoute({
  ports,
  currentVessel,
  totalPorts,
}: ContainerRoute): RouteSummary {
  const portRef = ({ locationId, name, label }: RouteVesselPort) => {
    if (name !== null || label !== null) return { name, label };
    const port =
      locationId === null
        ? undefined
        : ports.find((p) => p.locationId === locationId);
    return port ? { name: port.name, label: port.label } : null;
  };

  return {
    total_ports: totalPorts,
    ports: ports.map((port) => ({
      sequence: port.sequence,
      label: port.label,
      name: port.name,
      country_code: port.countryCode,
      inbound: port.inbound,
      outbound: port.outbound,
    })),
    current_vessel: currentVessel && {
      name: currentVessel.name,
      imo: currentVessel.imo,
      voyage: currentVessel.voyage,
      latitude: currentVessel.coordinates?.latitude ?? null,
      longitude: currentVessel.coordinates?.longitude ?? null,
      heading: currentVessel.heading,
      speed_knots: currentVessel.speed,
      position_at: currentVessel.positionAt,
      departure_port: portRef(currentVessel.departurePort),
      arrival_port: portRef(currentVessel.arrivalPort),
    },
  };
}
