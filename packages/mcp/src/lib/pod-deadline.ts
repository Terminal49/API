/** Resolve only the account-visible POD deadline selected by the API.
 * Missing or withheld unified values must not fall back to a legacy/inland LFD.
 */
export function resolvePodDeadline(importDeadlines: {
  pod?: {
    unified?: {
      current_value?: string | null;
      current_selection?: string | null;
    } | null;
  } | null;
}): { value: string | null; source: string | null } {
  const unified = importDeadlines.pod?.unified;
  const value = unified?.current_value || null;
  return { value, source: value ? (unified?.current_selection ?? null) : null };
}
