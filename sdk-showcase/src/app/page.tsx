import { PageHeader } from '@/components/layout';
import { MetricCard, Card, CardHeader, CardTitle, CardContent, Button, StatusBadge } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate, daysUntil, containerStatusConfig } from '@/lib/utils';
import Link from 'next/link';

// Force dynamic rendering - we fetch live data from the API
export const dynamic = 'force-dynamic';

/**
 * Dashboard page
 *
 * SDK Methods demonstrated:
 * - client.shipments.list() - Get shipment counts and summaries
 * - client.containers.list() - Get container counts by status
 * - client.trackingRequests.list() - Get pending tracking requests
 */

async function getDashboardData() {
  // Check if API token is configured before trying to use the client
  if (!hasApiToken()) {
    return {
      totalShipments: 0,
      totalContainers: 0,
      inTransit: 0,
      available: 0,
      urgentLfd: 0,
      pendingRequests: 0,
      statusCounts: {},
      urgentContainers: [],
      error: 'T49_API_TOKEN environment variable is not set. Get your API key from https://app.terminal49.com/settings/api',
    };
  }

  const client = getClient();

  try {
    // Fetch data in parallel for performance
    const [shipmentsResult, containersResult, trackingRequestsResult] =
      await Promise.all([
        client.shipments.list({}, { pageSize: 100, format: 'mapped' }),
        client.containers.list({}, { pageSize: 100, format: 'mapped' }),
        client.trackingRequests.list({}, { pageSize: 100, format: 'mapped' }),
      ]);

    // Extract data arrays - SDK returns { items: [], links: ..., meta: ... } for mapped format
    const shipments = Array.isArray(shipmentsResult)
      ? shipmentsResult
      : shipmentsResult?.items || [];
    const containers = Array.isArray(containersResult)
      ? containersResult
      : containersResult?.items || [];
    const trackingRequests = Array.isArray(trackingRequestsResult)
      ? trackingRequestsResult
      : trackingRequestsResult?.items || [];

    // Calculate status distribution
    const statusCounts: Record<string, number> = {};
    containers.forEach((container: any) => {
      const status = container.current_status || container.currentStatus || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Find containers with LFD within 3 days
    const urgentContainers = containers
      .filter((container: any) => {
        const lfd = container.pickup_lfd || container.pickupLfd;
        if (!lfd) return false;
        const days = daysUntil(lfd);
        return days !== null && days >= 0 && days <= 3;
      })
      .map((container: any) => ({
        id: container.id,
        number: container.number,
        lfd: container.pickup_lfd || container.pickupLfd,
        daysRemaining: daysUntil(container.pickup_lfd || container.pickupLfd),
        terminal: container.pod_terminal_name || container.podTerminalName || 'Unknown',
      }))
      .sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0))
      .slice(0, 5);

    // Count in-transit shipments
    const inTransitCount = shipments.filter(
      (s: any) => s.status === 'in_transit' || s.status === 'active'
    ).length;

    // Count available containers
    const availableCount = statusCounts['available'] || 0;

    return {
      totalShipments: shipments.length,
      totalContainers: containers.length,
      inTransit: inTransitCount,
      available: availableCount,
      urgentLfd: urgentContainers.length,
      pendingRequests: trackingRequests.filter(
        (r: any) => r.status === 'pending' || r.request_status === 'pending'
      ).length,
      statusCounts,
      urgentContainers,
    };
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    return {
      totalShipments: 0,
      totalContainers: 0,
      inTransit: 0,
      available: 0,
      urgentLfd: 0,
      pendingRequests: 0,
      statusCounts: {},
      urgentContainers: [],
      error: error instanceof Error ? error.message : 'Failed to fetch data',
    };
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const dashboardCode = `// Fetch dashboard data using the Terminal49 SDK
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Fetch data in parallel for performance
const [shipments, containers, trackingRequests] = await Promise.all([
  client.shipments.list({}, { pageSize: 100, format: 'mapped' }),
  client.containers.list({}, { pageSize: 100, format: 'mapped' }),
  client.trackingRequests.list({}, { pageSize: 100, format: 'mapped' }),
]);

// Calculate status distribution
const statusCounts = {};
containers.forEach((container) => {
  const status = container.currentStatus || 'unknown';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
});`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        description="Overview of your tracked shipments and containers"
        actions={
          <Button href="/tracking-requests/new" size="sm">+ Track Container</Button>
        }
      />

      <div className="flex-1 p-4 space-y-4">
        {/* Error Banner */}
        {'error' in data && data.error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <p className="font-medium">Error loading dashboard data</p>
            <p className="mt-1">{data.error}</p>
            <p className="mt-1 text-xs">
              Make sure T49_API_TOKEN is set in your environment variables.
            </p>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Containers"
            value={data.totalContainers}
            icon="📦"
            href="/containers"
          />
          <MetricCard
            title="In Transit Shipments"
            value={data.inTransit}
            icon="🚢"
            href="/shipments"
          />
          <MetricCard
            title="Available for Pickup"
            value={data.available}
            icon="✅"
            href="/containers?status=available"
            variant="success"
          />
          <MetricCard
            title="LFD < 3 days"
            value={data.urgentLfd}
            icon="⚠️"
            variant={data.urgentLfd > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(data.statusCounts).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(data.statusCounts)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([status, count]) => {
                      const config = containerStatusConfig[status];
                      const percentage = Math.round(
                        ((count as number) / data.totalContainers) * 100
                      );
                      return (
                        <div key={status} className="flex items-center gap-2">
                          <div className="w-20">
                            <StatusBadge status={status} size="sm" />
                          </div>
                          <div className="flex-1">
                            <div className="h-2 bg-kumo-recessed rounded-full overflow-hidden">
                              <div
                                className="h-full bg-kumo-accent rounded-full transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-kumo-secondary w-10 text-right tabular-nums">
                            {count as number}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-kumo-muted text-center py-6 text-sm">
                  No containers tracked yet.{' '}
                  <Link href="/tracking-requests/new" className="text-kumo-link">
                    Start tracking
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          {/* LFD Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>LFD Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {data.urgentContainers.length > 0 ? (
                <div className="space-y-2">
                  {data.urgentContainers.map((container: any) => (
                    <Link
                      key={container.id}
                      href={`/containers/${container.id}/demurrage`}
                      className="flex items-center justify-between p-2.5 rounded-md bg-kumo-recessed hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-kumo-default">
                          {container.number}
                        </p>
                        <p className="text-[11px] text-kumo-muted">
                          {container.terminal}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-amber-600">
                          {container.daysRemaining === 0
                            ? 'Today'
                            : container.daysRemaining === 1
                            ? 'Tomorrow'
                            : `${container.daysRemaining} days`}
                        </p>
                        <p className="text-[11px] text-kumo-muted">
                          LFD: {formatDate(container.lfd)}
                        </p>
                      </div>
                    </Link>
                  ))}
                  <Link
                    href="/containers?sort=lfd"
                    className="block text-center text-xs text-kumo-link hover:underline py-1.5"
                  >
                    View All →
                  </Link>
                </div>
              ) : (
                <p className="text-kumo-muted text-center py-6 text-sm">
                  No urgent LFD alerts
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button href="/tracking-requests/new" variant="primary" size="sm">
                + Track New Container
              </Button>
              <Button href="/search" variant="secondary" size="sm">
                Search
              </Button>
              <Button href="/shipments" variant="secondary" size="sm">
                View Shipments
              </Button>
              <Button href="/containers" variant="secondary" size="sm">
                View Containers
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* SDK Code Panel */}
        <CodePanel title="SDK Code" code={dashboardCode} collapsible />
      </div>
    </div>
  );
}
