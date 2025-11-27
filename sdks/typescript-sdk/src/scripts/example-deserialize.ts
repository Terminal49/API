import { Terminal49Client } from '@terminal49/sdk';

interface SimplifiedContainer {
  id: string;
  number?: string;
  status?: string;
  shipment?: { id: string; bill_of_lading?: string } | null;
}

async function main() {
  const token = process.env.T49_API_TOKEN;
  const containerId = process.env.T49_CONTAINER_ID;

  if (!token) throw new Error('Set T49_API_TOKEN');
  if (!containerId) throw new Error('Set T49_CONTAINER_ID');

  const client = new Terminal49Client({ apiToken: token });

  // Fetch raw JSON:API document (includes shipment for mapping)
  const doc = await client.getContainer(containerId, ['shipment']);

  // Use JSONA to deserialize into plain objects
  const simplified = client.deserialize<SimplifiedContainer>(doc);

  console.log('Raw JSON:API:');
  console.log(JSON.stringify(doc, null, 2));
  console.log('\nSimplified:');
  console.log(JSON.stringify(simplified, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
