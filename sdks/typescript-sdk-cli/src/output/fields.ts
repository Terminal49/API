/**
 * Field projection for --fields flag.
 *
 * Selects specific fields from output objects to reduce
 * payload size — particularly useful for LLM agents to
 * minimize token consumption.
 *
 * Supports dot notation for nested fields: "ports.portOfDischarge.eta"
 */

function normalizePathList(fields?: string): string[] {
  if (!fields || typeof fields !== 'string') return [];
  return fields
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function getValue(input: unknown, path: string): unknown {
  const parts = path.split('.');
  return parts.reduce((current, part) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, input as Record<string, unknown> | null);
}

function setValue(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = target;
  parts.forEach((part, idx) => {
    if (idx === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    if (
      typeof cursor[part] !== 'object' ||
      cursor[part] === null ||
      Array.isArray(cursor[part])
    ) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  });
}

function projectObject(value: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  fields.forEach((path) => {
    const projected = getValue(value, path);
    if (projected !== undefined) {
      setValue(result, path, projected);
    }
  });
  return result;
}

export function projectFields<T>(value: T, fields?: string): T {
  const fieldList = normalizePathList(fields);
  if (fieldList.length === 0) return value;

  if (Array.isArray(value)) {
    return value.map((row) => projectObject(row as Record<string, unknown>, fieldList)) as T;
  }
  if (value && typeof value === 'object') {
    return projectObject(value as Record<string, unknown>, fieldList) as T;
  }
  return value;
}
