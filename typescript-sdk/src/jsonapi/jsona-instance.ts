/**
 * JSONA configuration for JSON:API deserialization
 */

import Jsona from 'jsona';

/**
 * Custom property mapper to convert snake_case to camelCase
 */
class CamelCaseMapper {
  toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  getId(model: Record<string, unknown>): string {
    return String(model.id);
  }

  getType(model: Record<string, unknown>): string {
    return String(model.type);
  }

  getAttributes(model: Record<string, unknown>): Record<string, unknown> {
    const { id, type, ...attributes } = model;
    return attributes;
  }

  getRelationships(_model: Record<string, unknown>): Record<string, never> {
    return {};
  }

  setAttributes(model: Record<string, unknown>, attributes: Record<string, unknown>): void {
    Object.keys(attributes).forEach((key) => {
      const camelKey = this.toCamelCase(key);
      model[camelKey] = attributes[key];
      // Also keep the original snake_case for compatibility
      model[key] = attributes[key];
    });
  }

  setRelationships(
    model: Record<string, unknown>,
    relationships: Record<string, unknown>
  ): void {
    Object.keys(relationships).forEach((key) => {
      const camelKey = this.toCamelCase(key);
      model[camelKey] = relationships[key];
      // Also keep the original snake_case for compatibility
      model[key] = relationships[key];
    });
  }

  setId(model: Record<string, unknown>, id: string): void {
    model.id = id;
  }

  setType(model: Record<string, unknown>, type: string): void {
    model.type = type;
  }

  setMeta(model: Record<string, unknown>, meta: Record<string, unknown>): void {
    model.meta = meta;
  }

  setLinks(model: Record<string, unknown>, links: Record<string, unknown>): void {
    model.links = links;
  }
}

/**
 * Configured JSONA instance
 */
export const jsona = new Jsona({
  modelPropertiesMapper: new CamelCaseMapper(),
});

/**
 * Type guard for JSON:API documents
 */
export function isJsonApiDocument(value: unknown): value is {
  data: unknown;
  included?: unknown[];
  meta?: Record<string, unknown>;
  links?: Record<string, unknown>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value
  );
}

/**
 * Deserialize a JSON:API document
 */
export function deserialize<T = unknown>(document: unknown): T {
  if (!isJsonApiDocument(document)) {
    throw new Error('Invalid JSON:API document');
  }
  // Type assertion needed because jsona.deserialize returns unknown
  return jsona.deserialize(document as Parameters<typeof jsona.deserialize>[0]) as T;
}

/**
 * Deserialize a JSON:API collection
 */
export function deserializeCollection<T = unknown>(document: unknown): T[] {
  const result = deserialize<T | T[]>(document);
  return Array.isArray(result) ? result : [result];
}
