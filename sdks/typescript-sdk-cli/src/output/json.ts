/**
 * JSON envelope formatter.
 *
 * Wraps all CLI output in a predictable envelope:
 *   { ok: true, command: "...", data: {...}, pagination?: {...}, meta?: {...} }
 *   { ok: false, command: "...", error: { code, message, status, details } }
 *
 * Supports --compact for token-efficient LLM output.
 */

// TODO: Implement in Phase 1
export {};
