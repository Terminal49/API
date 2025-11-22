/**
 * JSON:API mappers barrel export
 */

export * from './shipment.js';
export * from './container.js';

/**
 * Generic mapper for simple resources
 */
import { deserialize, deserializeCollection } from '../jsona-instance.js';

export function mapDocument<T>(document: unknown): T {
  return deserialize<T>(document);
}

export function mapCollection<T>(document: unknown): T[] {
  return deserializeCollection<T>(document);
}
