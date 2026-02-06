import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button, StatusBadge } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

// Force dynamic rendering - we fetch live data from the API
export const dynamic = 'force-dynamic';

/**
 * Shipments List Page
 *
 * SDK Methods demonstrated:
 * - client.shipments.list(filters, options) - List and filter shipments
 */

interface Shipment {
  id: string;
  // From SDK mapped format
  billOfLading?: string;
  shippingLineScac?: string;
  customerName?: string;
  status?: string;
  // Nested ports structure from SDK mapper
  ports?: {
    portOfLading?: {
      name?: string;
      locode?: string;
      code?: string;
      countryCode?: string;
      etd?: string;
      atd?: string;
      timezone?: string;
    } | null;
    portOfDischarge?: {
      name?: string;
      locode?: string;
      code?: string;
      countryCode?: string;
      eta?: string;
      ata?: string;
      originalEta?: string;
      timezone?: string;
      terminal?: {
        id: string;
        name?: string;
        nickname?: string;
        firmsCode?: string;
      } | null;
    } | null;
    destination?: {
      locode?: string;
      name?: string;
      eta?: string;
      ata?: string;
      timezone?: string;
      terminal?: {
        id: string;
        name?: string;
        nickname?: string;
        firmsCode?: string;
      } | null;
    } | null;
  };
  // Vessel info from SDK mapper
  vesselAtPod?: {
    name?: string;
    imo?: string;
    voyageNumber?: string;
  };
  // Containers array from SDK mapper
  containers?: Array<{ id: string; number?: string }>;
}

async function getShipments() {
  if (!hasApiToken()) {
    return {
      shipments: [],
      error: 'T49_API_TOKEN environment variable is not set. Get your API key from https://app.terminal49.com/settings/api',
    };
  }

  const client = getClient();

  try {
    const result = await client.shipments.list({}, { pageSize: 50, format: 'mapped' });
    // SDK returns { items: [], links: ..., meta: ... } for mapped format
    const shipments = Array.isArray(result) ? result : result?.items || [];

    return { shipments };
  } catch (error) {
    console.error('Failed to fetch shipments:', error);
    return {
      shipments: [],
      error: error instanceof Error ? error.message : 'Failed to fetch shipments',
    };
  }
}

function getShipmentStatusColor(status: string): string {
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

export default async function ShipmentsPage() {
  const { shipments, error } = await getShipments();

  const listCode = `// List shipments with filters and pagination
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get all shipments
const shipments = await client.shipments.list(
  {}, // filters (optional)
  { pageSize: 50, format: 'mapped' }
);

// Filter by status
const activeShipments = await client.shipments.list(
  { status: 'in_transit' },
  { format: 'mapped' }
);

// Filter by port or carrier
const laShipments = await client.shipments.list(
  { pod: 'USLAX', carrier: 'MSCU' },
  { format: 'mapped' }
);

// Get shipments updated after a date
const recentShipments = await client.shipments.list(
  { updated_after: '2024-01-01T00:00:00Z' },
  { format: 'mapped' }
);`;

  // Calculate stats
  const inTransitCount = shipments.filter(
    (s: Shipment) => s.status === 'in_transit' || s.status === 'active'
  ).length;
  const arrivedCount = shipments.filter((s: Shipment) => s.status === 'arrived').length;
  const deliveredCount = shipments.filter((s: Shipment) => s.status === 'delivered').length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Shipments"
        description="View and manage your tracked shipments"
        actions={<Button href="/tracking-requests/new">+ Track New</Button>}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading shipments</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-kumo-default">{shipments.length}</p>
              <p className="text-sm text-kumo-muted">Total Shipments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-blue-600">{inTransitCount}</p>
              <p className="text-sm text-kumo-muted">In Transit</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-green-600">{arrivedCount}</p>
              <p className="text-sm text-kumo-muted">Arrived</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-emerald-600">{deliveredCount}</p>
              <p className="text-sm text-kumo-muted">Delivered</p>
            </CardContent>
          </Card>
        </div>

        {/* Shipments Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            {shipments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-kumo-line text-left">
                      <th className="pb-3 font-medium text-kumo-secondary">BOL / Booking</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Carrier</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Route</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Status</th>
                      <th className="pb-3 font-medium text-kumo-secondary">ETA</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Containers</th>
                      <th className="pb-3 font-medium text-kumo-secondary"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map((shipment: Shipment) => {
                      const bol = shipment.billOfLading;
                      const status = shipment.status || 'unknown';
                      // SDK returns shippingLineScac (just the SCAC code, no name)
                      const carrier = shipment.shippingLineScac || '—';
                      // SDK returns nested ports structure
                      const pol = shipment.ports?.portOfLading?.name || '—';
                      const pod = shipment.ports?.portOfDischarge?.name || '—';
                      const eta = shipment.ports?.portOfDischarge?.eta;
                      // SDK returns containers array
                      const containerCount = shipment.containers?.length || 0;

                      return (
                        <tr
                          key={shipment.id}
                          className="border-b border-kumo-line hover:bg-kumo-recessed transition-colors"
                        >
                          <td className="py-3">
                            <Link
                              href={`/shipments/${shipment.id}`}
                              className="font-mono text-kumo-link hover:underline"
                            >
                              {bol || shipment.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="py-3">
                            <span className="text-sm">{carrier}</span>
                          </td>
                          <td className="py-3">
                            <span className="text-sm">
                              {pol} → {pod}
                            </span>
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getShipmentStatusColor(
                                status
                              )}`}
                            >
                              {formatStatus(status)}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className="text-sm">
                              {eta ? formatDate(eta) : '—'}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className="text-sm">{containerCount}</span>
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/shipments/${shipment.id}`}
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
              <div className="text-center py-12">
                <p className="text-kumo-muted">No shipments found.</p>
                <Link
                  href="/tracking-requests/new"
                  className="text-kumo-link hover:underline"
                >
                  Start tracking a container
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SDK Code Panel */}
        <CodePanel title="SDK Code" code={listCode} collapsible />
      </div>
    </div>
  );
}
