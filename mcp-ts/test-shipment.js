#!/usr/bin/env node

import { Terminal49Client } from './dist/client.js';
import { executeGetShipmentDetails } from './dist/tools/get-shipment-details.js';

async function test() {
  const client = new Terminal49Client({
    apiToken: 'kJVzEaVQzRmyGCwcXVcTJAwU',
    apiBaseUrl: 'https://api.terminal49.com/v2'
  });

  try {
    console.log('Testing get_shipment_details with fixed includes...\n');

    const result = await executeGetShipmentDetails(
      {
        id: '0d548fba-2a2d-4b5b-a651-ea13113a4b6f',
        include_containers: true
      },
      client
    );

    console.log('✅ SUCCESS!\n');
    console.log('Shipment Details:');
    console.log('- Bill of Lading:', result.bill_of_lading);
    console.log('- Status:', result.status);
    console.log('- Shipping Line:', result.shipping_line.name, `(${result.shipping_line.scac})`);
    console.log('- Origin:', result.routing.port_of_lading.name);
    console.log('- Destination:', result.routing.port_of_discharge.name);
    console.log('- Containers:', result.containers.count);
    console.log('\n✅ All includes working without shipping_line relationship!');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

test();
