export type JsonBody<TOperation> = TOperation extends {
  requestBody?: { content: { 'application/json': infer TBody } };
}
  ? TBody
  : never;

export function callerPayload<TSpec>(value: unknown): TSpec {
  // SAFETY: the value is forwarded as-is and validated server-side; the SDK never reads it.
  return value as TSpec;
}
