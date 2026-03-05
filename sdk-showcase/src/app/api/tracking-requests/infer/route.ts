import { NextRequest, NextResponse } from 'next/server';
import { getClient, hasApiToken } from '@/lib/terminal49';

/**
 * POST /api/tracking-requests/infer
 *
 * SDK Method: client.trackingRequests.inferNumber(number)
 *
 * Infers the number type (container, booking, bill of lading) and
 * suggests carrier candidates based on the tracking number format.
 */
export async function POST(request: NextRequest) {
  if (!hasApiToken()) {
    return NextResponse.json(
      { error: 'T49_API_TOKEN environment variable is not set' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { number } = body;

    if (!number || typeof number !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid tracking number' },
        { status: 400 }
      );
    }

    const client = getClient();
    const result = await client.trackingRequests.inferNumber(number.trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error('Infer number error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to infer number' },
      { status: 500 }
    );
  }
}
