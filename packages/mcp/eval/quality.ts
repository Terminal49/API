/**
 * Deterministic quality scoring for MCP tool responses.
 *
 * These scorers do NOT use an LLM. They evaluate the objective contract of a
 * tool response: transport success, error semantics, payload shape, required
 * fields, latency budget, and the absence of removed runtime steering metadata.
 * Subjective "is this a good answer" judging (LLM-as-judge over an agent
 * transcript) is a separate, optional layer — see eval/README.md.
 */

import { isRecord, type ToolResult } from './client.js';

export interface Check {
  name: string;
  pass: boolean;
  detail: string | undefined;
  /** Soft checks (latency) are reported but never fail the contract. */
  soft: boolean;
}

export interface QualityScore {
  /** Fraction of checks passed, 0..1 (includes soft checks). */
  score: number;
  passed: number;
  total: number;
  /** True when every non-soft (contract) check passed. Gate CI on this. */
  contractPass: boolean;
  checks: Check[];
}

export interface Predicate {
  name: string;
  test: (payload: unknown, result: ToolResult) => boolean;
  detail?: (payload: unknown, result: ToolResult) => string;
}

export interface QualitySpec {
  /** Latency ceiling in ms; exceeding it fails one check. */
  latencyBudgetMs?: number;
  /** Required top-level keys on the primary payload (must be an object). */
  requiredKeys?: string[];
  /** Custom predicate checks against the primary payload. */
  predicates?: Predicate[];
  /** Negative test: expect an MCP tool error instead of a payload. */
  expectError?: boolean;
}

const DEFAULT_LATENCY_BUDGET_MS = 8000;
const REMOVED_STEERING_FIELDS = new Set([
  '_agent_steering',
  'presentation_guidance',
  'suggested_follow_ups',
  'suggested_tools',
]);

export function scoreResult(
  result: ToolResult,
  spec: QualitySpec,
): QualityScore {
  const checks: Check[] = [];
  const add = (
    name: string,
    pass: boolean,
    detail?: string,
    soft = false,
  ): void => {
    checks.push({ name, pass, detail, soft });
  };
  const budget = spec.latencyBudgetMs ?? DEFAULT_LATENCY_BUDGET_MS;

  if (spec.expectError) {
    add(
      'returns a tool error',
      result.isError,
      result.errorMessage ?? result.rawText.slice(0, 120),
    );
    add(
      'error is explained',
      result.rawText.length > 0 || Boolean(result.errorMessage),
    );
  } else {
    add('transport 200', result.http === 200, `http=${result.http}`);
    add('not a tool error', !result.isError, result.errorMessage);
    add('primary payload is JSON', result.payload !== undefined);
    add('non-empty response', result.bytes > 0, `${result.bytes}b`);
    const removedFields = findRemovedSteeringFields(
      result.blocks.map((block) => block.json),
    );
    add(
      'removed steering metadata is absent',
      removedFields.length === 0,
      removedFields.length > 0 ? removedFields.join(', ') : undefined,
    );

    for (const key of spec.requiredKeys ?? []) {
      add(
        `payload has "${key}"`,
        isRecord(result.payload) && key in result.payload,
      );
    }

    for (const predicate of spec.predicates ?? []) {
      let pass = false;
      try {
        pass = predicate.test(result.payload, result);
      } catch {
        pass = false;
      }
      let detail: string | undefined;
      if (predicate.detail) {
        try {
          detail = predicate.detail(result.payload, result);
        } catch {
          detail = undefined;
        }
      }
      add(predicate.name, pass, detail);
    }
  }

  // Latency is a soft signal: recorded and scored, but a slow response is not
  // a contract violation, so it never fails the suite on its own.
  add(
    `latency < ${budget}ms`,
    result.latencyMs <= budget,
    `${result.latencyMs}ms`,
    true,
  );

  const passed = checks.filter((check) => check.pass).length;
  return {
    score: checks.length === 0 ? 0 : passed / checks.length,
    passed,
    total: checks.length,
    contractPass: checks.every((check) => check.soft || check.pass),
    checks,
  };
}

function findRemovedSteeringFields(values: unknown[]): string[] {
  const found = new Set<string>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;

    for (const [key, nestedValue] of Object.entries(value)) {
      if (REMOVED_STEERING_FIELDS.has(key)) found.add(key);
      visit(nestedValue);
    }
  }

  for (const value of values) visit(value);
  return [...found].sort();
}

// ---- small typed helpers for writing predicates against `unknown` payloads ----

/** True when `payload[key]` is a non-empty array. */
export function hasNonEmptyArray(payload: unknown, key: string): boolean {
  return (
    isRecord(payload) && Array.isArray(payload[key]) && payload[key].length > 0
  );
}

/** True when `payload[key]` is an array (possibly empty). */
export function hasArray(payload: unknown, key: string): boolean {
  return isRecord(payload) && Array.isArray(payload[key]);
}

/** Read `payload[key]` when it is a string, else undefined. */
export function readString(payload: unknown, key: string): string | undefined {
  if (isRecord(payload) && typeof payload[key] === 'string')
    return payload[key];
  return undefined;
}

/** The first element of `payload[key]` when it is a non-empty array. */
export function firstOf(payload: unknown, key: string): unknown {
  if (
    isRecord(payload) &&
    Array.isArray(payload[key]) &&
    payload[key].length > 0
  ) {
    return payload[key][0];
  }
  return undefined;
}
