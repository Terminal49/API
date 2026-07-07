/**
 * Deterministic quality scoring for MCP tool responses.
 *
 * These scorers do NOT use an LLM. They evaluate the objective contract of a
 * tool response: transport success, error semantics, payload shape, required
 * fields, latency budget, and the presence/usefulness of the `_agent_steering`
 * guidance block that this server attaches to every tool. Subjective
 * "is this a good answer" judging (LLM-as-judge over an agent transcript) is a
 * separate, optional layer — see eval/README.md.
 */

import { isRecord, type ToolResult } from './client.js';

export interface Check {
  name: string;
  pass: boolean;
  detail: string | undefined;
}

export interface QualityScore {
  /** Fraction of checks passed, 0..1. */
  score: number;
  passed: number;
  total: number;
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
  /** Require an `_agent_steering` block that suggests follow-ups. */
  requireSteering?: boolean;
}

const DEFAULT_LATENCY_BUDGET_MS = 8000;

export function scoreResult(
  result: ToolResult,
  spec: QualitySpec,
): QualityScore {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail?: string): void => {
    checks.push({ name, pass, detail });
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

  if (spec.requireSteering) {
    add('has _agent_steering block', result.steering !== undefined);
    add('steering suggests follow-ups', steeringHasFollowUps(result.steering));
  }

  add(
    `latency < ${budget}ms`,
    result.latencyMs <= budget,
    `${result.latencyMs}ms`,
  );

  const passed = checks.filter((check) => check.pass).length;
  return {
    score: checks.length === 0 ? 0 : passed / checks.length,
    passed,
    total: checks.length,
    checks,
  };
}

function steeringHasFollowUps(
  steering: Record<string, unknown> | undefined,
): boolean {
  if (!steering) return false;
  const followUps = steering.suggested_follow_ups;
  const tools = steering.suggested_tools;
  return (
    (Array.isArray(followUps) && followUps.length > 0) ||
    (Array.isArray(tools) && tools.length > 0)
  );
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
