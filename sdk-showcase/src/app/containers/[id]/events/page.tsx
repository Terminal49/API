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
 * Container Events Page
 *
 * SDK Methods demonstrated:
 * - client.containers.events(id) - Get transport events timeline
 * - client.containers.rawEvents(id) - Get raw carrier events
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

interface TransportEvent {
  id: string;
  event_type?: string;
  eventType?: string;
  event?: string;
  description?: string;
  location?: string;
  locationName?: string;
  location_name?: string;
  vessel?: string;
  vesselName?: string;
  vessel_name?: string;
  voyage?: string;
  voyageNumber?: string;
  voyage_number?: string;
  timestamp?: string;
  event_time?: string;
  eventTime?: string;
  actual_time?: string;
  actualTime?: string;
  created_at?: string;
  createdAt?: string;
  source?: string;
}

interface RawEvent {
  id: string;
  event?: string;
  description?: string;
  location?: string;
  timestamp?: string;
  raw_data?: any;
  rawData?: any;
  source?: string;
}

async function getContainerEvents(id: string) {
  if (!hasApiToken()) {
    return {
      container: null,
      events: [],
      rawEvents: [],
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  const client = getClient();

  try {
    // Fetch container details, transport events, and raw events in parallel
    const [container, eventsResult, rawEventsResult] = await Promise.all([
      client.containers.get(id, ['shipment'], { format: 'mapped' }),
      client.containers.events(id, { format: 'mapped' }).catch(() => []),
      client.containers.rawEvents(id, { format: 'mapped' }).catch(() => []),
    ]);

    const events = Array.isArray(eventsResult) ? eventsResult : eventsResult?.items || [];
    const rawEvents = Array.isArray(rawEventsResult) ? rawEventsResult : rawEventsResult?.items || [];

    return { container, events, rawEvents };
  } catch (error) {
    console.error('Failed to fetch container events:', error);
    return {
      container: null,
      events: [],
      rawEvents: [],
      error: error instanceof Error ? error.message : 'Failed to fetch container events',
    };
  }
}

function formatEventType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getEventIcon(type: string): string {
  const eventType = type?.toLowerCase() || '';
  if (eventType.includes('load')) return '📦';
  if (eventType.includes('depart')) return '🚢';
  if (eventType.includes('arrive')) return '⚓';
  if (eventType.includes('discharge')) return '🏗️';
  if (eventType.includes('gate') && eventType.includes('out')) return '🚚';
  if (eventType.includes('gate') && eventType.includes('in')) return '🚛';
  if (eventType.includes('rail')) return '🚂';
  if (eventType.includes('empty')) return '📭';
  if (eventType.includes('available')) return '✅';
  return '📍';
}

export default async function ContainerEventsPage({ params }: PageProps) {
  const { id } = await params;
  const { container, events, rawEvents, error } = await getContainerEvents(id);

  if (!container && !error) {
    notFound();
  }

  const number = container?.number;

  const eventsCode = `// Get container transport events
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get standardized transport events timeline
const events = await client.containers.events('${id}', {
  format: 'mapped'
});

// Transport events include:
// - event_type: vessel_loaded, vessel_departed, vessel_arrived,
//               vessel_discharged, gate_out, empty_returned, etc.
// - timestamp: When the event occurred
// - location: Port or terminal where the event occurred
// - vessel/voyage: Ship information if applicable

// Events are normalized across all carriers into a consistent format`;

  const rawEventsCode = `// Get raw carrier events (unprocessed)
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get raw events directly from the carrier
const rawEvents = await client.containers.rawEvents('${id}', {
  format: 'mapped'
});

// Raw events contain the original carrier data before normalization.
// Useful for:
// - Debugging discrepancies
// - Accessing carrier-specific fields
// - Historical audit trails`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Events: ${number || id.slice(0, 8)}`}
        description="Transport events timeline and raw carrier events"
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
            <p className="font-medium">Error loading events</p>
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
            className="px-4 py-2 text-sm font-medium border-b-2 border-kumo-focus text-kumo-default"
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
            className="px-4 py-2 text-sm text-kumo-secondary hover:text-kumo-default"
          >
            Demurrage
          </Link>
        </div>

        {container && (
          <>
            {/* Transport Events Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Transport Events ({events.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length > 0 ? (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-kumo-line" />

                    <div className="space-y-4">
                      {events.map((event: TransportEvent, index: number) => {
                        const eventType = event.event_type || event.eventType || event.event || 'unknown';
                        const eventTime = event.timestamp || event.event_time || event.eventTime || event.actual_time || event.actualTime || event.created_at || event.createdAt;
                        const location = event.location || event.locationName || event.location_name;
                        const vessel = event.vessel || event.vesselName || event.vessel_name;
                        const voyage = event.voyage || event.voyageNumber || event.voyage_number;

                        return (
                          <div key={event.id || index} className="relative pl-14">
                            {/* Timeline icon */}
                            <div className={`absolute left-3 w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                              index === 0 ? 'bg-blue-100' : 'bg-kumo-recessed'
                            }`}>
                              {getEventIcon(eventType)}
                            </div>

                            <div className="p-4 rounded-lg bg-kumo-recessed">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{formatEventType(eventType)}</p>
                                  {event.description && (
                                    <p className="text-sm text-kumo-secondary mt-1">{event.description}</p>
                                  )}
                                  <div className="flex flex-wrap gap-3 mt-2">
                                    {location && (
                                      <span className="text-sm text-kumo-muted">📍 {location}</span>
                                    )}
                                    {(vessel || voyage) && (
                                      <span className="text-sm text-kumo-muted">
                                        🚢 {vessel} {voyage && `/ ${voyage}`}
                                      </span>
                                    )}
                                    {event.source && (
                                      <span className="text-xs px-2 py-0.5 rounded bg-kumo-base text-kumo-muted">
                                        {event.source}
                                      </span>
                                    )}
                                  </div>
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
                  <p className="text-kumo-muted text-center py-8">No transport events recorded yet</p>
                )}
              </CardContent>
            </Card>

            {/* SDK Code for Transport Events */}
            <CodePanel title="SDK Code - Transport Events" code={eventsCode} collapsible />

            {/* Raw Events */}
            <Card>
              <CardHeader>
                <CardTitle>Raw Carrier Events ({rawEvents.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {rawEvents.length > 0 ? (
                  <div className="space-y-3">
                    {rawEvents.map((event: RawEvent, index: number) => (
                      <div
                        key={event.id || index}
                        className="p-4 rounded-lg bg-kumo-recessed border border-kumo-line"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-mono text-sm font-medium">
                              {event.event || 'Raw Event'}
                            </p>
                            {event.description && (
                              <p className="text-sm text-kumo-secondary mt-1">{event.description}</p>
                            )}
                            {event.location && (
                              <p className="text-sm text-kumo-muted mt-1">📍 {event.location}</p>
                            )}
                          </div>
                          <span className="text-sm text-kumo-muted whitespace-nowrap ml-4">
                            {event.timestamp ? formatDate(event.timestamp) : '—'}
                          </span>
                        </div>
                        {(event.raw_data || event.rawData) && (
                          <details className="mt-3">
                            <summary className="text-xs text-kumo-link cursor-pointer">
                              View raw data
                            </summary>
                            <pre className="mt-2 p-2 rounded bg-kumo-base text-xs overflow-x-auto">
                              <code>{JSON.stringify(event.raw_data || event.rawData, null, 2)}</code>
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-kumo-muted text-center py-8">No raw events available</p>
                )}
              </CardContent>
            </Card>

            {/* SDK Code for Raw Events */}
            <CodePanel title="SDK Code - Raw Events" code={rawEventsCode} collapsible />
          </>
        )}
      </div>
    </div>
  );
}
