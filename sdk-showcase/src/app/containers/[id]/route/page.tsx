import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Container Route Page
 *
 * SDK Methods demonstrated:
 * - client.containers.route(id) - Get container route with legs and locations
 * - client.containers.get(id) - Get container details for context
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RouteLeg {
  id?: string;
  leg_number?: number;
  legNumber?: number;
  mode?: string;
  transport_mode?: string;
  transportMode?: string;
  vessel_name?: string;
  vesselName?: string;
  vessel_imo?: string;
  vesselImo?: string;
  voyage_number?: string;
  voyageNumber?: string;
  origin_name?: string;
  originName?: string;
  origin_locode?: string;
  originLocode?: string;
  destination_name?: string;
  destinationName?: string;
  destination_locode?: string;
  destinationLocode?: string;
  etd?: string;
  atd?: string;
  eta?: string;
  ata?: string;
  etd_at?: string;
  etdAt?: string;
  atd_at?: string;
  atdAt?: string;
  eta_at?: string;
  etaAt?: string;
  ata_at?: string;
  ataAt?: string;
}

interface RouteData {
  legs?: RouteLeg[];
  origin?: {
    name?: string;
    locode?: string;
  };
  destination?: {
    name?: string;
    locode?: string;
  };
}

async function getContainerRoute(id: string) {
  if (!hasApiToken()) {
    return {
      container: null,
      route: null,
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  const client = getClient();

  try {
    // Fetch container details and route in parallel
    const [container, routeResult] = await Promise.all([
      client.containers.get(id, ['shipment'], { format: 'mapped' }),
      client.containers.route(id, { format: 'mapped' }).catch(() => null),
    ]);

    return { container, route: routeResult };
  } catch (error) {
    console.error('Failed to fetch container route:', error);
    return {
      container: null,
      route: null,
      error: error instanceof Error ? error.message : 'Failed to fetch container route',
    };
  }
}

function getModeIcon(mode: string): string {
  const modeType = mode?.toLowerCase() || '';
  if (modeType.includes('vessel') || modeType.includes('ocean') || modeType.includes('sea')) return '🚢';
  if (modeType.includes('rail') || modeType.includes('train')) return '🚂';
  if (modeType.includes('truck') || modeType.includes('road')) return '🚚';
  if (modeType.includes('barge')) return '⛵';
  if (modeType.includes('air')) return '✈️';
  return '📍';
}

function formatMode(mode: string): string {
  if (!mode) return 'Unknown';
  return mode
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function ContainerRoutePage({ params }: PageProps) {
  const { id } = await params;
  const { container, route, error } = await getContainerRoute(id);

  if (!container && !error) {
    notFound();
  }

  const number = container?.number;
  const routeData = route as RouteData | null;
  const legs = routeData?.legs || [];

  const routeCode = `// Get container route information
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get route with all legs and locations
const route = await client.containers.route('${id}', {
  format: 'mapped'
});

// Route includes:
// - legs: Array of route segments (ocean, rail, truck, etc.)
// - Each leg has origin/destination, vessel/voyage, ETD/ETA/ATD/ATA
// - Legs are ordered by leg_number (1 = first leg)

// Example leg structure:
// {
//   leg_number: 1,
//   mode: 'vessel',
//   vessel_name: 'EVER GIVEN',
//   voyage_number: '1234E',
//   origin_name: 'Shanghai',
//   destination_name: 'Los Angeles',
//   etd: '2025-01-15T10:00:00Z',
//   eta: '2025-02-01T08:00:00Z'
// }`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Route: ${number || id.slice(0, 8)}`}
        description="Container route with legs, vessels, and timing"
        actions={
          <div className="flex gap-2">
            <Button href={`/containers/${id}`} variant="secondary">
              ← Container Details
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading route</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-kumo-line pb-2">
          <Link
            href={`/containers/${id}`}
            className="px-4 py-2 text-sm text-kumo-secondary hover:text-kumo-default"
          >
            Overview
          </Link>
          <Link
            href={`/containers/${id}/events`}
            className="px-4 py-2 text-sm text-kumo-secondary hover:text-kumo-default"
          >
            Events
          </Link>
          <Link
            href={`/containers/${id}/route`}
            className="px-4 py-2 text-sm font-medium border-b-2 border-kumo-focus text-kumo-default"
          >
            Route
          </Link>
          <Link
            href={`/containers/${id}/demurrage`}
            className="px-4 py-2 text-sm text-kumo-secondary hover:text-kumo-default"
          >
            Demurrage
          </Link>
        </div>

        {container && (
          <>
            {/* Route Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Route Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {legs.length > 0 ? (
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Origin */}
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🏭</span>
                      <div>
                        <p className="font-medium">
                          {legs[0]?.origin_name || legs[0]?.originName || 'Origin'}
                        </p>
                        <p className="text-sm text-kumo-muted">
                          {legs[0]?.origin_locode || legs[0]?.originLocode || '—'}
                        </p>
                      </div>
                    </div>

                    {/* Arrow with leg count */}
                    <div className="flex-1 flex items-center justify-center min-w-[100px]">
                      <div className="flex items-center gap-2">
                        <div className="h-0.5 flex-1 bg-kumo-line min-w-[40px]" />
                        <span className="px-3 py-1 rounded-full bg-kumo-recessed text-sm">
                          {legs.length} leg{legs.length !== 1 ? 's' : ''}
                        </span>
                        <div className="h-0.5 flex-1 bg-kumo-line min-w-[40px]" />
                        <span className="text-kumo-muted">→</span>
                      </div>
                    </div>

                    {/* Destination */}
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🏭</span>
                      <div>
                        <p className="font-medium">
                          {legs[legs.length - 1]?.destination_name ||
                            legs[legs.length - 1]?.destinationName ||
                            'Destination'}
                        </p>
                        <p className="text-sm text-kumo-muted">
                          {legs[legs.length - 1]?.destination_locode ||
                            legs[legs.length - 1]?.destinationLocode ||
                            '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-kumo-muted text-center py-4">No route information available</p>
                )}
              </CardContent>
            </Card>

            {/* Route Legs */}
            <Card>
              <CardHeader>
                <CardTitle>Route Legs ({legs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {legs.length > 0 ? (
                  <div className="space-y-4">
                    {legs.map((leg: RouteLeg, index: number) => {
                      const legNumber = leg.leg_number || leg.legNumber || index + 1;
                      const mode = leg.mode || leg.transport_mode || leg.transportMode || 'unknown';
                      const vesselName = leg.vessel_name || leg.vesselName;
                      const vesselImo = leg.vessel_imo || leg.vesselImo;
                      const voyageNumber = leg.voyage_number || leg.voyageNumber;
                      const originName = leg.origin_name || leg.originName;
                      const originLocode = leg.origin_locode || leg.originLocode;
                      const destName = leg.destination_name || leg.destinationName;
                      const destLocode = leg.destination_locode || leg.destinationLocode;
                      const etd = leg.etd || leg.etd_at || leg.etdAt;
                      const atd = leg.atd || leg.atd_at || leg.atdAt;
                      const eta = leg.eta || leg.eta_at || leg.etaAt;
                      const ata = leg.ata || leg.ata_at || leg.ataAt;

                      return (
                        <div
                          key={leg.id || index}
                          className="p-4 rounded-lg border border-kumo-line"
                        >
                          {/* Leg Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{getModeIcon(mode)}</span>
                              <div>
                                <p className="font-medium">
                                  Leg {legNumber}: {formatMode(mode)}
                                </p>
                                {(vesselName || voyageNumber) && (
                                  <p className="text-sm text-kumo-secondary">
                                    {vesselName}
                                    {voyageNumber && ` / Voyage ${voyageNumber}`}
                                    {vesselImo && ` (IMO: ${vesselImo})`}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                ata
                                  ? 'bg-green-100 text-green-800'
                                  : atd
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {ata ? 'Arrived' : atd ? 'In Transit' : 'Pending'}
                            </span>
                          </div>

                          {/* Origin and Destination */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Origin */}
                            <div className="p-3 rounded-lg bg-kumo-recessed">
                              <p className="text-xs text-kumo-secondary mb-1">Origin</p>
                              <p className="font-medium">{originName || '—'}</p>
                              {originLocode && (
                                <p className="text-sm text-kumo-muted">{originLocode}</p>
                              )}
                              <div className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-kumo-secondary">ETD:</span>
                                  <span>{etd ? formatDate(etd) : '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-kumo-secondary">ATD:</span>
                                  <span className={atd ? 'text-green-600' : ''}>
                                    {atd ? formatDate(atd) : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Destination */}
                            <div className="p-3 rounded-lg bg-kumo-recessed">
                              <p className="text-xs text-kumo-secondary mb-1">Destination</p>
                              <p className="font-medium">{destName || '—'}</p>
                              {destLocode && (
                                <p className="text-sm text-kumo-muted">{destLocode}</p>
                              )}
                              <div className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-kumo-secondary">ETA:</span>
                                  <span>{eta ? formatDate(eta) : '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-kumo-secondary">ATA:</span>
                                  <span className={ata ? 'text-green-600' : ''}>
                                    {ata ? formatDate(ata) : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-kumo-muted text-center py-8">No route legs available</p>
                )}
              </CardContent>
            </Card>

            {/* Raw Route Data */}
            {routeData && (
              <Card>
                <CardHeader>
                  <CardTitle>Raw Route Response</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="p-4 rounded-lg bg-kumo-recessed overflow-x-auto text-sm max-h-64">
                    <code>{JSON.stringify(routeData, null, 2)}</code>
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* SDK Code Panel */}
            <CodePanel title="SDK Code - Route" code={routeCode} collapsible />
          </>
        )}
      </div>
    </div>
  );
}
