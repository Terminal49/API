import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button, StatusBadge } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StopResumeButton } from './stop-resume-button';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Shipment Detail Page
 *
 * SDK Methods demonstrated:
 * - client.shipments.get(id, includeContainers) - Get shipment with optional containers
 * - client.shipments.update(id, attributes) - Update shipment metadata
 * - client.shipments.stopTracking(id) - Stop tracking a shipment
 * - client.shipments.resumeTracking(id) - Resume tracking a shipment
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Container {
  id: string;
  number?: string;
  // SDK mapped format uses nested structure
  status?: string;
  equipment?: {
    type?: string;
    length?: number;
    height?: number;
    weightLbs?: number;
  };
  terminals?: {
    podTerminal?: {
      id: string;
      name?: string;
      nickname?: string;
      firmsCode?: string;
    } | null;
    destinationTerminal?: {
      id: string;
      name?: string;
      nickname?: string;
      firmsCode?: string;
    } | null;
  };
  demurrage?: {
    pickupLfd?: string;
    pickupAppointmentAt?: string;
    fees?: any[];
    holds?: any[];
  };
}

async function getShipment(id: string) {
  if (!hasApiToken()) {
    return {
      shipment: null,
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  const client = getClient();

  try {
    // Get shipment with containers included
    const result = await client.shipments.get(id, true, { format: 'mapped' });
    return { shipment: result };
  } catch (error) {
    console.error('Failed to fetch shipment:', error);
    return {
      shipment: null,
      error: error instanceof Error ? error.message : 'Failed to fetch shipment',
    };
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'in_transit':
    case 'active':
      return 'bg-blue-100 text-blue-800';
    case 'arrived':
      return 'bg-green-100 text-green-800';
    case 'delivered':
      return 'bg-emerald-100 text-emerald-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function ShipmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { shipment, error } = await getShipment(id);

  if (!shipment && !error) {
    notFound();
  }

  const detailCode = `// Get shipment with containers
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get shipment details with containers included
const shipment = await client.shipments.get('${id}', true, {
  format: 'mapped'
});

// Update shipment metadata
await client.shipments.update('${id}', {
  ref_numbers: ['PO-123456', 'INV-789'],
  tags: ['priority', 'customer-abc']
});

// Stop tracking (if shipment is complete or no longer needed)
await client.shipments.stopTracking('${id}');

// Resume tracking (if needed again)
await client.shipments.resumeTracking('${id}');`;

  // Extract shipment fields from SDK mapped format
  const bol = shipment?.billOfLading;
  const status = shipment?.status || 'unknown';
  // SDK returns shippingLineScac (SCAC code only, not a name)
  const carrierScac = shipment?.shippingLineScac;
  const carrierName = carrierScac; // SDK doesn't include carrier name in mapped format
  // Vessel info from SDK mapper
  const vesselName = shipment?.vesselAtPod?.name;
  const voyageNumber = shipment?.vesselAtPod?.voyageNumber;
  // Port info from SDK nested ports structure
  const polName = shipment?.ports?.portOfLading?.name;
  const polCode = shipment?.ports?.portOfLading?.locode;
  const podName = shipment?.ports?.portOfDischarge?.name;
  const podCode = shipment?.ports?.portOfDischarge?.locode;
  const etd = shipment?.ports?.portOfLading?.etd;
  const atd = shipment?.ports?.portOfLading?.atd;
  const eta = shipment?.ports?.portOfDischarge?.eta;
  const ata = shipment?.ports?.portOfDischarge?.ata;
  // Tracking info from SDK mapper
  const trackingStatus = shipment?.tracking?.lineTrackingStoppedAt ? 'stopped' : 'active';
  const containers = shipment?.containers || [];
  const refNumbers = shipment?.refNumbers || [];
  const tags = shipment?.tags || [];
  const customer = shipment?.customerName;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Shipment: ${bol || id.slice(0, 8)}`}
        description="View shipment details, route, and containers"
        actions={
          <div className="flex gap-2">
            <StopResumeButton shipmentId={id} currentStatus={trackingStatus} />
            <Button href="/shipments" variant="secondary">
              ← Back to List
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading shipment</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {shipment && (
          <>
            {/* Tracking Status Banner */}
            {trackingStatus === 'stopped' && (
              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
                <p className="font-medium">Tracking Stopped</p>
                <p className="text-sm mt-1">
                  This shipment is no longer being tracked. Click "Resume Tracking" to restart.
                </p>
              </div>
            )}

            {/* Main Info */}
            <Card>
              <CardHeader>
                <CardTitle>Shipment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Bill of Lading</p>
                    <p className="font-mono">{bol || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Shipment ID</p>
                    <p className="font-mono">{id.slice(0, 12)}...</p>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Status</p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        status
                      )}`}
                    >
                      {formatStatus(status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Tracking</p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        trackingStatus === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {trackingStatus === 'active' ? 'Active' : 'Stopped'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Carrier</p>
                    <p>{carrierName || '—'}</p>
                    {carrierScac && <p className="text-sm text-kumo-muted">SCAC: {carrierScac}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Vessel</p>
                    <p>{vesselName || '—'}</p>
                    {voyageNumber && <p className="text-sm text-kumo-muted">Voyage: {voyageNumber}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Customer</p>
                    <p>{customer || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Containers</p>
                    <p>{containers.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Route Info */}
            <Card>
              <CardHeader>
                <CardTitle>Route</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-stretch gap-4">
                  {/* Origin */}
                  <div className="flex-1 p-4 rounded-lg bg-kumo-recessed">
                    <p className="text-sm text-kumo-secondary mb-1">Port of Loading</p>
                    <p className="font-medium">{polName || '—'}</p>
                    {polCode && <p className="text-sm text-kumo-muted">{polCode}</p>}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-kumo-secondary">ETD:</span>
                        <span>{etd ? formatDate(etd) : '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-kumo-secondary">ATD:</span>
                        <span>{atd ? formatDate(atd) : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center">
                    <div className="w-16 h-0.5 bg-kumo-line relative">
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-l-8 border-transparent border-l-kumo-line" />
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="flex-1 p-4 rounded-lg bg-kumo-recessed">
                    <p className="text-sm text-kumo-secondary mb-1">Port of Discharge</p>
                    <p className="font-medium">{podName || '—'}</p>
                    {podCode && <p className="text-sm text-kumo-muted">{podCode}</p>}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-kumo-secondary">ETA:</span>
                        <span>{eta ? formatDate(eta) : '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-kumo-secondary">ATA:</span>
                        <span>{ata ? formatDate(ata) : '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Containers */}
            <Card>
              <CardHeader>
                <CardTitle>Containers ({containers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {containers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-kumo-line text-left">
                          <th className="pb-3 font-medium text-kumo-secondary">Number</th>
                          <th className="pb-3 font-medium text-kumo-secondary">Equipment</th>
                          <th className="pb-3 font-medium text-kumo-secondary">Status</th>
                          <th className="pb-3 font-medium text-kumo-secondary">Terminal</th>
                          <th className="pb-3 font-medium text-kumo-secondary">LFD</th>
                          <th className="pb-3 font-medium text-kumo-secondary"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {containers.map((container: Container) => {
                          // SDK mapped format uses nested structures
                          const containerStatus = container.status || 'unknown';
                          const lfd = container.demurrage?.pickupLfd;
                          const terminal = container.terminals?.podTerminal?.name || '—';
                          const equipment = container.equipment?.type || '—';

                          return (
                            <tr
                              key={container.id}
                              className="border-b border-kumo-line hover:bg-kumo-recessed transition-colors"
                            >
                              <td className="py-3">
                                <Link
                                  href={`/containers/${container.id}`}
                                  className="font-mono text-kumo-link hover:underline"
                                >
                                  {container.number}
                                </Link>
                              </td>
                              <td className="py-3 text-sm">{equipment}</td>
                              <td className="py-3">
                                <StatusBadge status={containerStatus} size="sm" />
                              </td>
                              <td className="py-3 text-sm">{terminal}</td>
                              <td className="py-3 text-sm">{lfd ? formatDate(lfd) : '—'}</td>
                              <td className="py-3">
                                <Link
                                  href={`/containers/${container.id}`}
                                  className="text-sm text-kumo-link hover:underline"
                                >
                                  Details →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-kumo-muted text-center py-8">No containers found</p>
                )}
              </CardContent>
            </Card>

            {/* Reference Numbers & Tags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Reference Numbers</CardTitle>
                </CardHeader>
                <CardContent>
                  {refNumbers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {refNumbers.map((ref: string, index: number) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full bg-kumo-recessed text-sm"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-kumo-muted">No reference numbers</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag: string, index: number) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-kumo-muted">No tags</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Raw Data */}
            <Card>
              <CardHeader>
                <CardTitle>Raw API Response</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="p-4 rounded-lg bg-kumo-recessed overflow-x-auto text-sm max-h-96">
                  <code>{JSON.stringify(shipment, null, 2)}</code>
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
