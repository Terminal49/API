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

const errorSchema = z.object({
  name: z.string().catch(''),
  message: z.string().catch(''),
});

/**
 * A 403 that names a feature, which the SDK raises as FeatureNotEnabledError.
 * It checks the name and status instead of instanceof, so it still works
 * where tests replace the SDK module.
 */
export function isFeatureNotEnabled(error: unknown): boolean {
  const parsed = errorSchema.safeParse(error);
  if (!parsed.success) return false;
  return (
    parsed.data.name === 'FeatureNotEnabledError' ||
    (httpStatus(error) === 403 &&
      /not enabled|feature/i.test(parsed.data.message))
  );
}

/** A 401, or a 403 that does not name a feature. */
export function isNotAuthorized(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 401 || (status === 403 && !isFeatureNotEnabled(error));
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
