/**
 * Polling support for --poll flag.
 *
 * Repeatedly fetches a resource at a given interval
 * until a condition is met (--until "status=arrived").
 * Useful for agent workflows waiting on status changes.
 */

export type Poller<T> = (attempt: number) => Promise<T>;
export type PollCondition<T> = (value: T) => boolean;

export interface PollOptions {
  intervalMs: number;
  maxAttempts?: number;
}

export async function pollUntil<T>(
  poller: Poller<T>,
  condition: PollCondition<T>,
  options: PollOptions,
): Promise<T> {
  const intervalMs = Math.max(250, options.intervalMs || 1000);
  const maxAttempts =
    options.maxAttempts === undefined ? Infinity : options.maxAttempts;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    const result = await poller(attempt);
    if (condition(result)) return result;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error('Polling timeout: condition not met');
}
