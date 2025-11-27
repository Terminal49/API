import { Terminal49Client } from '@terminal49/sdk';

async function main() {
  const token = process.env.T49_API_TOKEN;
  if (!token) throw new Error('Set T49_API_TOKEN');

  const containerId = process.env.T49_CONTAINER_ID;
  const shipmentId = process.env.T49_SHIPMENT_ID;
  const trackingRequestId = process.env.T49_TRACKING_REQUEST_ID;

  const client = new Terminal49Client({ apiToken: token, defaultFormat: 'mapped' });

  // Shipping lines
  const lines = await client.shippingLines.list(undefined, { format: 'mapped' });
  console.log(`Shipping lines: ${Array.isArray(lines) ? lines.length : 'n/a'}`);

  if (containerId) {
    const c = await client.containers.get(containerId, ['shipment'], { format: 'both' });
    console.log('Container:', c && (c as any).mapped?.id || (c as any).raw?.data?.id || 'unknown');

    const events = await client.containers.events(containerId, { format: 'raw' });
    console.log('Events count:', events?.data?.length ?? 'n/a');

    const route = await client.containers.route(containerId, { format: 'mapped' });
    console.log('Route legs:', (route as any)?.totalLegs ?? 'n/a');
  }

  if (shipmentId) {
    const s = await client.shipments.get(shipmentId, true, { format: 'both' });
    console.log('Shipment:', (s as any).mapped?.id || (s as any).raw?.data?.id || 'unknown');
  }

  if (trackingRequestId) {
    const tr = await client.getTrackingRequest(trackingRequestId, { format: 'raw' });
    console.log('Tracking request status:', (tr as any)?.data?.attributes?.status ?? 'n/a');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
