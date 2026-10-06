import { describe, expect, it } from 'vite-plus/test';
import type { ToolResult } from './client.js';
import { scoreResult } from './quality.js';

function resultWithJson(json: unknown): ToolResult {
  const text = JSON.stringify(json);
  return {
    http: 200,
    isError: false,
    latencyMs: 10,
    bytes: text.length,
    blocks: [{ index: 0, text, json }],
    payload: json,
    errorMessage: undefined,
    rawText: text,
  };
}

describe('scoreResult', () => {
  it('accepts a response without removed steering metadata', () => {
    const score = scoreResult(resultWithJson({ items: [] }), {});

    expect(score.contractPass).toBe(true);
    expect(
      score.checks.find(
        (check) => check.name === 'removed steering metadata is absent',
      )?.pass,
    ).toBe(true);
  });

  it('rejects removed steering metadata at any JSON depth', () => {
    const score = scoreResult(
      resultWithJson({
        nested: {
          _agent_steering: true,
          _response_contract: { purpose: 'Shape the answer' },
          presentation_guidance: 'Present this result',
          suggested_follow_ups: ['Check another container'],
          suggested_tools: ['get_container'],
        },
      }),
      {},
    );
    const check = score.checks.find(
      (candidate) => candidate.name === 'removed steering metadata is absent',
    );

    expect(score.contractPass).toBe(false);
    expect(check?.pass).toBe(false);
    expect(check?.detail).toBe(
      '_agent_steering, _response_contract, presentation_guidance, suggested_follow_ups, suggested_tools',
    );
  });
});
