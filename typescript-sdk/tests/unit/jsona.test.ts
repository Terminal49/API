/**
 * Tests for JSON:API deserialization
 */

import { describe, it, expect } from 'vitest';
import { deserialize, deserializeCollection, isJsonApiDocument } from '../../src/jsonapi/jsona-instance';

describe('JSON:API Deserialization', () => {
  it('should identify valid JSON:API documents', () => {
    const validDocument = {
      data: { id: '1', type: 'shipment', attributes: {} },
    };

    expect(isJsonApiDocument(validDocument)).toBe(true);
  });

  it('should reject invalid JSON:API documents', () => {
    expect(isJsonApiDocument(null)).toBe(false);
    expect(isJsonApiDocument(undefined)).toBe(false);
    expect(isJsonApiDocument({})).toBe(false);
    expect(isJsonApiDocument({ foo: 'bar' })).toBe(false);
  });

  it('should deserialize a simple JSON:API document', () => {
    const document = {
      data: {
        id: '123',
        type: 'shipment',
        attributes: {
          bill_of_lading_number: 'TEST123',
          customer_name: 'ACME Corp',
        },
      },
    };

    const result = deserialize(document);

    expect(result).toHaveProperty('id', '123');
    expect(result).toHaveProperty('type', 'shipment');
    // Should have both camelCase and snake_case versions
    expect(result).toHaveProperty('billOfLadingNumber', 'TEST123');
    expect(result).toHaveProperty('bill_of_lading_number', 'TEST123');
  });

  it('should deserialize a collection', () => {
    const document = {
      data: [
        {
          id: '1',
          type: 'shipment',
          attributes: { bill_of_lading_number: 'TEST1' },
        },
        {
          id: '2',
          type: 'shipment',
          attributes: { bill_of_lading_number: 'TEST2' },
        },
      ],
    };

    const result = deserializeCollection(document);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('id', '1');
    expect(result[1]).toHaveProperty('id', '2');
  });

  it('should handle relationships and included resources', () => {
    const document = {
      data: {
        id: '1',
        type: 'shipment',
        attributes: {
          bill_of_lading_number: 'TEST123',
        },
        relationships: {
          containers: {
            data: [{ id: 'c1', type: 'container' }],
          },
        },
      },
      included: [
        {
          id: 'c1',
          type: 'container',
          attributes: {
            container_number: 'CONT123',
          },
        },
      ],
    };

    const result = deserialize(document);

    expect(result).toHaveProperty('containers');
    expect(Array.isArray(result.containers)).toBe(true);
    expect(result.containers[0]).toHaveProperty('containerNumber', 'CONT123');
  });
});
