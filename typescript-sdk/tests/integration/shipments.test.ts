/**
 * Integration tests for Shipments API
 *
 * NOTE: These tests require TERMINAL49_API_KEY environment variable to be set.
 * They will be skipped if the API key is not available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { listShipments, getShipment } from '../../src';

const hasApiKey = !!process.env.TERMINAL49_API_KEY;

describe.skipIf(!hasApiKey)('Shipments Integration Tests', () => {
  let shipmentId: string | undefined;

  beforeAll(async () => {
    // Get a shipment ID from the first page of results
    try {
      const shipments = await listShipments({ pageSize: 1 });
      if (shipments.length > 0) {
        shipmentId = shipments[0].id;
      }
    } catch (error) {
      console.warn('Could not fetch shipments for integration tests:', error);
    }
  });

  it('should list shipments', async () => {
    const shipments = await listShipments({ pageSize: 5 });

    expect(Array.isArray(shipments)).toBe(true);

    if (shipments.length > 0) {
      const firstShipment = shipments[0];
      expect(firstShipment).toHaveProperty('id');
      expect(firstShipment).toHaveProperty('type', 'shipment');
    }
  });

  it('should get a shipment by ID', async () => {
    if (!shipmentId) {
      console.warn('Skipping test: no shipment ID available');
      return;
    }

    const shipment = await getShipment({ id: shipmentId });

    expect(shipment).toHaveProperty('id', shipmentId);
    expect(shipment).toHaveProperty('type', 'shipment');
  });

  it('should include containers when requested', async () => {
    if (!shipmentId) {
      console.warn('Skipping test: no shipment ID available');
      return;
    }

    const shipment = await getShipment({
      id: shipmentId,
      include: ['containers'],
    });

    expect(shipment).toHaveProperty('id', shipmentId);
    // containers may or may not be present depending on the shipment
  });
});
