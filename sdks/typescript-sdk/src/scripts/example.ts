import { Terminal49Client } from '@terminal49/sdk';

interface SimplifiedContainer {
  id: string;
  number?: string;
  status?: string;
  shipment?: {
    id: string;
    bill_of_lading?: string;
    containers?: Array<{ id: string; number?: string }>;
  } | null;
}

async function main() {
  const token = process.env.T49_API_TOKEN;
  const containerId = process.env.T49_CONTAINER_ID;

  if (!token) throw new Error('Set T49_API_TOKEN');
  if (!containerId) throw new Error('Set T49_CONTAINER_ID');

  const client = new Terminal49Client({ apiToken: token });

  // Fetch raw JSON:API document (includes shipment for mapping)
  const doc = await client.getContainer(containerId, ['shipment']);

  console.log('Raw JSON:API response:');
  console.log(JSON.stringify(doc, null, 2));

  // Demonstrate JSONA deserialization into a plain object
  const deserialized = client.deserialize<any>(doc);
  const simplified: SimplifiedContainer = {
    id: deserialized.id,
    number: deserialized.number || deserialized.container_number,
    status: deserialized.status,
    shipment: deserialized.shipment
      ? {
          id: deserialized.shipment.id,
          bill_of_lading:
            deserialized.shipment.bill_of_lading_number ||
            deserialized.shipment.bill_of_lading ||
            deserialized.shipment.bl_number,
          containers: Array.isArray(deserialized.shipment.containers)
            ? deserialized.shipment.containers.map((c: any) => ({
                id: c.id,
                number: c.number || c.container_number,
              }))
            : undefined,
        }
      : null,
  };

  console.log('\nSimplified (deserialize → plucked):');
  console.log(JSON.stringify(simplified, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
