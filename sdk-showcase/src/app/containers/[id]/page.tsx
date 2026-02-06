import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button, StatusBadge } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RefreshButton } from './refresh-button';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Container Detail Page
 *
 * SDK Methods demonstrated:
 * - client.containers.get(id) - Get container details
 * - client.containers.events(id) - Get container events timeline
 * - client.containers.route(id) - Get container route info
 * - client.containers.rawEvents(id) - Get raw carrier events
 * - client.containers.refresh(id) - Force refresh container data
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ContainerEvent {
  id: string;
  // SDK mapped format uses camelCase - 'event' field contains the event type
  event?: string;
  eventTime?: string;
  description?: string;
  // SDK maps location as nested object
  location?: {
    id: string;
    name?: string;
    locode?: string;
  };
  // SDK maps terminal as nested object
  terminal?: {
    id: string;
    name?: string;
    nickname?: string;
    firmsCode?: string;
  };
  vessel?: string;
  voyage?: string;
  createdAt?: string;
}

async function getContainerData(id: string) {
  if (!hasApiToken()) {
    return {
      container: null,
      events: [],
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  const client = getClient();

  try {
    // Fetch container details and events in parallel
    const [container, eventsResult] = await Promise.all([
      client.containers.get(id, ['shipment'], { format: 'mapped' }),
      client.containers.events(id, { format: 'mapped' }).catch(() => []),
    ]);

    const events = Array.isArray(eventsResult) ? eventsResult : eventsResult?.items || [];

    return { container, events };
  } catch (error) {
    console.error('Failed to fetch container:', error);
    return {
      container: null,
      events: [],
      error: error instanceof Error ? error.message : 'Failed to fetch container',
    };
  }
}

function formatEventType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function ContainerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { container, events, error } = await getContainerData(id);

  if (!container && !error) {
    notFound();
  }

  const detailCode = `// Get container details and events
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get container details
const container = await client.containers.get('${id}', {
  format: 'mapped'
});

// Get container events timeline
const events = await client.containers.events('${id}', {
  format: 'mapped'
});

// Get container route information
const route = await client.containers.route('${id}');

// Get raw carrier events (unprocessed)
const rawEvents = await client.containers.rawEvents('${id}');

// Force refresh container data from carrier
await client.containers.refresh('${id}');`;

  // Extract container fields using SDK mapped format (nested structures)
  const number = container?.number;
  const status = container?.status || 'unknown';
  // Equipment info from SDK nested structure
  const equipmentType = container?.equipment?.type;
  const equipmentLength = container?.equipment?.length;
  const equipmentHeight = container?.equipment?.height;
  const weight = container?.equipment?.weightLbs;
  // SDK returns shippingLineScac (string only, no name object)
  const carrierScac = container?.shippingLineScac;
  const carrierName = carrierScac; // SDK doesn't include carrier name in mapped format
  // Shipment relation
  const shipmentId = container?.shipment?.id;
  // Terminal info from SDK nested structure
  const terminal = container?.terminals?.podTerminal?.name;
  const terminalCode = container?.terminals?.podTerminal?.firmsCode;
  // Demurrage info from SDK nested structure
  const lfd = container?.demurrage?.pickupLfd;
  const availableDate = container?.demurrage?.pickupAppointmentAt;
  const holdsInfo = container?.demurrage?.holds || [];
  const fees = container?.demurrage?.fees || [];
  // Other fields
  const seal = container?.sealNumber;

  // Timestamps from SDK mapped format
  const polLoaded = container?.polLoadedAt;
  const podDischarged = container?.podDischargedAt;
  const podFullOut = container?.podFullOutAt;
  const emptyReturned = container?.emptyReturnedAt;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Container: ${number || id.slice(0, 8)}`}
        description="View container details, events, and tracking history"
        actions={
          <div className="flex gap-2">
            <RefreshButton containerId={id} />
            {shipmentId && (
              <Button href={`/shipments/${shipmentId}`} variant="secondary">
                View Shipment
              </Button>
            )}
            <Button href="/containers" variant="secondary">
              ← Back to List
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading container</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {container && (
          <>
            {/* Status Card */}
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Current Status</p>
                    <StatusBadge status={status} size="md" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-kumo-secondary mb-1">Container Number</p>
                    <p className="text-2xl font-mono font-semibold">{number}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Main Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Container Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Equipment Type</p>
                      <p>{equipmentType || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Carrier</p>
                      <p>{carrierName || '—'}</p>
                      {carrierScac && <p className="text-sm text-kumo-muted">SCAC: {carrierScac}</p>}
                    </div>
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Weight</p>
                      <p>{weight ? `${weight} kg` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Seal Number</p>
                      <p className="font-mono">{seal || '—'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Terminal Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Terminal</p>
                      <p>{terminal || '—'}</p>
                      {terminalCode && <p className="text-sm text-kumo-muted">FIRMS: {terminalCode}</p>}
                    </div>
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Last Free Day (LFD)</p>
                      <p className={lfd ? 'font-medium' : ''}>{lfd ? formatDate(lfd) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Available Date</p>
                      <p>{availableDate ? formatDate(availableDate) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-kumo-secondary mb-1">Holds</p>
                      {holdsInfo.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {holdsInfo.map((hold: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">
                              {hold}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-green-600">None</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Key Timestamps */}
            <Card>
              <CardHeader>
                <CardTitle>Key Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-kumo-recessed">
                    <p className="text-xs text-kumo-secondary mb-1">Loaded at Origin</p>
                    <p className="text-sm font-medium">{polLoaded ? formatDate(polLoaded) : '—'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-kumo-recessed">
                    <p className="text-xs text-kumo-secondary mb-1">Discharged at POD</p>
                    <p className="text-sm font-medium">{podDischarged ? formatDate(podDischarged) : '—'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-kumo-recessed">
                    <p className="text-xs text-kumo-secondary mb-1">Full Out</p>
                    <p className="text-sm font-medium">{podFullOut ? formatDate(podFullOut) : '—'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-kumo-recessed">
                    <p className="text-xs text-kumo-secondary mb-1">Empty Returned</p>
                    <p className="text-sm font-medium">{emptyReturned ? formatDate(emptyReturned) : '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Events Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Events Timeline ({events.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length > 0 ? (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-kumo-line" />

                    <div className="space-y-4">
                      {events.map((event: ContainerEvent, index: number) => {
                        // SDK mapped format uses 'event' field for event type
                        const eventType = event.event || 'unknown';
                        const eventTime = event.eventTime || event.createdAt;

                        return (
                          <div key={event.id || index} className="relative pl-10">
                            {/* Timeline dot */}
                            <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-white ${
                              index === 0 ? 'bg-blue-500' : 'bg-kumo-muted'
                            }`} />

                            <div className="p-4 rounded-lg bg-kumo-recessed">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{formatEventType(eventType)}</p>
                                  {event.description && (
                                    <p className="text-sm text-kumo-secondary mt-1">{event.description}</p>
                                  )}
                                  {event.location && (
                                    <p className="text-sm text-kumo-muted mt-1">
                                      📍 {event.location.name || event.location.locode || 'Unknown location'}
                                    </p>
                                  )}
                                  {event.terminal && (
                                    <p className="text-sm text-kumo-muted mt-1">🏭 {event.terminal.name}</p>
                                  )}
                                  {(event.vessel || event.voyage) && (
                                    <p className="text-sm text-kumo-muted mt-1">
                                      🚢 {event.vessel} {event.voyage && `/ ${event.voyage}`}
                                    </p>
                                  )}
                                </div>
                                <span className="text-sm text-kumo-muted whitespace-nowrap ml-4">
                                  {eventTime ? formatDate(eventTime) : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-kumo-muted text-center py-8">No events recorded yet</p>
                )}
              </CardContent>
            </Card>

            {/* Fees (if any) */}
            {fees.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Fees & Charges</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {fees.map((fee: any, index: number) => (
                      <div key={index} className="flex justify-between p-3 rounded-lg bg-kumo-recessed">
                        <span>{fee.type || fee.description || 'Fee'}</span>
                        <span className="font-medium">${fee.amount || '—'}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Raw Data */}
            <Card>
              <CardHeader>
                <CardTitle>Raw API Response</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="p-4 rounded-lg bg-kumo-recessed overflow-x-auto text-sm max-h-96">
                  <code>{JSON.stringify({ container, events }, null, 2)}</code>
                </pre>
              </CardContent>
            </Card>
          </>
        )}

        {/* SDK Code Panel */}
        <CodePanel title="SDK Code" code={detailCode} collapsible />
      </div>
    </div>
  );
}
