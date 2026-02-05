import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button, StatusBadge } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

// Force dynamic rendering - we fetch live data from the API
export const dynamic = 'force-dynamic';

/**
 * Tracking Requests List Page
 *
 * SDK Methods demonstrated:
 * - client.trackingRequests.list(filters, options) - List and filter tracking requests
 */

interface TrackingRequest {
  id: string;
  request_number?: string;
  requestNumber?: string;
  request_type?: string;
  requestType?: string;
  request_status?: string;
  requestStatus?: string;
  scac?: string;
  shipping_line?: { name?: string; scac?: string };
  shippingLine?: { name?: string; scac?: string };
  shipment?: { id?: string };
  created_at?: string;
  createdAt?: string;
  failed_reason?: string;
  failedReason?: string;
}

async function getTrackingRequests() {
  if (!hasApiToken()) {
    return {
      trackingRequests: [],
      error: 'T49_API_TOKEN environment variable is not set. Get your API key from https://app.terminal49.com/settings/api',
    };
  }

  const client = getClient();

  try {
    const result = await client.trackingRequests.list({}, { pageSize: 50, format: 'mapped' });
    // SDK returns { items: [], links: ..., meta: ... } for mapped format
    const trackingRequests = Array.isArray(result) ? result : result?.items || [];

    return { trackingRequests };
  } catch (error) {
    console.error('Failed to fetch tracking requests:', error);
    return {
      trackingRequests: [],
      error: error instanceof Error ? error.message : 'Failed to fetch tracking requests',
    };
  }
}

function getStatusColor(status: string): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'created':
    case 'succeeded':
      return 'success';
    case 'pending':
    case 'processing':
      return 'warning';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function TrackingRequestsPage() {
  const { trackingRequests, error } = await getTrackingRequests();

  const listCode = `// List tracking requests with filters and pagination
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get all tracking requests
const trackingRequests = await client.trackingRequests.list(
  {}, // filters (optional)
  { pageSize: 50, format: 'mapped' }
);

// Filter by status
const pendingRequests = await client.trackingRequests.list(
  { status: 'pending' },
  { format: 'mapped' }
);

// Filter by request type
const containerRequests = await client.trackingRequests.list(
  { request_type: 'container' },
  { format: 'mapped' }
);`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Tracking Requests"
        description="View and manage your container tracking requests"
        actions={<Button href="/tracking-requests/new">+ New Request</Button>}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading tracking requests</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-kumo-default">
                {trackingRequests.length}
              </p>
              <p className="text-sm text-kumo-muted">Total Requests</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-green-600">
                {
                  trackingRequests.filter(
                    (r: TrackingRequest) =>
                      r.request_status === 'succeeded' || r.requestStatus === 'succeeded'
                  ).length
                }
              </p>
              <p className="text-sm text-kumo-muted">Succeeded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-yellow-600">
                {
                  trackingRequests.filter(
                    (r: TrackingRequest) =>
                      r.request_status === 'pending' || r.requestStatus === 'pending'
                  ).length
                }
              </p>
              <p className="text-sm text-kumo-muted">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-red-600">
                {
                  trackingRequests.filter(
                    (r: TrackingRequest) =>
                      r.request_status === 'failed' || r.requestStatus === 'failed'
                  ).length
                }
              </p>
              <p className="text-sm text-kumo-muted">Failed</p>
            </CardContent>
          </Card>
        </div>

        {/* Tracking Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Tracking Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {trackingRequests.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-kumo-line text-left">
                      <th className="pb-3 font-medium text-kumo-secondary">Number</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Type</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Carrier</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Status</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Shipment</th>
                      <th className="pb-3 font-medium text-kumo-secondary">Created</th>
                      <th className="pb-3 font-medium text-kumo-secondary"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackingRequests.map((request: TrackingRequest) => {
                      const number = request.request_number || request.requestNumber;
                      const type = request.request_type || request.requestType || 'unknown';
                      const status = request.request_status || request.requestStatus || 'unknown';
                      const carrier =
                        request.shipping_line?.name ||
                        request.shippingLine?.name ||
                        request.scac ||
                        '—';
                      const shipmentId = request.shipment?.id;
                      const createdAt = request.created_at || request.createdAt;
                      const failedReason = request.failed_reason || request.failedReason;

                      return (
                        <tr
                          key={request.id}
                          className="border-b border-kumo-line hover:bg-kumo-recessed transition-colors"
                        >
                          <td className="py-3">
                            <Link
                              href={`/tracking-requests/${request.id}`}
                              className="font-mono text-kumo-link hover:underline"
                            >
                              {number}
                            </Link>
                          </td>
                          <td className="py-3">
                            <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                          </td>
                          <td className="py-3">
                            <span className="text-sm">{carrier}</span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  status === 'succeeded'
                                    ? 'bg-green-100 text-green-800'
                                    : status === 'pending' || status === 'processing'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : status === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {formatStatus(status)}
                              </span>
                              {failedReason && (
                                <span
                                  className="text-xs text-red-600 truncate max-w-[150px]"
                                  title={failedReason}
                                >
                                  {failedReason}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3">
                            {shipmentId ? (
                              <Link
                                href={`/shipments/${shipmentId}`}
                                className="text-kumo-link hover:underline text-sm"
                              >
                                View
                              </Link>
                            ) : (
                              <span className="text-kumo-muted text-sm">—</span>
                            )}
                          </td>
                          <td className="py-3">
                            <span className="text-sm text-kumo-secondary">
                              {createdAt ? formatDate(createdAt) : '—'}
                            </span>
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/tracking-requests/${request.id}`}
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
                <p className="text-kumo-muted">No tracking requests found.</p>
                <Link href="/tracking-requests/new" className="text-kumo-link hover:underline">
                  Create your first tracking request
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
