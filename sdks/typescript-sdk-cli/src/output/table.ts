/**
 * Table renderer for TTY output.
 *
 * Uses cli-table3 to render resource-specific tables.
 * Each resource type (container, shipment, tracking request)
 * has its own column definition.
 */

import Table from 'cli-table3';

interface ColumnDef {
  key: string;
  title: string;
}

type Resource = 'shipments' | 'containers' | 'tracking-requests' | 'search' | 'shipping-lines' | 'unknown';

const resourceColumns: Record<Resource, ColumnDef[]> = {
  shipments: [
    { key: 'id', title: 'ID' },
    { key: 'billOfLading', title: 'BOL' },
    { key: 'shippingLineScac', title: 'SCAC' },
    { key: 'status', title: 'Status' },
    { key: 'customerName', title: 'Customer' },
    { key: 'tracking.lineTrackingStoppedReason', title: 'Tracking' },
  ],
  containers: [
    { key: 'id', title: 'ID' },
    { key: 'number', title: 'Number' },
    { key: 'status', title: 'Status' },
    { key: 'equipment.type', title: 'Type' },
    { key: 'equipment.length', title: 'Len' },
    { key: 'location.currentLocation', title: 'Location' },
    { key: 'terminals.podTerminal.name', title: 'POD Terminal' },
  ],
  'tracking-requests': [
    { key: 'id', title: 'ID' },
    { key: 'requestType', title: 'Type' },
    { key: 'requestNumber', title: 'Number' },
    { key: 'scac', title: 'SCAC' },
    { key: 'status', title: 'Status' },
  ],
  search: [
    { key: 'match', title: 'Match' },
    { key: 'resultType', title: 'Result Type' },
    { key: 'resultId', title: 'Result ID' },
    { key: 'status', title: 'Status' },
    { key: 'details', title: 'Details' },
    { key: 'score', title: 'Score' },
  ],
  'shipping-lines': [
    { key: 'scac', title: 'SCAC' },
    { key: 'name', title: 'Name' },
    { key: 'shortName', title: 'Short Name' },
  ],
  unknown: [{ key: 'id', title: 'ID' }],
};

const unknownColumnCandidates: ColumnDef[] = [
  { key: 'id', title: 'ID' },
  { key: 'type', title: 'Type' },
  { key: 'number', title: 'Number' },
  { key: 'name', title: 'Name' },
  { key: 'status', title: 'Status' },
  { key: 'scac', title: 'SCAC' },
  { key: 'requestNumber', title: 'Request' },
  { key: 'billOfLading', title: 'BOL' },
  { key: 'attributes.entity_type', title: 'Entity' },
  { key: 'attributes.api_slug', title: 'Slug' },
  { key: 'attributes.display_name', title: 'Display Name' },
  { key: 'attributes.data_type', title: 'Data Type' },
  { key: 'attributes.number', title: 'Number' },
  { key: 'attributes.name', title: 'Name' },
  { key: 'attributes.company_name', title: 'Company' },
  { key: 'attributes.status', title: 'Status' },
  { key: 'attributes.event', title: 'Event' },
];

function valueAtPath(row: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, part) => {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    const container = cursor as Record<string, unknown>;
    const next = container[part];
    return next;
  }, row);
}

function findValueDeep(input: unknown, key: string, depth = 6): unknown {
  if (depth < 0 || input === null || input === undefined) return undefined;
  if (Array.isArray(input)) {
    return input
      .map((item) => findValueDeep(item, key, depth - 1))
      .find((value) => value !== undefined);
  }
  if (typeof input !== 'object') return undefined;

  const obj = input as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

  for (const value of Object.values(obj)) {
    const found = findValueDeep(value, key, depth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findNumeric(input: unknown, key: string, depth = 2): number | undefined {
  const value = findValueDeep(input, key, depth);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function findNumericByKeyPattern(
  input: unknown,
  keyPattern: RegExp,
  depth = 6,
): number | undefined {
  if (depth < 0 || input === null || input === undefined) return undefined;
  if (Array.isArray(input)) {
    return input
      .map((item) => findNumericByKeyPattern(item, keyPattern, depth - 1))
      .find((value) => value !== undefined);
  }
  if (typeof input !== 'object') return undefined;

  const obj = input as Record<string, unknown>;
  for (const [name, value] of Object.entries(obj)) {
    if (keyPattern.test(name)) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }

  for (const value of Object.values(obj)) {
    const found = findNumericByKeyPattern(value, keyPattern, depth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizeResultType(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!normalized || normalized === 'search_result' || normalized === 'search-result') {
    return '';
  }
  if (normalized.includes('shipment')) return 'shipment';
  if (normalized.includes('container')) return 'container';
  if (normalized.includes('tracking')) return 'tracking_request';
  if (normalized.includes('bill')) return 'shipment';
  if (normalized.includes('booking')) return 'tracking_request';
  return normalized.replace(/\s+/g, '_');
}

function deriveResultType(flattened: Record<string, unknown>, match: string): string {
  const typeCandidate = pickFirstDefined([
    valueAtPath(flattened, 'attributes.entity_type'),
    valueAtPath(flattened, 'attributes.entityType'),
    valueAtPath(flattened, 'resultType'),
    valueAtPath(flattened, 'resourceType'),
    valueAtPath(flattened, 'resource_type'),
    valueAtPath(flattened, 'trackedObjectType'),
    valueAtPath(flattened, 'tracked_object_type'),
    valueAtPath(flattened, 'entityType'),
    valueAtPath(flattened, 'entity_type'),
    valueAtPath(flattened, 'entity'),
    valueAtPath(flattened, '_index'),
    valueAtPath(flattened, 'type'),
    findValueDeep(flattened, 'resultType'),
    findValueDeep(flattened, 'resourceType'),
    findValueDeep(flattened, 'resource_type'),
    findValueDeep(flattened, 'trackedObjectType'),
    findValueDeep(flattened, 'tracked_object_type'),
    findValueDeep(flattened, 'entityType'),
    findValueDeep(flattened, 'entity_type'),
    findValueDeep(flattened, 'entity'),
    findValueDeep(flattened, '_index'),
    findValueDeep(flattened, 'type'),
  ]);

  const normalized = normalizeResultType(typeCandidate);
  if (normalized) return normalized;

  if (/^[A-Z]{4}\d{7}$/i.test(match)) return 'container';
  if (/^[A-Z]{4}\d{6,}$/i.test(match)) return 'shipment';
  if (/^\d{6,}$/.test(match)) return 'tracking_request';
  return 'unknown';
}

function deriveResultId(flattened: Record<string, unknown>, resultType: string): string {
  const wrapperId = pickFirstDefined([
    valueAtPath(flattened, 'id'),
    valueAtPath(flattened, '_id'),
  ]);
  const resourceId = pickFirstDefined([
    valueAtPath(flattened, 'resultId'),
    valueAtPath(flattened, 'resourceId'),
    valueAtPath(flattened, 'resource_id'),
    valueAtPath(flattened, 'trackedObjectId'),
    valueAtPath(flattened, 'tracked_object_id'),
    valueAtPath(flattened, 'shipmentId'),
    valueAtPath(flattened, 'containerId'),
    valueAtPath(flattened, 'trackingRequestId'),
    valueAtPath(flattened, 'requestId'),
    valueAtPath(flattened, 'attributes.shipment_id'),
    valueAtPath(flattened, 'attributes.container_id'),
    valueAtPath(flattened, 'attributes.tracking_request_id'),
    findValueDeep(flattened, 'resultId'),
    findValueDeep(flattened, 'resourceId'),
    findValueDeep(flattened, 'resource_id'),
    findValueDeep(flattened, 'trackedObjectId'),
    findValueDeep(flattened, 'tracked_object_id'),
    findValueDeep(flattened, 'shipmentId'),
    findValueDeep(flattened, 'containerId'),
    findValueDeep(flattened, 'trackingRequestId'),
    findValueDeep(flattened, 'requestId'),
    findValueDeep(flattened, 'shipment_id'),
    findValueDeep(flattened, 'container_id'),
    findValueDeep(flattened, 'tracking_request_id'),
  ]);

  if (resourceId) return resourceId;
  if (resultType === 'unknown') return '';
  return wrapperId;
}

function deriveDetails(flattened: Record<string, unknown>): string {
  const scac = pickFirstDefined([
    valueAtPath(flattened, 'shippingLineScac'),
    valueAtPath(flattened, 'lineScac'),
    valueAtPath(flattened, 'scac'),
    findValueDeep(flattened, 'shippingLineScac'),
    findValueDeep(flattened, 'lineScac'),
    findValueDeep(flattened, 'scac'),
  ]);
  const containers = findNumeric(flattened, 'containerCount', 6)
    ?? findNumeric(flattened, 'containersCount', 6)
    ?? findNumericByKeyPattern(flattened, /container(s)?_?count/i, 6);

  const origin = pickFirstDefined([
    valueAtPath(flattened, 'origin'),
    valueAtPath(flattened, 'originName'),
    valueAtPath(flattened, 'polName'),
    valueAtPath(flattened, 'attributes.port_of_lading_name'),
    valueAtPath(flattened, 'attributes.pol_name'),
    valueAtPath(flattened, 'ports.portOfLading.name'),
    valueAtPath(flattened, 'ports.portOfLading.locode'),
    findValueDeep(flattened, 'origin'),
    findValueDeep(flattened, 'originName'),
    findValueDeep(flattened, 'polName'),
  ]);
  const destination = pickFirstDefined([
    valueAtPath(flattened, 'destination'),
    valueAtPath(flattened, 'destinationName'),
    valueAtPath(flattened, 'podName'),
    valueAtPath(flattened, 'attributes.port_of_discharge_name'),
    valueAtPath(flattened, 'attributes.pod_name'),
    valueAtPath(flattened, 'ports.portOfDischarge.name'),
    valueAtPath(flattened, 'ports.portOfDischarge.locode'),
    findValueDeep(flattened, 'destination'),
    findValueDeep(flattened, 'destinationName'),
    findValueDeep(flattened, 'podName'),
  ]);

  const parts: string[] = [];
  if (scac) parts.push(`SCAC ${scac}`);
  if (containers !== undefined) {
    parts.push(`${containers} ${containers === 1 ? 'container' : 'containers'}`);
  }
  if (origin && destination) {
    parts.push(`${origin} -> ${destination}`);
  }
  return parts.join(' | ');
}

function unwrapSearchRow(row: Record<string, unknown>): Record<string, unknown> {
  const source = valueAtPath(row, '_source');
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return {
      ...source as Record<string, unknown>,
      ...row,
      id: row.id ?? row._id ?? (source as Record<string, unknown>).id,
      _id: row._id,
      _score: row._score,
      score: row.score,
    } as Record<string, unknown>;
  }
  const fields = valueAtPath(row, 'fields');
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    return {
      ...fields as Record<string, unknown>,
      ...row,
      id: row.id ?? row._id ?? (fields as Record<string, unknown>).id,
      _id: row._id,
    } as Record<string, unknown>;
  }
  return row;
}

function flattenSearchMetadata(row: Record<string, unknown>): Record<string, unknown> {
  const sourceLike = unwrapSearchRow(row);
  const result: Record<string, unknown> = { ...sourceLike };
  const metaType = valueAtPath(row, '_index');
  if (metaType !== undefined) result.type = result.type ?? metaType;
  return result;
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeRows(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items?: unknown }).items as Record<string, unknown>[];
  }
  const hitsValue = (data as { hits?: unknown }).hits;
  if (Array.isArray(hitsValue)) {
    return hitsValue as Record<string, unknown>[];
  }
  if (hitsValue && typeof hitsValue === 'object' && !Array.isArray(hitsValue)) {
    const nestedHits = (hitsValue as Record<string, unknown>).hits;
    if (Array.isArray(nestedHits)) return nestedHits as Record<string, unknown>[];
  }
  if (Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data?: unknown }).data as Record<string, unknown>[];
  }
  const singleData = (data as { data?: unknown }).data;
  if (singleData && typeof singleData === 'object' && !Array.isArray(singleData)) {
    return [singleData as Record<string, unknown>];
  }
  return [data as Record<string, unknown>];
}

function hasRenderableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function inferUnknownColumns(rows: Record<string, unknown>[]): ColumnDef[] {
  const selected: ColumnDef[] = [];
  for (const candidate of unknownColumnCandidates) {
    if (rows.some((row) => hasRenderableValue(valueAtPath(row, candidate.key)))) {
      selected.push(candidate);
    }
    if (selected.length >= 6) break;
  }
  if (selected.length > 0) return selected;

  const first = rows[0] ?? {};
  const firstKeys = Object.keys(first)
    .filter((key) => hasRenderableValue(first[key]))
    .slice(0, 6);
  if (firstKeys.length > 0) {
    return firstKeys.map((key) => ({ key, title: key }));
  }
  return resourceColumns.unknown;
}

function pickFirstDefined(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function enrichSearchRow(row: Record<string, unknown>): Record<string, unknown> {
  const flattened = flattenSearchMetadata(row);

  const reference = pickFirstDefined([
    valueAtPath(flattened, 'reference'),
    valueAtPath(flattened, 'referenceNumber'),
    valueAtPath(flattened, 'refNumber'),
    valueAtPath(flattened, 'requestNumber'),
    valueAtPath(flattened, 'request_number'),
    valueAtPath(flattened, 'billOfLading'),
    valueAtPath(flattened, 'number'),
    valueAtPath(flattened, 'containerNumber'),
    valueAtPath(flattened, 'trackingNumber'),
    valueAtPath(flattened, 'container_number'),
    valueAtPath(flattened, 'request'),
    valueAtPath(flattened, 'name'),
    valueAtPath(flattened, 'title'),
    findValueDeep(flattened, 'reference'),
    findValueDeep(flattened, 'referenceNumber'),
    findValueDeep(flattened, 'requestNumber'),
    findValueDeep(flattened, 'request_number'),
    findValueDeep(flattened, 'billOfLading'),
    findValueDeep(flattened, 'containerNumber'),
    findValueDeep(flattened, 'trackingNumber'),
  ]);

  const id = pickFirstDefined([
    valueAtPath(flattened, 'id'),
    valueAtPath(flattened, '_id'),
    valueAtPath(flattened, 'docId'),
    findValueDeep(flattened, 'id'),
    findValueDeep(flattened, '_id'),
  ]);

  const match = pickFirstDefined([
    valueAtPath(flattened, 'match'),
    valueAtPath(flattened, 'requestNumber'),
    valueAtPath(flattened, 'request_number'),
    valueAtPath(flattened, 'billOfLading'),
    valueAtPath(flattened, 'containerNumber'),
    valueAtPath(flattened, 'container_number'),
    valueAtPath(flattened, 'number'),
    valueAtPath(flattened, 'name'),
    valueAtPath(flattened, 'title'),
    valueAtPath(flattened, 'resource.name'),
    valueAtPath(flattened, 'resource.id'),
    valueAtPath(flattened, 'attributes.name'),
    valueAtPath(flattened, 'attributes.number'),
    valueAtPath(flattened, 'attributes.reference_number'),
    valueAtPath(flattened, 'attributes.bill_of_lading'),
    valueAtPath(flattened, 'attributes.requestNumber'),
    valueAtPath(flattened, 'attributes.request_number'),
    valueAtPath(flattened, 'query'),
    findValueDeep(flattened, 'name'),
    findValueDeep(flattened, 'title'),
    findValueDeep(flattened, 'resourceName'),
    findValueDeep(flattened, 'resource.title'),
    findValueDeep(flattened, 'attributes.name'),
    findValueDeep(flattened, 'attributes.number'),
    findValueDeep(flattened, 'reference_number'),
    findValueDeep(flattened, 'bill_of_lading'),
    findValueDeep(flattened, 'requestNumber'),
    findValueDeep(flattened, 'tracking_number'),
    findValueDeep(flattened, 'request_number'),
  ]);

  const status = pickFirstDefined([
    valueAtPath(flattened, 'status'),
    valueAtPath(flattened, 'state'),
    findValueDeep(flattened, 'status'),
    findValueDeep(flattened, 'state'),
    findValueDeep(flattened, 'lifecycle'),
  ]);

  const score = findNumeric(flattened, 'score', 6) ??
    findNumeric(flattened, '_score', 6) ??
    findNumeric(flattened, 'relevanceScore', 6) ??
    findNumeric(flattened, 'searchScore', 6) ??
    findNumeric(flattened, 'hitScore', 6) ??
    findNumericByKeyPattern(flattened, /score/i, 6);

  const resultType = deriveResultType(flattened, match);
  const resultId = deriveResultId(flattened, resultType);
  const details = deriveDetails(flattened);
  const finalReference = reference || match;
  const effectiveMatch = match || finalReference;
  const enriched: Record<string, unknown> = { ...flattened };
  if (finalReference) enriched.reference = finalReference;
  if (effectiveMatch) {
    enriched.match = effectiveMatch;
  }
  if (resultType) enriched.resultType = resultType;
  if (resultId) enriched.resultId = resultId;
  if (details) enriched.details = details;
  if (score !== undefined) enriched.score = score;
  if (status) enriched.status = status;
  if (id) enriched.id = id;
  return enriched;
}

function resolveResource(command: string): Resource {
  if (command.includes('container')) return 'containers';
  if (command.includes('shipment')) return 'shipments';
  if (command.includes('tracking-request') || command.includes('track')) return 'tracking-requests';
  if (command.includes('shipping-line')) return 'shipping-lines';
  if (command.includes('search')) return 'search';
  return 'unknown';
}

export function renderTable(command: string, data: unknown): string {
  const rows = normalizeRows(data);
  const resource = resolveResource(command);
  const baseCols = resourceColumns[resource] || resourceColumns.unknown;
  const commandIsSearch = command.includes('search');
  if (rows.length === 0) {
    return 'No rows.\n';
  }

  const renderedRows = commandIsSearch ? rows.map(enrichSearchRow) : rows;
  const cols = resource === 'unknown' ? inferUnknownColumns(renderedRows) : baseCols;

  const table = new Table({
    head: cols.map((c) => c.title),
    style: { head: [], border: [] },
    wordWrap: true,
  });

  renderedRows.forEach((row) => {
    table.push(cols.map((column) => formatCell(valueAtPath(row, column.key))));
  });

  return `${table.toString()}\n`;
}
