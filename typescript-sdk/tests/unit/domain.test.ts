/**
 * Tests for domain models
 */

import { describe, it, expect } from 'vitest';
import type { Shipment, Container, Port, Vessel } from '../../src/domain';

describe('Domain Models', () => {
  it('should create a valid Shipment', () => {
    const shipment: Shipment = {
      id: 'ship-123',
      type: 'shipment',
      billOfLadingNumber: 'BOL123',
      customerName: 'ACME Corp',
      shippingLineScac: 'OOLU',
    };

    expect(shipment.id).toBe('ship-123');
    expect(shipment.type).toBe('shipment');
  });

  it('should create a valid Container', () => {
    const container: Container = {
      id: 'cont-123',
      type: 'container',
      containerNumber: 'CONT123',
      sizeTypeCode: '40HC',
      availableForPickup: true,
    };

    expect(container.id).toBe('cont-123');
    expect(container.type).toBe('container');
  });

  it('should create a valid Port', () => {
    const port: Port = {
      id: 'port-123',
      type: 'port',
      name: 'Port of Los Angeles',
      locode: 'USLAX',
      countryCode: 'US',
    };

    expect(port.id).toBe('port-123');
    expect(port.type).toBe('port');
  });

  it('should create a valid Vessel', () => {
    const vessel: Vessel = {
      id: 'vessel-123',
      type: 'vessel',
      name: 'EVER FORWARD',
      imo: '9850551',
    };

    expect(vessel.id).toBe('vessel-123');
    expect(vessel.type).toBe('vessel');
  });
});
