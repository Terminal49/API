/**
 * MCP tools for Vessels API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument, mapCollection } from '../../jsonapi/mappers/index.js';
import type { Vessel, VesselFuturePosition, VesselFuturePositionWithCoordinates } from '../../domain/index.js';

export interface GetVesselByIdArgs {
  id: string;
}

export interface GetVesselByImoArgs {
  imo: string;
}

export interface GetVesselFuturePositionsArgs {
  id: string;
  portId: string;
  previousPortId: string;
}

export interface GetVesselFuturePositionsWithCoordinatesArgs {
  id: string;
  portId: string;
  previousPortId: string;
  latitude: number;
  longitude: number;
}

/**
 * Get a vessel by ID
 */
export async function getVessel(args: GetVesselByIdArgs): Promise<Vessel> {
  const data = await makeRequest(`/vessels/${args.id}`);
  return mapDocument<Vessel>(data);
}

/**
 * Get a vessel by IMO number
 */
export async function getVesselByImo(args: GetVesselByImoArgs): Promise<Vessel> {
  const data = await makeRequest(`/vessels/${args.imo}`);
  return mapDocument<Vessel>(data);
}

/**
 * Get vessel future positions
 */
export async function getVesselFuturePositions(args: GetVesselFuturePositionsArgs): Promise<VesselFuturePosition[]> {
  const query = {
    port_id: args.portId,
    previous_port_id: args.previousPortId,
  };

  const data = await makeRequest(`/vessels/${args.id}/future_positions`, { query });
  return mapCollection<VesselFuturePosition>(data);
}

/**
 * Get vessel future positions with coordinates
 */
export async function getVesselFuturePositionsWithCoordinates(
  args: GetVesselFuturePositionsWithCoordinatesArgs
): Promise<VesselFuturePositionWithCoordinates[]> {
  const query = {
    port_id: args.portId,
    previous_port_id: args.previousPortId,
    latitude: args.latitude,
    longitude: args.longitude,
  };

  const data = await makeRequest(`/vessels/${args.id}/future_positions_with_coordinates`, { query });
  return mapCollection<VesselFuturePositionWithCoordinates>(data);
}
