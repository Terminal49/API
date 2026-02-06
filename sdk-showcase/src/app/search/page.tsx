import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/features';
import { CodePanel } from '@/components/code-panel';
import { getClient, hasApiToken } from '@/lib/terminal49';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Global Search Page
 *
 * SDK Methods demonstrated:
 * - client.search(query) - Search across shipments, containers, and tracking requests
 */

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

interface SearchResult {
  id: string;
  type?: string;
  resourceType?: string;
  resource_type?: string;
  number?: string;
  container_number?: string;
  containerNumber?: string;
  bill_of_lading?: string;
  billOfLading?: string;
  booking_number?: string;
  bookingNumber?: string;
  status?: string;
  current_status?: string;
  currentStatus?: string;
  shipping_line?: {
    name?: string;
    scac?: string;
  };
  shippingLine?: {
    name?: string;
    scac?: string;
  };
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

async function performSearch(query: string) {
  if (!hasApiToken()) {
    return {
      results: [],
      error: 'T49_API_TOKEN environment variable is not set',
    };
  }

  if (!query || query.trim().length < 2) {
    return { results: [], error: null };
  }

  const client = getClient();

  try {
    const searchResult = await client.search(query.trim());
    const results = Array.isArray(searchResult) ? searchResult : searchResult?.items || [];
    return { results };
  } catch (error) {
    console.error('Search failed:', error);
    return {
      results: [],
      error: error instanceof Error ? error.message : 'Search failed',
    };
  }
}

function getResultIcon(type: string): string {
  const resultType = type?.toLowerCase() || '';
  if (resultType.includes('container')) return '📦';
  if (resultType.includes('shipment')) return '🚢';
  if (resultType.includes('tracking')) return '📍';
  return '📋';
}

function getResultLink(result: SearchResult): string {
  const type = result.type || result.resourceType || result.resource_type || '';
  const typeLower = type.toLowerCase();

  if (typeLower.includes('container')) {
    return `/containers/${result.id}`;
  }
  if (typeLower.includes('shipment')) {
    return `/shipments/${result.id}`;
  }
  if (typeLower.includes('tracking')) {
    return `/tracking-requests/${result.id}`;
  }
  return '#';
}

function getResultTitle(result: SearchResult): string {
  return (
    result.number ||
    result.container_number ||
    result.containerNumber ||
    result.bill_of_lading ||
    result.billOfLading ||
    result.booking_number ||
    result.bookingNumber ||
    result.id.slice(0, 8)
  );
}

function formatResultType(type: string): string {
  if (!type) return 'Unknown';
  return type
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: query } = await searchParams;
  const { results, error } = query ? await performSearch(query) : { results: [], error: null };

  const searchCode = `// Global search across all resources
const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN });

// Search for containers, shipments, or tracking requests
const results = await client.search('${query || 'MSCU1234567'}');

// The search API accepts:
// - Container numbers (e.g., MSCU1234567)
// - Bill of lading numbers (e.g., MAEUSEA12345678)
// - Booking numbers
// - Reference numbers

// Results include matches from:
// - Containers: by container number
// - Shipments: by BOL, booking, or reference numbers
// - Tracking Requests: by tracked number

// Each result includes:
// - id: Resource ID for fetching details
// - type: Resource type (container, shipment, tracking_request)
// - number/bill_of_lading/booking_number: Matching identifier
// - status: Current status
// - shipping_line: Carrier information`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Search"
        description="Search across shipments, containers, and tracking requests"
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Search Form */}
        <Card>
          <CardContent className="py-6">
            <form method="GET" action="/search" className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  name="q"
                  placeholder="Search by container number, BOL, booking number..."
                  defaultValue={query || ''}
                  className="w-full px-4 py-3 rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-muted focus:outline-none focus:ring-2 focus:ring-kumo-focus"
                  autoFocus
                />
                <p className="text-sm text-kumo-muted mt-2">
                  Enter a container number, bill of lading, booking number, or reference number
                </p>
              </div>
              <button
                type="submit"
                className="px-6 py-3 h-fit rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
            </form>
          </CardContent>
        </Card>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <p className="font-medium">Search error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Search Results */}
        {query && (
          <Card>
            <CardHeader>
              <CardTitle>
                Search Results for &quot;{query}&quot; ({results.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length > 0 ? (
                <div className="space-y-3">
                  {results.map((result: SearchResult) => {
                    const type = result.type || result.resourceType || result.resource_type || '';
                    const status = result.status || result.current_status || result.currentStatus;
                    const carrier = result.shipping_line || result.shippingLine;
                    const updatedAt = result.updated_at || result.updatedAt;

                    return (
                      <Link
                        key={result.id}
                        href={getResultLink(result)}
                        className="flex items-center justify-between p-4 rounded-lg border border-kumo-line hover:border-kumo-focus hover:bg-kumo-recessed transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">{getResultIcon(type)}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-mono font-medium">{getResultTitle(result)}</p>
                              <span className="px-2 py-0.5 rounded text-xs bg-kumo-recessed text-kumo-secondary">
                                {formatResultType(type)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-kumo-muted">
                              {carrier?.name && <span>🚢 {carrier.name}</span>}
                              {status && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs ${
                                    status === 'available'
                                      ? 'bg-green-100 text-green-800'
                                      : status === 'on_ship' || status === 'in_transit'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {status.replace(/_/g, ' ')}
                                </span>
                              )}
                              {updatedAt && <span>Updated: {formatDate(updatedAt)}</span>}
                            </div>
                          </div>
                        </div>
                        <span className="text-kumo-link">View →</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-4xl mb-4">🔍</p>
                  <p className="text-kumo-secondary">No results found for &quot;{query}&quot;</p>
                  <p className="text-sm text-kumo-muted mt-2">
                    Try searching with a different container number, BOL, or booking number
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!query && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-xl font-medium text-kumo-default">Search Your Shipments</p>
                <p className="text-kumo-secondary mt-2 max-w-md mx-auto">
                  Enter a container number, bill of lading, booking number, or reference number to
                  find your tracked shipments and containers.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
                  <span className="px-3 py-1 rounded-full bg-kumo-recessed text-kumo-muted">
                    Container: MSCU1234567
                  </span>
                  <span className="px-3 py-1 rounded-full bg-kumo-recessed text-kumo-muted">
                    BOL: MAEUSEA12345678
                  </span>
                  <span className="px-3 py-1 rounded-full bg-kumo-recessed text-kumo-muted">
                    Booking: 123456789
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SDK Code Panel */}
        <CodePanel title="SDK Code" code={searchCode} collapsible />
      </div>
    </div>
  );
}
