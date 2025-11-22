/**
 * MCP tools for Shipments API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapShipmentDocument, mapShipmentsCollection } from '../../jsonapi/mappers/index.js';
import type { Shipment } from '../../domain/index.js';

export interface ListShipmentsArgs {
  page?: number;
  pageSize?: number;
  include?: string[];
  search?: string;
  tags?: string[];
  shippingLineScac?: string;
}

export interface GetShipmentArgs {
  id: string;
  include?: string[];
}

export interface StopTrackingArgs {
  id: string;
  reason?: string;
}

export interface ResumeTrackingArgs {
  id: string;
}

/**
 * List shipments with optional filters and pagination
 */
export async function listShipments(args: ListShipmentsArgs = {}): Promise<Shipment[]> {
  const includeParam = args.include?.join(',') || 'containers,port_of_lading,port_of_discharge';

  const query: Record<string, string | number> = {
    include: includeParam,
  };

  if (args.page) query['page[number]'] = args.page;
  if (args.pageSize) query['page[size]'] = args.pageSize;
  if (args.search) query['q[search]'] = args.search;
  if (args.tags?.length) query['q[tags]'] = args.tags.join(',');
  if (args.shippingLineScac) query['q[shipping_line_scac]'] = args.shippingLineScac;

  const data = await makeRequest('/shipments', { query });
  return mapShipmentsCollection(data);
}

/**
 * Get a single shipment by ID
 */
export async function getShipment(args: GetShipmentArgs): Promise<Shipment> {
  const includeParam = args.include?.join(',') || 'containers,port_of_lading,port_of_discharge';

  const data = await makeRequest(`/shipments/${args.id}`, {
    query: { include: includeParam },
  });

  return mapShipmentDocument(data);
}

/**
 * Stop tracking a shipment
 */
export async function stopTracking(args: StopTrackingArgs): Promise<Shipment> {
  const body = args.reason ? { reason: args.reason } : undefined;

  const data = await makeRequest(`/shipments/${args.id}/stop_tracking`, {
    method: 'POST',
    body,
  });

  return mapShipmentDocument(data);
}

/**
 * Resume tracking a shipment
 */
export async function resumeTracking(args: ResumeTrackingArgs): Promise<Shipment> {
  const data = await makeRequest(`/shipments/${args.id}/resume_tracking`, {
    method: 'POST',
  });

  return mapShipmentDocument(data);
}
