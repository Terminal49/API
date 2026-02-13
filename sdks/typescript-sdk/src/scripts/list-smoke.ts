import { Terminal49Client } from '@terminal49/sdk';

async function main() {
  const token = process.env.T49_API_TOKEN;
  if (!token) throw new Error('Set T49_API_TOKEN');

  const client = new Terminal49Client({
    apiToken: token,
    defaultFormat: 'mapped',
  });

  // Shipping lines
  const lines = await client.shippingLines.list(undefined, {
    format: 'mapped',
  });
  logSection('shipping_lines', lines, 5);

  // Containers (optionally filtered)
  const containerFilters: Record<string, string> = {};
  if (process.env.T49_CONTAINER_STATUS)
    containerFilters['filter[status]'] = process.env.T49_CONTAINER_STATUS;
  if (process.env.T49_CONTAINER_PORT)
    containerFilters['filter[pod_locode]'] = process.env.T49_CONTAINER_PORT;
  const containers = await client.listContainers(containerFilters, {
    format: 'mapped',
  });
  logSection('containers', containers, 3);

  // Shipments (optionally filtered)
  const shipmentFilters: Record<string, string> = {};
  if (process.env.T49_SHIPMENT_STATUS)
    shipmentFilters['filter[status]'] = process.env.T49_SHIPMENT_STATUS;
  if (process.env.T49_SHIPMENT_PORT)
    shipmentFilters['filter[pod_locode]'] = process.env.T49_SHIPMENT_PORT;
  const shipments = await client.listShipments(shipmentFilters, {
    format: 'mapped',
  });
  logSection('shipments', shipments, 3);

  // Tracking requests
  const trackingFilters: Record<string, string> = {};
  const trackingRequests = await client.listTrackingRequests(trackingFilters, {
    format: 'mapped',
  });
  logSection('tracking_requests', trackingRequests, 3);
}

function logSection(name: string, data: any, sampleCount: number) {
  const list = Array.isArray(data) ? data : data?.items || data?.data || [];
  console.log(`\n=== ${name} ===`);
  console.log(`count: ${Array.isArray(list) ? list.length : 'n/a'}`);
  if (Array.isArray(list)) {
    const sample = list.slice(0, sampleCount);
    console.log('sample:', JSON.stringify(sample, null, 2));
  } else {
    console.log('raw:', JSON.stringify(data, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
