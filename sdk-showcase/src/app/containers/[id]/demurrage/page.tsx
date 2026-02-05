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
 * Container Demurrage Page
 *
 * SDK Methods demonstrated:
 * - client.getDemurrage(containerId) - Get LFD, fees, and holds information
 * - client.getRailMilestones(containerId) - Get rail tracking (North America)
 * - client.containers.get(id) - Get container details for context
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Fee {
  type?: string;
  description?: string;
  amount?: number | string;
  currency?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
}

interface Hold {
  type?: string;
  status?: string;
  description?: string;
}

interface DemurrageData {
  pickup_lfd?: string;
  pickupLfd?: string;
  last_free_day?: string;
  lastFreeDay?: string;
  available_for_pickup?: boolean;
  availableForPickup?: boolean;
  available_for_pickup_at?: string;
  availableForPickupAt?: string;
  fees_at_pod_terminal?: Fee[];
  feesAtPodTerminal?: Fee[];
  fees?: Fee[];
  holds_at_pod_terminal?: Hold[];
  holdsAtPodTerminal?: Hold[];
  holds?: Hold[] | string[];
  demurrage_per_diem?: number;
  demurragePerDiem?: number;
  demurrage_currency?: string;
  demurrageCurrency?: string;
}

interface RailMilestones {
  pod_rail_loaded_at?: string;
  podRailLoadedAt?: string;
  pod_rail_departed_at?: string;
  podRailDepartedAt?: string;
  ind_rail_arrived_at?: string;
  indRailArrivedAt?: string;
  ind_rail_unloaded_at?: string;
  indRailUnloadedAt?: string;
  rail_carrier_name?: string;
  railCarrierName?: string;
  rail_carrier_scac?: string;
  railCarrierScac?: string;
  rail_destination?: string;
  railDestination?: string;
  rail_events?: any[];
  railEvents?: any[];
}

async function getContainerDemurrage(id: string) {
  if (!hasApiToken()) {
    return {
      container: null,
      demurrage: null,
      railMilestones: null,
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  const client = getClient();

  try {
    // Fetch container details, demurrage, and rail milestones in parallel
    const [container, demurrageResult, railResult] = await Promise.all([
      client.containers.get(id, ['shipment'], { format: 'mapped' }),
      client.getDemurrage(id).catch(() => null),
      client.getRailMilestones(id).catch(() => null),
    ]);

    return {
      container,
      demurrage: demurrageResult,
      railMilestones: railResult,
    };
  } catch (error) {
    console.error('Failed to fetch container demurrage:', error);
    return {
      container: null,
      demurrage: null,
      railMilestones: null,
      error: error instanceof Error ? error.message : 'Failed to fetch container demurrage',
    };
  }
}

function calculateDaysUntilLfd(lfdDate: string): number {
  const lfd = new Date(lfdDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lfd.setHours(0, 0, 0, 0);
  const diffTime = lfd.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getLfdStatus(daysRemaining: number): { color: string; label: string } {
  if (daysRemaining < 0) {
    return { color: 'bg-red-100 text-red-800 border-red-200', label: 'Overdue' };
  }
  if (daysRemaining === 0) {
    return { color: 'bg-red-100 text-red-800 border-red-200', label: 'Today!' };
  }
  if (daysRemaining <= 2) {
    return { color: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Urgent' };
  }
  if (daysRemaining <= 5) {
    return { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Approaching' };
  }
  return { color: 'bg-green-100 text-green-800 border-green-200', label: 'OK' };
}

export default async function ContainerDemurragePage({ params }: PageProps) {
  const { id } = await params;
  const { container, demurrage, railMilestones, error } = await getContainerDemurrage(id);

  if (!container && !error) {
    notFound();
  }

  const number = container?.number;
  const demurrageData = demurrage as DemurrageData | null;
  const railData = railMilestones as RailMilestones | null;

  // Extract demurrage fields
  const lfd =
    demurrageData?.pickup_lfd ||
    demurrageData?.pickupLfd ||
    demurrageData?.last_free_day ||
    demurrageData?.lastFreeDay ||
    container?.pickup_lfd ||
    container?.pickupLfd;
  const isAvailable =
    demurrageData?.available_for_pickup ??
    demurrageData?.availableForPickup ??
    container?.available_for_pickup ??
    container?.availableForPickup;
  const availableSince =
    demurrageData?.available_for_pickup_at ||
    demurrageData?.availableForPickupAt ||
    container?.available_for_pickup_at ||
    container?.availableForPickupAt;
  const fees = demurrageData?.fees_at_pod_terminal || demurrageData?.feesAtPodTerminal || demurrageData?.fees || [];
  const holds = demurrageData?.holds_at_pod_terminal || demurrageData?.holdsAtPodTerminal || demurrageData?.holds || container?.holds || [];
  const perDiem = demurrageData?.demurrage_per_diem || demurrageData?.demurragePerDiem;
  const currency = demurrageData?.demurrage_currency || demurrageData?.demurrageCurrency || 'USD';

  // Extract rail fields
  const railLoaded = railData?.pod_rail_loaded_at || railData?.podRailLoadedAt;
  const railDeparted = railData?.pod_rail_departed_at || railData?.podRailDepartedAt;
  const railArrived = railData?.ind_rail_arrived_at || railData?.indRailArrivedAt;
  const railUnloaded = railData?.ind_rail_unloaded_at || railData?.indRailUnloadedAt;
  const railCarrier = railData?.rail_carrier_name || railData?.railCarrierName;
  const railCarrierScac = railData?.rail_carrier_scac || railData?.railCarrierScac;
  const railDestination = railData?.rail_destination || railData?.railDestination;

  const daysUntilLfd = lfd ? calculateDaysUntilLfd(lfd) : null;
  const lfdStatus = daysUntilLfd !== null ? getLfdStatus(daysUntilLfd) : null;

  const demurrageCode = `// Get demurrage information
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get Last Free Day, fees, holds, and availability
const demurrage = await client.getDemurrage('${id}');

// Demurrage data includes:
// - pickup_lfd: Last Free Day before demurrage charges begin
// - available_for_pickup: Whether container is ready
// - available_for_pickup_at: When container became available
// - fees_at_pod_terminal: Array of fee objects with type, amount, dates
// - holds_at_pod_terminal: Array of holds (customs, freight, etc.)
// - demurrage_per_diem: Daily demurrage rate after LFD

// Example response:
// {
//   pickup_lfd: '2025-02-10',
//   available_for_pickup: true,
//   fees_at_pod_terminal: [
//     { type: 'demurrage', amount: 150, currency: 'USD' }
//   ],
//   holds_at_pod_terminal: []
// }`;

  const railCode = `// Get rail milestones (North America)
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get rail tracking for inland delivery
const railMilestones = await client.getRailMilestones('${id}');

// Rail milestones include:
// - pod_rail_loaded_at: Container loaded onto rail at port
// - pod_rail_departed_at: Train departed from port
// - ind_rail_arrived_at: Train arrived at inland destination
// - ind_rail_unloaded_at: Container unloaded from rail
// - rail_carrier_name: Rail carrier (BNSF, UP, CSX, NS, etc.)
// - rail_destination: Inland rail destination city

// Note: Rail milestones are only available for containers
// with inland rail delivery in North America`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Demurrage: ${number || id.slice(0, 8)}`}
        description="Last Free Day, fees, holds, and rail milestones"
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
            <p className="font-medium">Error loading demurrage</p>
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
            className="px-4 py-2 text-sm text-kumo-secondary hover:text-kumo-default"
          >
            Route
          </Link>
          <Link
            href={`/containers/${id}/demurrage`}
            className="px-4 py-2 text-sm font-medium border-b-2 border-kumo-focus text-kumo-default"
          >
            Demurrage
          </Link>
        </div>

        {container && (
          <>
            {/* LFD and Availability Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Last Free Day */}
              <Card>
                <CardHeader>
                  <CardTitle>Last Free Day (LFD)</CardTitle>
                </CardHeader>
                <CardContent>
                  {lfd ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-3xl font-semibold">{formatDate(lfd)}</p>
                          {daysUntilLfd !== null && (
                            <p className="text-lg text-kumo-secondary mt-1">
                              {daysUntilLfd < 0
                                ? `${Math.abs(daysUntilLfd)} days overdue`
                                : daysUntilLfd === 0
                                ? 'Due today!'
                                : `${daysUntilLfd} day${daysUntilLfd !== 1 ? 's' : ''} remaining`}
                            </p>
                          )}
                        </div>
                        {lfdStatus && (
                          <span
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${lfdStatus.color}`}
                          >
                            {lfdStatus.label}
                          </span>
                        )}
                      </div>

                      {/* Progress bar visualization */}
                      {daysUntilLfd !== null && daysUntilLfd >= 0 && (
                        <div className="mt-4">
                          <div className="h-3 bg-kumo-recessed rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                daysUntilLfd <= 2
                                  ? 'bg-red-500'
                                  : daysUntilLfd <= 5
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                              style={{
                                width: `${Math.max(0, Math.min(100, 100 - (daysUntilLfd / 10) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {perDiem && (
                        <p className="text-sm text-kumo-muted mt-2">
                          Demurrage rate after LFD: {currency} {perDiem}/day
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-kumo-muted">LFD not yet available</p>
                  )}
                </CardContent>
              </Card>

              {/* Availability */}
              <Card>
                <CardHeader>
                  <CardTitle>Availability</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{isAvailable ? '✅' : '⏳'}</span>
                      <div>
                        <p className="text-xl font-semibold">
                          {isAvailable ? 'Available for Pickup' : 'Not Yet Available'}
                        </p>
                        {availableSince && (
                          <p className="text-sm text-kumo-secondary">
                            Available since: {formatDate(availableSince)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Fees and Holds */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Fees */}
              <Card>
                <CardHeader>
                  <CardTitle>Fees at Terminal</CardTitle>
                </CardHeader>
                <CardContent>
                  {fees.length > 0 ? (
                    <div className="space-y-3">
                      {fees.map((fee: Fee, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-kumo-recessed"
                        >
                          <div>
                            <p className="font-medium">{fee.type || fee.description || 'Fee'}</p>
                            {(fee.start_date || fee.startDate) && (
                              <p className="text-sm text-kumo-muted">
                                From: {formatDate(fee.start_date || fee.startDate || '')}
                                {(fee.end_date || fee.endDate) &&
                                  ` to ${formatDate(fee.end_date || fee.endDate || '')}`}
                              </p>
                            )}
                          </div>
                          <span className="text-lg font-semibold">
                            {fee.currency || currency} {fee.amount || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-green-600">
                      <span className="text-2xl">✅</span>
                      <p>No fees currently</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Holds */}
              <Card>
                <CardHeader>
                  <CardTitle>Holds at Terminal</CardTitle>
                </CardHeader>
                <CardContent>
                  {holds.length > 0 ? (
                    <div className="space-y-3">
                      {holds.map((hold: Hold | string, index: number) => {
                        const holdData = typeof hold === 'string' ? { type: hold } : hold;
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">🚫</span>
                              <div>
                                <p className="font-medium text-red-800">
                                  {holdData.type || holdData.description || 'Hold'}
                                </p>
                                {holdData.status && (
                                  <p className="text-sm text-red-600">{holdData.status}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-green-600">
                      <span className="text-2xl">✅</span>
                      <p>No holds - clear for pickup</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* SDK Code for Demurrage */}
            <CodePanel title="SDK Code - Demurrage" code={demurrageCode} collapsible />

            {/* Rail Milestones */}
            <Card>
              <CardHeader>
                <CardTitle>Rail Milestones (North America)</CardTitle>
              </CardHeader>
              <CardContent>
                {railData || railCarrier || railLoaded || railArrived ? (
                  <div className="space-y-4">
                    {/* Rail carrier info */}
                    {(railCarrier || railDestination) && (
                      <div className="flex items-center gap-6 p-4 rounded-lg bg-kumo-recessed">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🚂</span>
                          <div>
                            <p className="text-sm text-kumo-secondary">Rail Carrier</p>
                            <p className="font-medium">
                              {railCarrier || '—'}
                              {railCarrierScac && ` (${railCarrierScac})`}
                            </p>
                          </div>
                        </div>
                        {railDestination && (
                          <div>
                            <p className="text-sm text-kumo-secondary">Destination</p>
                            <p className="font-medium">{railDestination}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rail milestones timeline */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div
                        className={`p-4 rounded-lg ${
                          railLoaded ? 'bg-green-50 border border-green-200' : 'bg-kumo-recessed'
                        }`}
                      >
                        <p className="text-xs text-kumo-secondary mb-1">POD Rail Loaded</p>
                        <p className={`text-sm font-medium ${railLoaded ? 'text-green-700' : ''}`}>
                          {railLoaded ? formatDate(railLoaded) : '—'}
                        </p>
                      </div>
                      <div
                        className={`p-4 rounded-lg ${
                          railDeparted ? 'bg-green-50 border border-green-200' : 'bg-kumo-recessed'
                        }`}
                      >
                        <p className="text-xs text-kumo-secondary mb-1">POD Rail Departed</p>
                        <p className={`text-sm font-medium ${railDeparted ? 'text-green-700' : ''}`}>
                          {railDeparted ? formatDate(railDeparted) : '—'}
                        </p>
                      </div>
                      <div
                        className={`p-4 rounded-lg ${
                          railArrived ? 'bg-green-50 border border-green-200' : 'bg-kumo-recessed'
                        }`}
                      >
                        <p className="text-xs text-kumo-secondary mb-1">IND Rail Arrived</p>
                        <p className={`text-sm font-medium ${railArrived ? 'text-green-700' : ''}`}>
                          {railArrived ? formatDate(railArrived) : '—'}
                        </p>
                      </div>
                      <div
                        className={`p-4 rounded-lg ${
                          railUnloaded ? 'bg-green-50 border border-green-200' : 'bg-kumo-recessed'
                        }`}
                      >
                        <p className="text-xs text-kumo-secondary mb-1">IND Rail Unloaded</p>
                        <p className={`text-sm font-medium ${railUnloaded ? 'text-green-700' : ''}`}>
                          {railUnloaded ? formatDate(railUnloaded) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-kumo-muted text-center py-4">
                    Rail milestones not available for this container.
                    <br />
                    <span className="text-sm">
                      (Only available for containers with inland rail delivery in North America)
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* SDK Code for Rail */}
            <CodePanel title="SDK Code - Rail Milestones" code={railCode} collapsible />

            {/* Raw Data */}
            {(demurrageData || railData) && (
              <Card>
                <CardHeader>
                  <CardTitle>Raw API Response</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="p-4 rounded-lg bg-kumo-recessed overflow-x-auto text-sm max-h-64">
                    <code>
                      {JSON.stringify({ demurrage: demurrageData, railMilestones: railData }, null, 2)}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
