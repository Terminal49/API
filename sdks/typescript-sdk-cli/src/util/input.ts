import { readFileSync } from 'node:fs';
import { InvalidArgumentError } from 'commander';

function readRawInput(raw: string): string {
  return raw === '-' ? readFileSync(0, 'utf8') : raw;
}

export function parseJsonObjectPayload(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readRawInput(raw));
  } catch {
    throw new InvalidArgumentError('--payload is not valid JSON');
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new InvalidArgumentError('--payload must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

export function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(readRawInput(raw));
  } catch {
    throw new InvalidArgumentError('value is not valid JSON');
  }
}

export function splitCommaList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function positiveInt(name: string) {
  return (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new InvalidArgumentError(`${name} must be a positive integer`);
    }
    return parsed;
  };
}
