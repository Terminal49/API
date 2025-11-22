/**
 * Tests for JSON:API mappers
 */

import { describe, it, expect } from 'vitest';
import { mapShipmentDocument, mapShipmentsCollection } from '../../src/jsonapi/mappers/shipment';
import { mapContainerDocument, mapContainersCollection } from '../../src/jsonapi/mappers/container';

describe('Shipment Mapper', () => {
  it('should map a single shipment document', () => {
    const document = {
      data: {
        id: 'ship-123',
        type: 'shipment',
        attributes: {
          bill_of_lading_number: 'BOL123',
          customer_name: 'ACME Corp',
          shipping_line_scac: 'OOLU',
          port_of_lading_name: 'Shanghai',
          port_of_discharge_name: 'Los Angeles',
        },
      },
    };

    const shipment = mapShipmentDocument(document);

    expect(shipment.id).toBe('ship-123');
    expect(shipment.type).toBe('shipment');
    expect(shipment.billOfLadingNumber).toBe('BOL123');
    expect(shipment.customerName).toBe('ACME Corp');
    expect(shipment.shippingLineScac).toBe('OOLU');
    expect(shipment.portOfLadingName).toBe('Shanghai');
    expect(shipment.portOfDischargeName).toBe('Los Angeles');
  });

  it('should map a shipment collection', () => {
    const document = {
      data: [
        {
          id: 'ship-1',
          type: 'shipment',
          attributes: {
            bill_of_lading_number: 'BOL1',
          },
        },
        {
          id: 'ship-2',
          type: 'shipment',
          attributes: {
            bill_of_lading_number: 'BOL2',
          },
        },
      ],
    };

    const shipments = mapShipmentsCollection(document);

    expect(shipments).toHaveLength(2);
    expect(shipments[0].id).toBe('ship-1');
    expect(shipments[1].id).toBe('ship-2');
  });

  it('should preserve raw data', () => {
    const document = {
      data: {
        id: 'ship-123',
        type: 'shipment',
        attributes: {
          bill_of_lading_number: 'BOL123',
        },
      },
    };

    const shipment = mapShipmentDocument(document);

    expect(shipment.raw).toBeDefined();
    expect(shipment.raw).toHaveProperty('id', 'ship-123');
  });
});

describe('Container Mapper', () => {
  it('should map a single container document', () => {
    const document = {
      data: {
        id: 'cont-123',
        type: 'container',
        attributes: {
          container_number: 'CONT123',
          size_type_code: '40HC',
          available_for_pickup: true,
          last_free_day: '2024-12-31',
        },
      },
    };

    const container = mapContainerDocument(document);

    expect(container.id).toBe('cont-123');
    expect(container.type).toBe('container');
    expect(container.containerNumber).toBe('CONT123');
    expect(container.sizeTypeCode).toBe('40HC');
    expect(container.availableForPickup).toBe(true);
    expect(container.lastFreeDay).toBe('2024-12-31');
  });

  it('should map a container collection', () => {
    const document = {
      data: [
        {
          id: 'cont-1',
          type: 'container',
          attributes: {
            container_number: 'CONT1',
          },
        },
        {
          id: 'cont-2',
          type: 'container',
          attributes: {
            container_number: 'CONT2',
          },
        },
      ],
    };

    const containers = mapContainersCollection(document);

    expect(containers).toHaveLength(2);
    expect(containers[0].containerNumber).toBe('CONT1');
    expect(containers[1].containerNumber).toBe('CONT2');
  });
});
