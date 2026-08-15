export class JsonApiDocument {
  private includedMap: Map<string, any>;

  constructor(public doc: any) {
    this.includedMap = new Map();
    if (Array.isArray(doc.included)) {
      for (const item of doc.included) {
        this.includedMap.set(`${item.type}:${item.id}`, item);
      }
    }
  }

  get data() {
    return this.doc.data;
  }

  get included() {
    return this.doc.included || [];
  }

  getIncluded(type: string, id: string) {
    return this.includedMap.get(`${type}:${id}`);
  }

  getRelationship(data: any, name: string) {
    const rel = data?.relationships?.[name]?.data;
    if (!rel) return null;
    if (Array.isArray(rel)) {
      return rel
        .map((r) => this.getIncluded(r.type, r.id))
        .filter((i) => i !== undefined);
    }
    return this.getIncluded(rel.type, rel.id);
  }

  static toCamelCase(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = value;
    }
    return result;
  }

  getAttributes(data: any, camelCase = true) {
    const attrs = data?.attributes || {};
    return camelCase ? JsonApiDocument.toCamelCase(attrs) : attrs;
  }
}

/**
 * Returns a shallow copy of `obj` with the given keys removed. Used by the
 * mappers to keep the raw camelCased attribute spread from clobbering curated
 * nested fields (and from emitting duplicate top-level scalars for the same
 * underlying value).
 */
export function omitKeys<T extends Record<string, any>>(
  obj: T,
  keys: readonly string[],
): Record<string, any> {
  const omit = new Set(keys);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (!omit.has(key)) result[key] = value;
  }
  return result;
}
