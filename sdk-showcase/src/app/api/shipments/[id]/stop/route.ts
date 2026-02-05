import { NextRequest, NextResponse } from 'next/server';
import { getClient, hasApiToken } from '@/lib/terminal49';

/**
 * POST /api/shipments/[id]/stop
 *
 * SDK Method: client.shipments.stopTracking(id)
 *
 * Stops tracking a shipment. The shipment will no longer receive updates.
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
    await client.shipments.stopTracking(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Stop tracking error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop tracking' },
      { status: 500 }
    );
  }
}
