/**
 * One-time list display column catalog resource.
 *
 * The list_* tools used to inline this ~2KB catalog on every response. It is
 * static, so it now lives here and is exposed once as an MCP resource. The
 * per-call `_response_contract.display` only carries the lightweight defaults
 * plus `column_catalog_resource` pointing at this URI.
 */

export type ListDisplayColumn = {
  key: string;
  label: string;
  path?: string;
  description?: string;
  compute?: string;
};

export const listDisplayColumnsResource = {
  uri: 'terminal49://docs/list-display-columns',
  name: 'List Display Column Catalog',
  description:
    'Full column catalog for list_containers / list_shipments / list_tracking_requests responses. ' +
    'Fetch once; per-call contracts reference this by URI instead of inlining the catalog.',
  mimeType: 'application/json',
};

const CONTAINER_LIST_COLUMNS: ListDisplayColumn[] = [
  { key: 'number', label: 'Container', path: 'number' },
  { key: 'currentStatus', label: 'Status', path: 'currentStatus' },
  { key: 'podDischargedAt', label: 'Discharged', path: 'podDischargedAt' },
  { key: 'podFullOutAt', label: 'Picked Up', path: 'podFullOutAt' },
  { key: 'availableForPickup', label: 'Ready', path: 'availableForPickup' },
  { key: 'pickupLfd', label: 'LFD', path: 'pickupLfd' },
  {
    key: 'pickupAppointmentAt',
    label: 'Pickup Appt',
    path: 'pickupAppointmentAt',
  },
  {
    key: 'holdsCount',
    label: 'Holds',
    path: 'holdsAtPodTerminal',
    compute: 'length',
    description: 'Count of active holds at POD terminal',
  },
  {
    key: 'holdsAtPodTerminal',
    label: 'Hold Details',
    path: 'holdsAtPodTerminal',
  },
  {
    key: 'feesCount',
    label: 'Fees',
    path: 'feesAtPodTerminal',
    compute: 'length',
    description: 'Count of fee items at POD terminal',
  },
  {
    key: 'locationAtPodTerminal',
    label: 'Terminal Location',
    path: 'locationAtPodTerminal',
  },
  {
    key: 'terminals.podTerminal.name',
    label: 'POD Terminal',
    path: 'terminals.podTerminal.name',
  },
  { key: 'shipment.billOfLading', label: 'BL', path: 'shipment.billOfLading' },
  {
    key: 'shipment.shippingLineScac',
    label: 'SCAC',
    path: 'shipment.shippingLineScac',
  },
  {
    key: 'podRailCarrierScac',
    label: 'Rail Carrier',
    path: 'podRailCarrierScac',
  },
  { key: 'indEtaAt', label: 'Inland ETA', path: 'indEtaAt' },
  { key: 'indAtaAt', label: 'Inland ATA', path: 'indAtaAt' },
];

const SHIPMENT_LIST_COLUMNS: ListDisplayColumn[] = [
  { key: 'billOfLading', label: 'BL', path: 'billOfLading' },
  { key: 'shippingLineScac', label: 'SCAC', path: 'shippingLineScac' },
  { key: 'shippingLineName', label: 'Carrier', path: 'shippingLineName' },
  { key: 'podVesselName', label: 'Vessel', path: 'podVesselName' },
  { key: 'podVoyageNumber', label: 'Voyage', path: 'podVoyageNumber' },
  { key: 'portOfDischargeName', label: 'POD', path: 'portOfDischargeName' },
  { key: 'podEtaAt', label: 'POD ETA', path: 'podEtaAt' },
  { key: 'podAtaAt', label: 'POD ATA', path: 'podAtaAt' },
  { key: 'destinationName', label: 'Destination', path: 'destinationName' },
  { key: 'destinationEtaAt', label: 'Dest ETA', path: 'destinationEtaAt' },
  {
    key: 'lineTrackingLastSucceededAt',
    label: 'Last Update',
    path: 'lineTrackingLastSucceededAt',
  },
];

const TRACKING_REQUEST_LIST_COLUMNS: ListDisplayColumn[] = [
  { key: 'requestNumber', label: 'Request Number', path: 'requestNumber' },
  { key: 'requestType', label: 'Type', path: 'requestType' },
  { key: 'status', label: 'Status', path: 'status' },
  { key: 'scac', label: 'SCAC', path: 'scac' },
  { key: 'createdAt', label: 'Created', path: 'createdAt' },
  { key: 'updatedAt', label: 'Updated', path: 'updatedAt' },
  { key: 'failedReason', label: 'Failure Reason', path: 'failedReason' },
  { key: 'isRetrying', label: 'Retrying', path: 'isRetrying' },
];

export const LIST_DISPLAY_COLUMN_CATALOG = {
  container: CONTAINER_LIST_COLUMNS,
  shipment: SHIPMENT_LIST_COLUMNS,
  tracking_request: TRACKING_REQUEST_LIST_COLUMNS,
} as const;

export function readListDisplayColumnsResource(): string {
  return JSON.stringify(LIST_DISPLAY_COLUMN_CATALOG, null, 2);
}
