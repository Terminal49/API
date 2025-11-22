/**
 * MCP tools for Containers API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapContainerDocument, mapCollection } from '../../jsonapi/mappers/index.js';
import type { Container, ContainerEvent, TransportEvent } from '../../domain/index.js';

export interface GetContainerArgs {
  id: string;
  include?: string[];
}

export interface RefreshContainerArgs {
  id: string;
}

export interface GetContainerEventsArgs {
  id: string;
}

export interface GetTransportEventsArgs {
  id: string;
}

export interface GetContainerRouteArgs {
  id: string;
}

/**
 * Get a single container by ID
 */
export async function getContainer(args: GetContainerArgs): Promise<Container> {
  const includeParam = args.include?.join(',') || 'shipment,terminal';

  const data = await makeRequest(`/containers/${args.id}`, {
    query: { include: includeParam },
  });

  return mapContainerDocument(data);
}

/**
 * Refresh container data from shipping line
 */
export async function refreshContainer(args: RefreshContainerArgs): Promise<Container> {
  const data = await makeRequest(`/containers/${args.id}/refresh`, {
    method: 'POST',
  });

  return mapContainerDocument(data);
}

/**
 * Get container raw events
 */
export async function getContainerEvents(args: GetContainerEventsArgs): Promise<ContainerEvent[]> {
  const data = await makeRequest(`/containers/${args.id}/raw_events`);
  return mapCollection<ContainerEvent>(data);
}

/**
 * Get container transport events (AIS-based)
 */
export async function getTransportEvents(args: GetTransportEventsArgs): Promise<TransportEvent[]> {
  const data = await makeRequest(`/containers/${args.id}/transport_events`);
  return mapCollection<TransportEvent>(data);
}

/**
 * Get container route information
 */
export async function getContainerRoute(args: GetContainerRouteArgs): Promise<unknown> {
  return await makeRequest(`/containers/${args.id}/route`);
}
