/**
 * Shared shapes for tool results that explain a known condition instead of
 * failing the call, and for input checks a JSON schema cannot express.
 */
import { z } from 'zod';

/** A condition the agent can explain to the user. Returned with isError false. */
export interface SoftResult<Code extends string> {
  error: Code;
  message: string;
  alternative: string;
}

const statusSchema = z.object({ status: z.number() });

/** The HTTP status an SDK error carries, if any. */
export function httpStatus(error: unknown): number | undefined {
  const parsed = statusSchema.safeParse(error);
  return parsed.success ? parsed.data.status : undefined;
}

/**
 * An input the schema accepts but the handler rejects. formatToolError
 * returns its message unchanged, so it must never contain upstream text.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}
