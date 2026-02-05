import { NextRequest, NextResponse } from 'next/server';
import { getClient, hasApiToken } from '@/lib/terminal49';

/**
 * POST /api/shipments/[id]/resume
 *
 * SDK Method: client.shipments.resumeTracking(id)
 *
 * Resumes tracking a previously stopped shipment.
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
    await client.shipments.resumeTracking(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resume tracking error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resume tracking' },
      { status: 500 }
    );
  }
}
