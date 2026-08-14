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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function projectPath(value: unknown, parts: string[]): unknown {
  if (parts.length === 0) return value;
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    const projected = value
      .map((item) => {
        const projectedItem = projectPath(item, parts);
        return projectedItem === undefined && isRecord(item)
          ? {}
          : projectedItem;
      })
      .filter((item) => item !== undefined);
    return projected.length > 0 || value.length === 0 ? projected : undefined;
  }

  if (!isRecord(value)) return undefined;

  const [head, ...tail] = parts;
  const projected = projectPath(value[head], tail);
  if (projected === undefined) return undefined;
  return { [head]: projected };
}

function mergeProjection(
  target: Record<string, unknown>,
  source: unknown,
): void {
  if (!isRecord(source)) return;

  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      target[key] = mergeArrays(current, value);
    } else if (isRecord(current) && isRecord(value)) {
      mergeProjection(current, value);
    } else {
      target[key] = value;
    }
  }
}

function mergeArrays(current: unknown[], next: unknown[]): unknown[] {
  const length = Math.max(current.length, next.length);
  return Array.from({ length }, (_, index) => {
    const left = current[index];
    const right = next[index];
    if (isRecord(left) && isRecord(right)) {
      const merged = { ...left };
      mergeProjection(merged, right);
      return merged;
    }
    return right === undefined ? left : right;
  });
}

function projectObject(
  value: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  fields.forEach((path) => {
    mergeProjection(result, projectPath(value, path.split('.')));
  });
  return result;
}

export function projectFields<T>(value: T, fields?: string): T {
  const fieldList = normalizePathList(fields);
  if (fieldList.length === 0) return value;

  if (Array.isArray(value)) {
    return value.map((row) =>
      isRecord(row) ? projectObject(row, fieldList) : row,
    ) as T;
  }
  if (isRecord(value)) {
    if (Array.isArray(value.items)) {
      return {
        ...value,
        items: value.items.map((row) =>
          isRecord(row) ? projectObject(row, fieldList) : row,
        ),
      } as T;
    }
    return projectObject(value, fieldList) as T;
  }
  return value;
}
