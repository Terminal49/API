import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Shipping Lines Browser Page
 *
 * SDK Methods demonstrated:
 * - client.shippingLines.list() - List all supported shipping lines
 */

interface ShippingLine {
  id: string;
  name?: string;
  scac?: string;
  short_name?: string;
  shortName?: string;
  tracking_supported?: boolean;
  trackingSupported?: boolean;
  bol_tracking_supported?: boolean;
  bolTrackingSupported?: boolean;
  booking_tracking_supported?: boolean;
  bookingTrackingSupported?: boolean;
  container_tracking_supported?: boolean;
  containerTrackingSupported?: boolean;
  mbol_tracking_supported?: boolean;
  mbolTrackingSupported?: boolean;
}

async function getShippingLines() {
  if (!hasApiToken()) {
    return {
      shippingLines: [],
      error: 'T49_API_TOKEN environment variable is not set. Get your API key from https://app.terminal49.com/settings/api',
    };
  }

  const client = getClient();

  try {
    const result = await client.shippingLines.list(undefined, { format: 'mapped' });
    const shippingLines = Array.isArray(result) ? result : result?.items || [];

    return { shippingLines };
  } catch (error) {
    console.error('Failed to fetch shipping lines:', error);
    return {
      shippingLines: [],
      error: error instanceof Error ? error.message : 'Failed to fetch shipping lines',
    };
  }
}

export default async function ShippingLinesPage() {
  const { shippingLines, error } = await getShippingLines();

  const listCode = `// List all supported shipping lines
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get all shipping lines
const shippingLines = await client.shippingLines.list({
  format: 'mapped'
});

// Each shipping line includes:
// - name: Full carrier name (e.g., "Maersk Line")
// - scac: Standard Carrier Alpha Code (e.g., "MAEU")
// - tracking_supported: Whether tracking is available
// - bol_tracking_supported: Bill of Lading tracking
// - booking_tracking_supported: Booking number tracking
// - container_tracking_supported: Container number tracking`;

  // Count carriers with different tracking capabilities
  const withBolTracking = shippingLines.filter(
    (s: ShippingLine) => s.bol_tracking_supported || s.bolTrackingSupported
  ).length;
  const withBookingTracking = shippingLines.filter(
    (s: ShippingLine) => s.booking_tracking_supported || s.bookingTrackingSupported
  ).length;
  const withContainerTracking = shippingLines.filter(
    (s: ShippingLine) => s.container_tracking_supported || s.containerTrackingSupported
  ).length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Shipping Lines"
        description="Browse all supported carriers and their tracking capabilities"
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading shipping lines</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-kumo-default">{shippingLines.length}</p>
              <p className="text-sm text-kumo-muted">Total Carriers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-blue-600">{withContainerTracking}</p>
              <p className="text-sm text-kumo-muted">Container Tracking</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-green-600">{withBolTracking}</p>
              <p className="text-sm text-kumo-muted">BOL Tracking</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-purple-600">{withBookingTracking}</p>
              <p className="text-sm text-kumo-muted">Booking Tracking</p>
            </CardContent>
          </Card>
        </div>

        {/* Shipping Lines Grid */}
        <Card>
          <CardHeader>
            <CardTitle>All Supported Carriers</CardTitle>
          </CardHeader>
          <CardContent>
            {shippingLines.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shippingLines
                  .sort((a: ShippingLine, b: ShippingLine) =>
                    (a.name || '').localeCompare(b.name || '')
                  )
                  .map((line: ShippingLine) => {
                    const name = line.name;
                    const scac = line.scac;
                    const shortName = line.short_name || line.shortName;
                    const bolSupported = line.bol_tracking_supported || line.bolTrackingSupported;
                    const bookingSupported = line.booking_tracking_supported || line.bookingTrackingSupported;
                    const containerSupported = line.container_tracking_supported || line.containerTrackingSupported;
                    const mbolSupported = line.mbol_tracking_supported || line.mbolTrackingSupported;

                    return (
                      <div
                        key={line.id}
                        className="p-4 rounded-lg border border-kumo-line hover:border-kumo-focus transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium">{name}</p>
                            {shortName && shortName !== name && (
                              <p className="text-sm text-kumo-muted">{shortName}</p>
                            )}
                          </div>
                          <span className="px-2 py-0.5 rounded bg-kumo-recessed text-sm font-mono">
                            {scac}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {containerSupported && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">
                              Container
                            </span>
                          )}
                          {bolSupported && (
                            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs">
                              BOL
                            </span>
                          )}
                          {bookingSupported && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs">
                              Booking
                            </span>
                          )}
                          {mbolSupported && (
                            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs">
                              Master BOL
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-kumo-muted text-center py-12">No shipping lines found</p>
            )}
          </CardContent>
        </Card>

        {/* SDK Code Panel */}
        <CodePanel title="SDK Code" code={listCode} collapsible />
      </div>
    </div>
  );
}
