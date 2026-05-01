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
 * Tracking Request Detail Page
 *
 * SDK Methods demonstrated:
 * - client.trackingRequests.get(id) - Get tracking request details
 * - client.trackingRequests.update(id, attributes) - Update tracking request
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTrackingRequest(id: string) {
  if (!hasApiToken()) {
    return {
      trackingRequest: null,
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  const client = getClient();

  try {
    const result = await client.trackingRequests.get(id, { format: 'mapped' });
    return { trackingRequest: result };
  } catch (error) {
    console.error('Failed to fetch tracking request:', error);
    return {
      trackingRequest: null,
      error: error instanceof Error ? error.message : 'Failed to fetch tracking request',
    };
  }
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function TrackingRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { trackingRequest, error } = await getTrackingRequest(id);

  if (!trackingRequest && !error) {
    notFound();
  }

  const detailCode = `// Get tracking request details
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

const trackingRequest = await client.trackingRequests.get('${id}', {
  format: 'mapped'
});

// Update tracking request (e.g., reference numbers)
await client.trackingRequests.update('${id}', {
  ref_numbers: ['PO-123456', 'INV-789'],
  tags: ['priority', 'customer-abc']
});`;

  // Extract fields with fallbacks for different formats
  const number = trackingRequest?.request_number || trackingRequest?.requestNumber;
  const type = trackingRequest?.request_type || trackingRequest?.requestType || 'unknown';
  const status = trackingRequest?.request_status || trackingRequest?.requestStatus || 'unknown';
  const scac = trackingRequest?.scac;
  const carrierName = trackingRequest?.shipping_line?.name || trackingRequest?.shippingLine?.name;
  const shipmentId = trackingRequest?.shipment?.id;
  const createdAt = trackingRequest?.created_at || trackingRequest?.createdAt;
  const updatedAt = trackingRequest?.updated_at || trackingRequest?.updatedAt;
  const failedReason = trackingRequest?.failed_reason || trackingRequest?.failedReason;
  const refNumbers = trackingRequest?.ref_numbers || trackingRequest?.refNumbers || [];
  const tags = trackingRequest?.tags || [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Tracking Request: ${number || id}`}
        description="View tracking request details and associated shipment"
        actions={
          <div className="flex gap-2">
            {shipmentId && (
              <Button href={`/shipments/${shipmentId}`}>View Shipment →</Button>
            )}
            <Button href="/tracking-requests" variant="secondary">
              ← Back to List
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading tracking request</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {trackingRequest && (
          <>
            {/* Status Banner */}
            {status === 'failed' && failedReason && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
                <p className="font-medium">Tracking Request Failed</p>
                <p className="text-sm mt-1">{failedReason}</p>
              </div>
            )}

            {/* Main Info */}
            <Card>
              <CardHeader>
                <CardTitle>Request Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Tracking Number</p>
                    <p className="font-mono text-lg">{number || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Request Type</p>
                    <p className="capitalize">{type.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Status</p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
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
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Carrier</p>
                    <p>{carrierName || scac || '—'}</p>
                    {scac && carrierName && (
                      <p className="text-sm text-kumo-muted">SCAC: {scac}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Created</p>
                    <p>{createdAt ? formatDate(createdAt) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Last Updated</p>
                    <p>{updatedAt ? formatDate(updatedAt) : '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shipment Link */}
            {shipmentId && (
              <Card>
                <CardHeader>
                  <CardTitle>Associated Shipment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-kumo-recessed">
                    <div>
                      <p className="font-medium">Shipment</p>
                      <p className="text-sm text-kumo-muted font-mono">{shipmentId}</p>
                    </div>
                    <Link
                      href={`/shipments/${shipmentId}`}
                      className="text-kumo-link hover:underline"
                    >
                      View Shipment →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

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
                <pre className="p-4 rounded-lg bg-kumo-recessed overflow-x-auto text-sm">
                  <code>{JSON.stringify(trackingRequest, null, 2)}</code>
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
