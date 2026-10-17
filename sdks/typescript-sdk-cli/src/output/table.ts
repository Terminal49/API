/**
 * Table renderer for TTY output.
 *
 * Uses cli-table3 to render resource-specific tables.
 * Each resource type (container, shipment, tracking request)
 * has its own column definition.
 */

import Table from 'cli-table3';

/** A column reads the first renderable `key` path, or computes its cell with `value`. */
type ColumnDef =
  | { title: string; key: string | string[] }
  | { title: string; value: (row: Record<string, unknown>) => unknown };

const ROUTE_PORT_COLUMNS: ColumnDef[] = [
  { key: 'sequence', title: 'Seq' },
  { key: 'label', title: 'Label' },
  { key: 'name', title: 'Port' },
  { key: 'countryCode', title: 'Country' },
  { key: 'inbound.eta', title: 'Inbound ETA' },
  { key: 'inbound.ata', title: 'Inbound ATA' },
  { key: 'outbound.etd', title: 'Outbound ETD' },
  { key: 'outbound.atd', title: 'Outbound ATD' },
];

const ROUTE_VESSEL_COLUMNS: ColumnDef[] = [
  { key: 'name', title: 'Vessel' },
  { key: 'imo', title: 'IMO' },
  { key: 'voyage', title: 'Voyage' },
  { key: 'coordinates.latitude', title: 'Latitude' },
  { key: 'coordinates.longitude', title: 'Longitude' },
  { key: 'heading', title: 'Heading' },
  { key: 'speed', title: 'Speed (kn)' },
  { key: 'positionAt', title: 'Position At' },
];

const FUTURE_POSITION_COLUMNS: ColumnDef[] = [
  { key: 'timestamp', title: 'Timestamp' },
  { key: 'latitude', title: 'Latitude' },
  { key: 'longitude', title: 'Longitude' },
  { key: 'heading', title: 'Heading' },
  { key: 'estimated', title: 'Estimated' },
];

const WEBHOOK_COLUMNS: ColumnDef[] = [
  { key: 'id', title: 'ID' },
  { key: 'attributes.url', title: 'URL' },
  { key: 'attributes.active', title: 'Active' },
  {
    title: 'Events',
    value: (row) => {
      const events = valueAtPath(row, 'attributes.events');
      return Array.isArray(events) ? events.length : undefined;
    },
  },
];

/**
 * Mapped `CustomField` rows from the entity custom-fields commands, or raw
 * `custom_field` resources with their included definition (see `withDefinitions`).
 */
const CUSTOM_FIELD_COLUMNS: ColumnDef[] = [
  { key: 'id', title: 'ID' },
  { key: ['slug', 'attributes.api_slug'], title: 'Slug' },
  { key: ['name', 'definition.attributes.display_name'], title: 'Name' },
  {
    key: [
      'displayValue',
      'attributes.display_value',
      'value',
      'attributes.value',
    ],
    title: 'Value',
  },
  { key: ['dataType', 'definition.attributes.data_type'], title: 'Data Type' },
];

/** Raw `custom_field` resources, which carry no definition name or data type. */
const CUSTOM_FIELD_RECORD_COLUMNS: ColumnDef[] = [
  { key: 'id', title: 'ID' },
  { key: 'attributes.api_slug', title: 'Slug' },
  {
    key: ['attributes.display_value', 'attributes.value'],
    title: 'Value',
  },
  { key: 'attributes.updated_at', title: 'Updated' },
];

const CUSTOM_FIELD_OPTION_COLUMNS: ColumnDef[] = [
  { key: 'id', title: 'ID' },
  { key: 'attributes.label', title: 'Label' },
  { key: 'attributes.value', title: 'Value' },
  { key: 'attributes.position', title: 'Position' },
];

const commandColumns: Record<string, ColumnDef[]> = {
  'shipments.list': [
    { key: 'id', title: 'ID' },
    { key: ['billOfLading', 'attributes.bill_of_lading_number'], title: 'BOL' },
    {
      key: ['shippingLineScac', 'attributes.shipping_line_scac'],
      title: 'SCAC',
    },
    { key: ['customerName', 'attributes.customer_name'], title: 'Customer' },
    {
      key: [
        'portOfDischargeName',
        'ports.portOfDischarge.name',
        'attributes.port_of_discharge_name',
      ],
      title: 'POD',
    },
    {
      key: ['podEtaAt', 'ports.portOfDischarge.eta', 'attributes.pod_eta_at'],
      title: 'POD ETA',
    },
    {
      key: [
        'tracking.lineTrackingStoppedReason',
        'attributes.line_tracking_stopped_reason',
      ],
      title: 'Tracking Stopped',
    },
  ],
  'webhooks.list': WEBHOOK_COLUMNS,
  'webhooks.create': WEBHOOK_COLUMNS,
  'webhooks.update': WEBHOOK_COLUMNS,
  'shipments.custom-fields': CUSTOM_FIELD_COLUMNS,
  'containers.custom-fields': CUSTOM_FIELD_COLUMNS,
  'shipments.set-custom-field': CUSTOM_FIELD_RECORD_COLUMNS,
  'containers.set-custom-field': CUSTOM_FIELD_RECORD_COLUMNS,
  'custom-fields.list': CUSTOM_FIELD_RECORD_COLUMNS,
  'custom-fields.create': CUSTOM_FIELD_RECORD_COLUMNS,
  'custom-fields.update': CUSTOM_FIELD_RECORD_COLUMNS,
  'custom-field-options.list': CUSTOM_FIELD_OPTION_COLUMNS,
  'custom-field-options.create': CUSTOM_FIELD_OPTION_COLUMNS,
  'custom-field-options.update': CUSTOM_FIELD_OPTION_COLUMNS,
  'containers.list': [
    { key: 'id', title: 'ID' },
    { key: ['number', 'attributes.number'], title: 'Number' },
    { key: ['status', 'attributes.current_status'], title: 'Status' },
    { key: ['equipment.type', 'attributes.equipment_type'], title: 'Type' },
    { key: ['equipment.length', 'attributes.equipment_length'], title: 'Len' },
    {
      key: ['location.currentLocation', 'attributes.location_at_pod_terminal'],
      title: 'Location',
    },
    { key: 'terminals.podTerminal.name', title: 'POD Terminal' },
  ],
  'containers.events': [
    { key: ['timestamp', 'attributes.timestamp'], title: 'Timestamp' },
    { key: ['event', 'attributes.event'], title: 'Event' },
    {
      key: [
        'location.name',
        'location.locode',
        'attributes.locationLocode',
        'attributes.location_locode',
      ],
      title: 'Location',
    },
    { key: ['terminal.name', 'terminal.nickname'], title: 'Terminal' },
  ],
  'containers.raw-events': [
    { key: ['timestamp', 'attributes.timestamp'], title: 'Timestamp' },
    { key: ['event', 'attributes.event'], title: 'Event' },
    { key: ['dataSource', 'attributes.data_source'], title: 'Source' },
    { key: ['value', 'attributes.value'], title: 'Value' },
  ],
  'containers.demurrage': [
    { key: 'container_id', title: 'Container ID' },
    { key: 'pickup_lfd', title: 'Pickup LFD' },
    { key: 'pickup_appointment_at', title: 'Appointment' },
    { key: 'available_for_pickup', title: 'Available' },
    { key: 'pod_arrived_at', title: 'POD Arrived' },
    { key: 'pod_discharged_at', title: 'POD Discharged' },
  ],
  'containers.rail': [
    { key: 'container_id', title: 'Container ID' },
    { key: 'pod_rail_carrier_scac', title: 'POD Rail' },
    { key: 'ind_rail_carrier_scac', title: 'IND Rail' },
    { key: 'pod_rail_loaded_at', title: 'POD Loaded' },
    { key: 'pod_rail_departed_at', title: 'POD Departed' },
    { key: 'ind_rail_arrived_at', title: 'IND Arrived' },
    { key: 'ind_rail_unloaded_at', title: 'IND Unloaded' },
  ],
  'tracking-requests.list': [
    { key: 'id', title: 'ID' },
    { key: ['requestType', 'attributes.request_type'], title: 'Type' },
    { key: ['requestNumber', 'attributes.request_number'], title: 'Number' },
    { key: ['scac', 'attributes.scac'], title: 'SCAC' },
    { key: ['status', 'attributes.status'], title: 'Status' },
  ],
  search: [
    { key: 'match', title: 'Match' },
    { key: 'resultType', title: 'Result Type' },
    { key: 'resultId', title: 'Result ID' },
    { key: 'status', title: 'Status' },
    { key: 'details', title: 'Details' },
    { key: 'score', title: 'Score' },
  ],
  commands: [
    { key: 'name', title: 'Command' },
    { key: 'description', title: 'Description' },
    {
      title: 'Subcommands',
      value: (row) => {
        const subcommands = row.subcommands;
        return Array.isArray(subcommands)
          ? subcommands.map((subcommand) => asRecord(subcommand)?.name)
          : undefined;
      },
    },
  ],
  'shipping-lines.list': [
    { key: ['scac', 'attributes.scac'], title: 'SCAC' },
    { key: ['name', 'attributes.name'], title: 'Name' },
    { key: ['shortName', 'attributes.short_name'], title: 'Short Name' },
  ],
};

const fallbackColumns: ColumnDef[] = [{ key: 'id', title: 'ID' }];

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
  { key: 'attributes.label', title: 'Label' },
  { key: 'attributes.url', title: 'URL' },
  { key: ['attributes.display_value', 'attributes.value'], title: 'Value' },
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

function valueForColumn(
  row: Record<string, unknown>,
  column: ColumnDef,
): unknown {
  if ('value' in column) return column.value(row);
  const keys = Array.isArray(column.key) ? column.key : [column.key];
  for (const key of keys) {
    const value = valueAtPath(row, key);
    if (hasRenderableValue(value)) return value;
  }
  return undefined;
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

function findNumeric(
  input: unknown,
  key: string,
  depth = 2,
): number | undefined {
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
  if (
    !normalized ||
    normalized === 'search_result' ||
    normalized === 'search-result'
  ) {
    return '';
  }
  if (normalized.includes('shipment')) return 'shipment';
  if (normalized.includes('container')) return 'container';
  if (normalized.includes('tracking')) return 'tracking_request';
  if (normalized.includes('bill')) return 'shipment';
  if (normalized.includes('booking')) return 'tracking_request';
  return normalized.replace(/\s+/g, '_');
}

function deriveResultType(
  flattened: Record<string, unknown>,
  match: string,
): string {
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

function deriveResultId(
  flattened: Record<string, unknown>,
  resultType: string,
): string {
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
  const containers =
    findNumeric(flattened, 'containerCount', 6) ??
    findNumeric(flattened, 'containersCount', 6) ??
    findNumericByKeyPattern(flattened, /container(s)?_?count/i, 6);

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
    parts.push(
      `${containers} ${containers === 1 ? 'container' : 'containers'}`,
    );
  }
  if (origin && destination) {
    parts.push(`${origin} -> ${destination}`);
  }
  return parts.join(' | ');
}

function unwrapSearchRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const source = valueAtPath(row, '_source');
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return {
      ...(source as Record<string, unknown>),
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
      ...(fields as Record<string, unknown>),
      ...row,
      id: row.id ?? row._id ?? (fields as Record<string, unknown>).id,
      _id: row._id,
    } as Record<string, unknown>;
  }
  return row;
}

function flattenSearchMetadata(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const sourceLike = unwrapSearchRow(row);
  const result: Record<string, unknown> = { ...sourceLike };
  const metaType = valueAtPath(row, '_index');
  if (metaType !== undefined) result.type = result.type ?? metaType;
  return result;
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number')
    return String(value);
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
    if (Array.isArray(nestedHits))
      return nestedHits as Record<string, unknown>[];
  }
  if (Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data?: unknown }).data as Record<string, unknown>[];
  }
  const singleData = (data as { data?: unknown }).data;
  if (
    singleData &&
    typeof singleData === 'object' &&
    !Array.isArray(singleData)
  ) {
    return [singleData as Record<string, unknown>];
  }
  return [data as Record<string, unknown>];
}

function hasRenderableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object')
    return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function inferUnknownColumns(rows: Record<string, unknown>[]): ColumnDef[] {
  const selected: ColumnDef[] = [];
  for (const candidate of unknownColumnCandidates) {
    if (
      rows.some((row) => hasRenderableValue(valueForColumn(row, candidate)))
    ) {
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
  return fallbackColumns;
}

function pickFirstDefined(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function enrichSearchRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
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

  const score =
    findNumeric(flattened, 'score', 6) ??
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Rows of the mapped half of a `{ raw, mapped }` pair, or of the data itself. */
function tableRows(data: unknown): Record<string, unknown>[] {
  const record = asRecord(data);
  return normalizeRows(
    record && 'raw' in record && 'mapped' in record ? record.mapped : data,
  );
}

/** Attaches each raw `custom_field` row's included `custom_field_definition` as `definition`. */
function withDefinitions(
  data: unknown,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const included = asRecord(data)?.included;
  if (!Array.isArray(included)) return rows;
  const definitions = new Map(
    included
      .map(asRecord)
      .filter((resource) => resource?.type === 'custom_field_definition')
      .map((resource) => [resource?.id, resource]),
  );
  return rows.map((row) => {
    const definition = definitions.get(
      valueAtPath(row, 'relationships.definition.data.id'),
    );
    return definition ? { ...row, definition } : row;
  });
}

/** Ports table plus a current-vessel table, from a `{ ports }` route or a `{ raw, mapped }` pair; undefined for raw GeoJSON. */
function renderRoute(data: unknown): string | undefined {
  const record = asRecord(data);
  const route = asRecord(record?.mapped) ?? record;
  if (!Array.isArray(route?.ports)) return undefined;

  const ports = renderRows(
    route.ports as Record<string, unknown>[],
    ROUTE_PORT_COLUMNS,
  );
  const vessel = asRecord(route.currentVessel);
  if (!vessel) return ports;
  return `${ports}Current vessel\n${renderRows([vessel], ROUTE_VESSEL_COLUMNS)}`;
}

/** A positions table under a vessel line, from a mapped vessel, a `{ raw, mapped }` pair, or the raw document. */
function renderFuturePositions(data: unknown): string | undefined {
  const record = asRecord(data);
  const mapped = asRecord(record?.mapped) ?? record;
  const vessel = asRecord(asRecord(mapped?.data)?.attributes) ?? mapped;
  if (!Array.isArray(vessel?.positions)) return undefined;

  const imo = hasRenderableValue(vessel.imo)
    ? ` (IMO ${formatCell(vessel.imo)})`
    : '';
  const header = `Vessel ${formatCell(vessel.name)}${imo}\n`;
  return `${header}${renderRows(
    vessel.positions as Record<string, unknown>[],
    FUTURE_POSITION_COLUMNS,
  )}`;
}

function isSearchCommand(command: string): boolean {
  return command === 'search' || command.startsWith('search.');
}

function isDetailCommand(command: string): boolean {
  return (
    command.endsWith('.get') ||
    command.endsWith('.get-by-imo') ||
    command.startsWith('config.')
  );
}

function unwrapDetailObject(
  data: unknown,
): Record<string, unknown> | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return undefined;

  const record = data as Record<string, unknown>;
  const jsonApiData = record.data;
  if (
    jsonApiData &&
    typeof jsonApiData === 'object' &&
    !Array.isArray(jsonApiData)
  ) {
    const resource = jsonApiData as Record<string, unknown>;
    const attributes = resource.attributes;
    return {
      id: resource.id,
      type: resource.type,
      ...(attributes &&
      typeof attributes === 'object' &&
      !Array.isArray(attributes)
        ? (attributes as Record<string, unknown>)
        : {}),
    };
  }

  return record;
}

function flattenDetailRows(
  value: Record<string, unknown>,
  prefix = '',
  depth = 2,
): Array<[string, unknown]> {
  const rows: Array<[string, unknown]> = [];
  for (const [key, item] of Object.entries(value)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (depth > 0 && item && typeof item === 'object' && !Array.isArray(item)) {
      rows.push(
        ...flattenDetailRows(item as Record<string, unknown>, label, depth - 1),
      );
    } else if (hasRenderableValue(item)) {
      rows.push([label, item]);
    }
  }
  return rows;
}

function renderDetail(data: unknown): string | undefined {
  const detail = unwrapDetailObject(data);
  if (!detail) return undefined;

  const rows = flattenDetailRows(detail);
  if (rows.length === 0) return 'No rows.\n';

  const table = new Table({
    style: { head: [], border: [] },
    wordWrap: true,
  });

  rows.forEach(([key, value]) => {
    table.push([key, formatCell(value)]);
  });

  return `${table.toString()}\n`;
}

/** The value at `parts`, collected across every array the path passes through. */
function valuesAtPath(value: unknown, parts: string[]): unknown {
  if (parts.length === 0 || value === null || value === undefined) return value;
  if (Array.isArray(value))
    return value.flatMap((item) => valuesAtPath(item, parts) ?? []);
  const record = asRecord(value);
  if (!record) return undefined;
  const [head, ...tail] = parts;
  return valuesAtPath(record[head], tail);
}

/**
 * The table for a `--fields` projection: one column per field path, titled by
 * the path as typed. Rows are the first array the paths share, starting from
 * the rows `projectFields` projected (a list's array or `items`), so
 * `--fields data.id` on a raw list and `--fields ports.name` on a route both
 * give one row per element.
 */
function renderProjected(data: unknown, fields: string[]): string {
  if (!hasRenderableValue(data)) return 'No rows.\n';
  const paths = fields.map((field) => field.split('.'));
  const shared = paths.reduce((prefix, parts) => {
    const mismatch = prefix.findIndex((part, index) => parts[index] !== part);
    return mismatch === -1 ? prefix : prefix.slice(0, mismatch);
  });

  const maxDepth = Math.min(
    shared.length,
    ...paths.map((parts) => parts.length - 1),
  );

  const itemsRoot = asRecord(data)?.items;
  let rows: unknown = Array.isArray(itemsRoot) ? itemsRoot : data;
  let depth = 0;
  while (!Array.isArray(rows) && depth < maxDepth) {
    const next = asRecord(rows)?.[shared[depth]];
    if (!Array.isArray(next) && !asRecord(next)) break;
    rows = next;
    depth += 1;
  }
  if (!Array.isArray(rows)) {
    rows = [data];
    depth = 0;
  }

  return renderRows(
    rows as Record<string, unknown>[],
    paths.map((parts, index) => ({
      title: fields[index],
      value: (row) => valuesAtPath(row, parts.slice(depth)),
    })),
  );
}

/**
 * Renders `data` for a TTY. Pass the `--fields` paths when they narrowed the
 * data, so the table shows those fields instead of the command's columns.
 */
export function renderTable(
  command: string,
  data: unknown,
  { fields = [] }: { fields?: string[] } = {},
): string {
  if (fields.length > 0) return renderProjected(data, fields);

  if (isDetailCommand(command)) {
    const detail = renderDetail(data);
    if (detail) return detail;
  }

  if (command === 'containers.route') {
    const route = renderRoute(data);
    if (route) return route;
  }

  if (
    command === 'vessels.future-positions' ||
    command === 'vessels.future-positions-coords'
  ) {
    const positions = renderFuturePositions(data);
    if (positions) return positions;
  }

  const rows = tableRows(data);
  const renderedRows = isSearchCommand(command)
    ? rows.map(enrichSearchRow)
    : command.endsWith('.custom-fields')
      ? withDefinitions(data, rows)
      : rows;
  return renderRows(
    renderedRows,
    commandColumns[command] ?? inferUnknownColumns(renderedRows),
  );
}

function renderRows(
  rows: Record<string, unknown>[],
  cols: ColumnDef[],
): string {
  if (rows.length === 0) {
    return 'No rows.\n';
  }

  const table = new Table({
    head: cols.map((c) => c.title),
    style: { head: [], border: [] },
    wordWrap: true,
  });

  rows.forEach((row) => {
    table.push(cols.map((column) => formatCell(valueForColumn(row, column))));
  });

  return `${table.toString()}\n`;
}
