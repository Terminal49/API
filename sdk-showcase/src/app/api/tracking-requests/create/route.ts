import { NextRequest, NextResponse } from 'next/server';
import { getClient, hasApiToken } from '@/lib/terminal49';

/**
 * POST /api/tracking-requests/create
 *
 * SDK Methods:
 * - client.trackingRequests.createFromInfer(number, options)
 * - client.trackingRequests.create(params)
 *
 * Creates a tracking request, optionally using inference results.
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
    const { number, scac } = body;

    if (!number || typeof number !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid tracking number' },
        { status: 400 }
      );
    }

    const client = getClient();

    // Use createFromInfer if SCAC is provided (from inference flow)
    // Otherwise use trackContainer for a simpler flow
    let result;

    if (scac) {
      // Create with explicit SCAC from inference
      result = await client.trackingRequests.createFromInfer(number.trim(), {
        scac,
      });
    } else {
      // Use simpler track method that handles inference internally
      result = await client.trackContainer({ containerNumber: number.trim() });
    }

    return NextResponse.json({
      success: true,
      trackingRequest: result.trackingRequest || result,
      shipment: result.shipment,
    });
  } catch (error) {
    console.error('Create tracking request error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create tracking request',
      },
      { status: 500 }
    );
  }
}
