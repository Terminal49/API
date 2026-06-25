import { NextRequest, NextResponse } from 'next/server';
import { getClient, hasApiToken } from '@/lib/terminal49';

/**
 * POST /api/containers/[id]/refresh
 *
 * SDK Method: client.containers.refresh(id)
 *
 * Forces a refresh of container data from the carrier's system.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasApiToken()) {
    return NextResponse.json(
      { error: 'T49_API_TOKEN environment variable is not set' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    const client = getClient();
    await client.containers.refresh(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Refresh container error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh container' },
      { status: 500 }
    );
  }
}
