/**
 * MCP Server for Terminal49 API
 *
 * This module provides Model Context Protocol tools for accessing the Terminal49 API.
 */

import * as tools from './tools/index.js';

export { tools };

// Export individual tool modules for easier access
export * from './tools/index.js';

/**
 * All available MCP tools
 */
export const allTools = {
  // Shipments
  listShipments: tools.listShipments,
  getShipment: tools.getShipment,
  stopTracking: tools.stopTracking,
  resumeTracking: tools.resumeTracking,

  // Containers
  getContainer: tools.getContainer,
  refreshContainer: tools.refreshContainer,
  getContainerEvents: tools.getContainerEvents,
  getTransportEvents: tools.getTransportEvents,
  getContainerRoute: tools.getContainerRoute,

  // Tracking Requests
  createTrackingRequest: tools.createTrackingRequest,
  getTrackingRequest: tools.getTrackingRequest,
  listTrackingRequests: tools.listTrackingRequests,

  // Webhooks
  createWebhook: tools.createWebhook,
  updateWebhook: tools.updateWebhook,
  deleteWebhook: tools.deleteWebhook,
  getWebhook: tools.getWebhook,
  listWebhooks: tools.listWebhooks,
  getWebhookIps: tools.getWebhookIps,
  listWebhookNotifications: tools.listWebhookNotifications,
  getWebhookNotification: tools.getWebhookNotification,
  getWebhookExamples: tools.getWebhookExamples,

  // Ports
  getPort: tools.getPort,

  // Terminals
  getTerminal: tools.getTerminal,

  // Vessels
  getVessel: tools.getVessel,
  getVesselByImo: tools.getVesselByImo,
  getVesselFuturePositions: tools.getVesselFuturePositions,
  getVesselFuturePositionsWithCoordinates: tools.getVesselFuturePositionsWithCoordinates,

  // Shipping Lines
  getShippingLine: tools.getShippingLine,
  listShippingLines: tools.listShippingLines,

  // Parties
  getParty: tools.getParty,
  listParties: tools.listParties,

  // Metro Areas
  getMetroArea: tools.getMetroArea,
};

export default allTools;
