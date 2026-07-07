/**
 * Report rendering for the tool eval suite: a terminal scorecard plus a
 * machine-readable JSON artifact written under eval/reports/ (gitignored).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolResult } from './client.js';
import type { QualityScore } from './quality.js';

export interface EvalRow {
  tool: string;
  testCase: string;
  result: ToolResult;
  score: QualityScore;
}

export interface EvalReportMeta {
  endpoint: string;
  scheme: string;
  serverInfo: unknown;
  timestamp: string;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + ' '.repeat(width - value.length);
}

/** A one-line-per-case scorecard, followed by any failed checks. */
export function formatScorecard(rows: EvalRow[], meta: EvalReportMeta): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('═'.repeat(78));
  lines.push(`  Terminal49 MCP tool eval — ${meta.timestamp}`);
  lines.push(`  endpoint: ${meta.endpoint}  (auth: ${meta.scheme})`);
  lines.push('═'.repeat(78));
  lines.push(
    `  ${pad('TOOL', 32)}${pad('CASE', 16)}${pad('HTTP', 6)}${pad('ms', 7)}${pad('steer', 7)}SCORE`,
  );
  lines.push('  ' + '─'.repeat(74));

  for (const row of rows) {
    const steer = row.result.steering
      ? 'yes'
      : row.score.checks.some((c) => c.name.includes('steering'))
        ? 'NO'
        : '-';
    const flag = !row.score.contractPass
      ? ' ✗'
      : row.score.score >= 1
        ? ''
        : ' ~';
    lines.push(
      `  ${pad(row.tool, 32)}${pad(row.testCase, 16)}${pad(String(row.result.http), 6)}${pad(String(row.result.latencyMs), 7)}${pad(steer, 7)}${pct(row.score.score)} (${row.score.passed}/${row.score.total})${flag}`,
    );
    const failed = row.score.checks.filter((c) => !c.pass);
    for (const check of failed) {
      lines.push(
        `       └─ FAIL: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`,
      );
    }
  }

  lines.push('  ' + '─'.repeat(74));
  const mean =
    rows.length === 0
      ? 0
      : rows.reduce((sum, r) => sum + r.score.score, 0) / rows.length;
  const perfect = rows.filter((r) => r.score.score >= 1).length;
  const totalMs = rows.reduce((sum, r) => sum + r.result.latencyMs, 0);
  lines.push(
    `  cases: ${rows.length}  ·  perfect: ${perfect}  ·  mean score: ${pct(mean)}  ·  total latency: ${totalMs}ms`,
  );
  lines.push('═'.repeat(78));
  lines.push('');
  return lines.join('\n');
}

/** Write a JSON artifact and return its path. */
export function writeReport(rows: EvalRow[], meta: EvalReportMeta): string {
  const dir = join(import.meta.dirname, 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `eval-${meta.timestamp.replace(/[:.]/g, '-')}.json`);
  const payload = {
    meta,
    summary: {
      cases: rows.length,
      perfect: rows.filter((r) => r.score.score >= 1).length,
      contractFailures: rows.filter((r) => !r.score.contractPass).length,
      meanScore:
        rows.length === 0
          ? 0
          : rows.reduce((sum, r) => sum + r.score.score, 0) / rows.length,
      totalLatencyMs: rows.reduce((sum, r) => sum + r.result.latencyMs, 0),
    },
    cases: rows.map((row) => ({
      tool: row.tool,
      testCase: row.testCase,
      http: row.result.http,
      isError: row.result.isError,
      latencyMs: row.result.latencyMs,
      bytes: row.result.bytes,
      hasSteering: row.result.steering !== undefined,
      score: row.score.score,
      contractPass: row.score.contractPass,
      checks: row.score.checks,
      payloadKeys:
        row.result.payload &&
        typeof row.result.payload === 'object' &&
        !Array.isArray(row.result.payload)
          ? Object.keys(row.result.payload)
          : undefined,
    })),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
