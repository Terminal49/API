/**
 * Shared shapes for tool results that explain a known condition instead of
 * failing the call.
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
