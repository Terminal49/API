import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sdkRoot = path.resolve(__dirname, '..');

const envCandidates = [
  process.env.DOTENV_CONFIG_PATH,
  path.resolve(sdkRoot, '../.env.local'),
  path.resolve(sdkRoot, '../.env'),
  path.resolve(sdkRoot, '.env.local'),
  path.resolve(sdkRoot, '.env'),
].filter(Boolean);

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const token = process.env.T49_API_TOKEN;
if (!token) {
  console.error('Missing T49_API_TOKEN in environment.');
  process.exit(1);
}

const baseUrl = (
  process.env.T49_API_BASE_URL || 'https://api.terminal49.com/v2'
).replace(/\/+$/, '');
const authHeader = token.startsWith('Token ') ? token : `Token ${token}`;

const fixturesDir = path.resolve(sdkRoot, 'src/fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });

const idMaps = new Map();
const valueMaps = new Map();

function mapId(type, id) {
  if (!id || typeof id !== 'string') return id;
  const key = `${type}:${id}`;
  if (!idMaps.has(key)) {
    const count =
      [...idMaps.keys()].filter((k) => k.startsWith(`${type}:`)).length + 1;
    idMaps.set(key, `${type}-${count}`);
  }
  return idMaps.get(key);
}

function mapValue(key, value, prefix) {
  if (!value || typeof value !== 'string') return value;
  const mapKey = `${key}:${prefix}`;
  if (!valueMaps.has(mapKey)) valueMaps.set(mapKey, new Map());
  const map = valueMaps.get(mapKey);
  if (!map.has(value)) {
    map.set(value, `${prefix}-${String(map.size + 1).padStart(3, '0')}`);
  }
  return map.get(value);
}

function obfuscateTail(value, key, tailLength = 3) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= tailLength) {
    return mapValue(key, value, key.toUpperCase().slice(0, 3));
  }
  const prefix = value.slice(0, -tailLength);
  const hash = crypto
    .createHash('sha256')
    .update(`${key}:${value}`)
    .digest('hex');
  const suffix = hash.slice(0, tailLength);
  return `${prefix}${suffix}`;
}

function sanitizeAttributes(type, attrs) {
  if (!attrs || typeof attrs !== 'object') return attrs;

  const sanitized = { ...attrs };

  if (type === 'container') {
    if (sanitized.number) {
      sanitized.number = obfuscateTail(sanitized.number, 'container_number');
    }
    if (sanitized.container_number) {
      sanitized.container_number = obfuscateTail(
        sanitized.container_number,
        'container_number',
      );
    }
  }

  if (type === 'shipment') {
    if (sanitized.bill_of_lading_number) {
      sanitized.bill_of_lading_number = obfuscateTail(
        sanitized.bill_of_lading_number,
        'bill_of_lading',
      );
    }
    if (sanitized.bill_of_lading) {
      sanitized.bill_of_lading = obfuscateTail(
        sanitized.bill_of_lading,
        'bill_of_lading',
      );
    }
    if (sanitized.bl_number) {
      sanitized.bl_number = obfuscateTail(
        sanitized.bl_number,
        'bill_of_lading',
      );
    }
  }

  if (type === 'tracking_request') {
    if (sanitized.request_number) {
      sanitized.request_number = obfuscateTail(
        sanitized.request_number,
        'request_number',
      );
    }
    if (Array.isArray(sanitized.ref_numbers)) {
      sanitized.ref_numbers = sanitized.ref_numbers.map((value) =>
        obfuscateTail(value, 'ref_number'),
      );
    }
  }

  if (sanitized.booking_number) {
    sanitized.booking_number = obfuscateTail(
      sanitized.booking_number,
      'booking_number',
    );
  }

  if (sanitized.customer_name) {
    sanitized.customer_name = mapValue(
      'customer_name',
      sanitized.customer_name,
      'CUSTOMER',
    );
  }

  return sanitized;
}

function sanitizeRelationships(relationships) {
  if (!relationships || typeof relationships !== 'object') return relationships;
  const sanitized = { ...relationships };

  for (const value of Object.values(sanitized)) {
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value.data)) {
      value.data = value.data.map((ref) => ({
        ...ref,
        id: mapId(ref.type, ref.id),
      }));
    } else if (value.data && typeof value.data === 'object') {
      value.data = { ...value.data, id: mapId(value.data.type, value.data.id) };
    }
  }

  return sanitized;
}

function sanitizeResource(resource) {
  if (!resource || typeof resource !== 'object') return resource;
  const type = resource.type;
  const sanitized = { ...resource };

  if (type && sanitized.id) {
    sanitized.id = mapId(type, sanitized.id);
  }

  if (sanitized.attributes) {
    sanitized.attributes = sanitizeAttributes(type, sanitized.attributes);
  }

  if (sanitized.relationships) {
    sanitized.relationships = sanitizeRelationships(sanitized.relationships);
  }

  return sanitized;
}

function sanitizeDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const sanitized = JSON.parse(JSON.stringify(doc));

  if (Array.isArray(sanitized.data)) {
    sanitized.data = sanitized.data.map((item) => sanitizeResource(item));
  } else if (sanitized.data && typeof sanitized.data === 'object') {
    sanitized.data = sanitizeResource(sanitized.data);
  }

  if (Array.isArray(sanitized.included)) {
    sanitized.included = sanitized.included.map((item) =>
      sanitizeResource(item),
    );
  }

  return sanitized;
}

async function fetchJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.errors
      ? JSON.stringify(body.errors)
      : response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return body;
}

function writeFixture(name, doc) {
  const sanitized = sanitizeDocument(doc);
  const filepath = path.resolve(fixturesDir, `${name}.json`);
  fs.writeFileSync(filepath, JSON.stringify(sanitized, null, 2));
  console.log(`Wrote ${path.relative(sdkRoot, filepath)}`);
}

function firstIdFromList(doc) {
  if (!doc || !Array.isArray(doc.data) || doc.data.length === 0) return null;
  return doc.data[0]?.id || null;
}

function firstIncludedId(doc, type) {
  if (!doc || !Array.isArray(doc.included)) return null;
  const match = doc.included.find((item) => item.type === type);
  return match?.id || null;
}

function firstRelationshipId(doc, relName) {
  const rel = doc?.data?.relationships?.[relName]?.data;
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.id || null;
  return rel.id || null;
}

async function main() {
  const fixtures = {};

  const shipmentsList = await fetchJson('/shipments?page[size]=1');
  fixtures.shipmentsList = shipmentsList;
  writeFixture('shipments.list', shipmentsList);

  const shipmentId = firstIdFromList(shipmentsList);
  if (shipmentId) {
    const shipmentGetBase = await fetchJson(`/shipments/${shipmentId}`);
    fixtures.shipmentGetBase = shipmentGetBase;
    writeFixture('shipments.get.base', shipmentGetBase);

    const shipmentGetInclude = await fetchJson(
      `/shipments/${shipmentId}?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal`,
    );
    fixtures.shipmentGetInclude = shipmentGetInclude;
    writeFixture('shipments.get.include', shipmentGetInclude);
  }

  const containersList = await fetchJson('/containers?page[size]=1');
  fixtures.containersList = containersList;
  writeFixture('containers.list', containersList);

  const containerId =
    firstIncludedId(fixtures.shipmentGetInclude, 'container') ||
    firstRelationshipId(fixtures.shipmentGetInclude, 'containers') ||
    firstIdFromList(containersList);

  if (containerId) {
    const containerGetBase = await fetchJson(`/containers/${containerId}`);
    writeFixture('containers.get.base', containerGetBase);

    const containerGetInclude = await fetchJson(
      `/containers/${containerId}?include=shipment,pod_terminal`,
    );
    writeFixture('containers.get.include', containerGetInclude);

    try {
      const route = await fetchJson(
        `/containers/${containerId}/route?include=port,vessel,route_location`,
      );
      writeFixture('containers.route', route);
    } catch (error) {
      console.warn(`Skipping route fixture: ${error.message}`);
    }

    try {
      const events = await fetchJson(
        `/containers/${containerId}/transport_events?include=location,terminal`,
      );
      writeFixture('containers.events', events);
    } catch (error) {
      console.warn(`Skipping transport events fixture: ${error.message}`);
    }

    try {
      const rawEvents = await fetchJson(
        `/containers/${containerId}/raw_events`,
      );
      writeFixture('containers.raw-events', rawEvents);
    } catch (error) {
      console.warn(`Skipping raw events fixture: ${error.message}`);
    }
  }

  const trackingList = await fetchJson('/tracking_requests?page[size]=1');
  fixtures.trackingList = trackingList;
  writeFixture('tracking-requests.list', trackingList);

  const trackingId = firstIdFromList(trackingList);
  if (trackingId) {
    const trackingGetBase = await fetchJson(`/tracking_requests/${trackingId}`);
    writeFixture('tracking-requests.get.base', trackingGetBase);

    try {
      const trackingGetInclude = await fetchJson(
        `/tracking_requests/${trackingId}?include=shipment,container`,
      );
      writeFixture('tracking-requests.get.include', trackingGetInclude);
    } catch (error) {
      console.warn(
        `Skipping tracking request include fixture: ${error.message}`,
      );
    }
  }

  const shippingLines = await fetchJson('/shipping_lines');
  writeFixture('shipping-lines.list', shippingLines);

  const portId =
    firstIncludedId(fixtures.shipmentGetInclude, 'port') ||
    firstRelationshipId(fixtures.shipmentGetInclude, 'port_of_lading') ||
    firstRelationshipId(fixtures.shipmentGetInclude, 'port_of_discharge') ||
    firstRelationshipId(fixtures.shipmentGetInclude, 'destination');

  if (portId) {
    try {
      const port = await fetchJson(`/ports/${portId}`);
      writeFixture('ports.get', port);
    } catch (error) {
      console.warn(`Skipping port fixture: ${error.message}`);
    }
  }

  const terminalId =
    firstIncludedId(fixtures.shipmentGetInclude, 'terminal') ||
    firstRelationshipId(fixtures.shipmentGetInclude, 'pod_terminal') ||
    firstRelationshipId(fixtures.shipmentGetInclude, 'destination_terminal');

  if (terminalId) {
    try {
      const terminal = await fetchJson(`/terminals/${terminalId}`);
      writeFixture('terminals.get', terminal);
    } catch (error) {
      console.warn(`Skipping terminal fixture: ${error.message}`);
    }
  }

  console.log('Fixtures generation complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
