import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button, StatusBadge } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate, containerStatusConfig } from '@/lib/utils';
import Link from 'next/link';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Containers List Page
 *
 * SDK Methods demonstrated:
 * - client.containers.list(filters, options) - List and filter containers
 */

interface Container {
  id: string;
  number?: string;
  // SDK mapped format uses flat 'status' property
  status?: string;
  // SDK uses nested equipment structure
  equipment?: {
    type?: string;
    length?: number;
    height?: number;
    weightLbs?: number;
  };
  // SDK uses nested terminals structure
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
  // SDK uses nested demurrage structure
  demurrage?: {
    pickupLfd?: string;
    pickupAppointmentAt?: string;
    fees?: any[];
    holds?: any[];
  };
  // SDK returns shippingLineScac (string, not object)
  shippingLineScac?: string;
  // Shipment relation
  shipment?: { id?: string; billOfLading?: string };
  createdAt?: string;
}

async function getContainers() {
  if (!hasApiToken()) {
    return {
      containers: [],
      error: 'T49_API_TOKEN environment variable is not set. Get your API key from https://app.terminal49.com/settings/api',
    };
  }

  const client = getClient();

  try {
    const result = await client.containers.list({}, { pageSize: 50, format: 'mapped' });
    // SDK returns { items: [], links: ..., meta: ... } for mapped format
    const containers = Array.isArray(result) ? result : result?.items || [];

    return { containers };
  } catch (error) {
    console.error('Failed to fetch containers:', error);
    return {
      containers: [],
      error: error instanceof Error ? error.message : 'Failed to fetch containers',
    };
  }
}

export default async function ContainersPage() {
  const { containers, error } = await getContainers();

  const listCode = `// List containers with filters and pagination
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Get all containers
const containers = await client.containers.list(
  {}, // filters (optional)
  { pageSize: 50, format: 'mapped' }
);

// Filter by status
const availableContainers = await client.containers.list(
  { status: 'available' },
  { format: 'mapped' }
);

// Filter by terminal
const lbctContainers = await client.containers.list(
  { terminal: 'LBCT' },
  { format: 'mapped' }
);

// Filter by carrier
const maerskContainers = await client.containers.list(
  { carrier: 'MAEU' },
  { format: 'mapped' }
);`;

  // Calculate status counts
  const statusCounts = containers.reduce((acc: Record<string, number>, c: Container) => {
    const status = c.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const topStatuses = Object.entries(statusCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4) as [string, number][];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Containers"
        description="View and track your containers across all shipments"
        actions={<Button href="/tracking-requests/new">+ Track New</Button>}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Error loading containers</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-kumo-default">{containers.length}</p>
              <p className="text-sm text-kumo-muted">Total Containers</p>
            </CardContent>
          </Card>
          {topStatuses.map(([status, count]) => {
            const config = containerStatusConfig[status] || { label: status, color: 'bg-gray-500' };
            return (
              <Card key={status}>
                <CardContent className="py-4">
                  <p className="text-2xl font-semibold" style={{ color: config.color.replace('bg-', '').includes('yellow') ? '#ca8a04' : config.color.replace('bg-', '').includes('green') ? '#16a34a' : config.color.replace('bg-', '').includes('blue') ? '#2563eb' : '#6b7280' }}>
                    {count}
                  </p>
                  <p className="text-sm text-kumo-muted">{config.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Containers Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Containers</CardTitle>
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
                      <th className="pb-3 font-medium text-kumo-secondary">Carrier</th>
                      <th className="pb-3 font-medium text-kumo-secondary">LFD</th>
                      <th className="pb-3 font-medium text-kumo-secondary"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((container: Container) => {
                      // SDK mapped format uses nested structures
                      const status = container.status || 'unknown';
                      const equipment = container.equipment?.type || '—';
                      const terminal = container.terminals?.podTerminal?.name || '—';
                      const carrier = container.shippingLineScac || '—';
                      const lfd = container.demurrage?.pickupLfd;

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
                            <StatusBadge status={status} size="sm" />
                          </td>
                          <td className="py-3 text-sm">{terminal}</td>
                          <td className="py-3 text-sm">{carrier}</td>
                          <td className="py-3">
                            {lfd ? (
                              <span className="text-sm">{formatDate(lfd)}</span>
                            ) : (
                              <span className="text-sm text-kumo-muted">—</span>
                            )}
                          </td>
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
              <div className="text-center py-12">
                <p className="text-kumo-muted">No containers found.</p>
                <Link href="/tracking-requests/new" className="text-kumo-link hover:underline">
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
