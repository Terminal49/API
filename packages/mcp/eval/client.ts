/**
 * Minimal MCP Streamable-HTTP client for the eval suite.
 *
 * Speaks JSON-RPC 2.0 to a deployed Terminal49 MCP gateway (production by
 * default) and returns timed, block-aware tool results. Auth is env-driven so
 * the same suite runs against prod, a local `vercel dev` gateway, or with
 * either supported scheme:
 *   - MCP_EVAL_BEARER : OAuth 2.1 access token -> `Authorization: Bearer <t>`
 *   - MCP_EVAL_TOKEN  : Terminal49 API key     -> `Authorization: Token <t>`
 * Endpoint override: MCP_EVAL_ENDPOINT (default https://mcp.terminal49.com/mcp).
 */

import { randomUUID } from 'node:crypto';

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_ENDPOINT = 'https://mcp.terminal49.com/mcp';

export interface EvalClientConfig {
  endpoint: string;
  scheme: 'Bearer' | 'Token';
  token: string;
}

/** A single MCP text content block, with its JSON parsed when possible. */
export interface ParsedBlock {
  index: number;
  text: string;
  /** Parsed JSON payload, or undefined when the block is not JSON. */
  json: unknown;
  /** True when the block is an `_agent_steering` guidance block. */
  isSteering: boolean;
}

export interface ToolResult {
  /** HTTP status of the transport response. */
  http: number;
  /** MCP-level tool error (`result.isError`) or a JSON-RPC error. */
  isError: boolean;
  /** Wall-clock latency in ms for the tools/call round trip. */
  latencyMs: number;
  /** Total byte length of all text content. */
  bytes: number;
  /** Every text content block, JSON parsed where possible. */
  blocks: ParsedBlock[];
  /** First non-steering JSON block: the tool's primary payload. */
  payload: unknown;
  /** The `_agent_steering` block, when present. */
  steering: Record<string, unknown> | undefined;
  /** JSON-RPC error message, when the transport returned one. */
  errorMessage: string | undefined;
  /** All content blocks joined, for logging and error inspection. */
  rawText: string;
}

export interface ToolInfo {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolve auth + endpoint from the environment, or null when unconfigured. */
export function resolveConfig(): EvalClientConfig | null {
  const endpoint = process.env.MCP_EVAL_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  const bearer = process.env.MCP_EVAL_BEARER?.trim();
  const token = process.env.MCP_EVAL_TOKEN?.trim();
  if (bearer) return { endpoint, scheme: 'Bearer', token: bearer };
  if (token) return { endpoint, scheme: 'Token', token };
  return null;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number | undefined; message: string | undefined };
}

/** Parse the HTTP body, which is either plain JSON or SSE (text/event-stream). */
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // SSE: events are separated by blank lines, and one event may carry
    // MULTIPLE `data:` lines whose values join with "\n" (SSE spec). The
    // JSON-RPC response is the last data-bearing event on the stream.
    let lastData: string | undefined;
    for (const event of text.split(/\r?\n\r?\n/)) {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''));
      if (dataLines.length > 0) lastData = dataLines.join('\n');
    }
    if (lastData === undefined) {
      throw new Error('response body is neither JSON nor SSE with data');
    }
    return JSON.parse(lastData);
  }
}

function asJsonRpc(value: unknown): JsonRpcResponse {
  if (!isRecord(value)) return {};
  const error = isRecord(value.error)
    ? {
        code:
          typeof value.error.code === 'number' ? value.error.code : undefined,
        message:
          typeof value.error.message === 'string'
            ? value.error.message
            : undefined,
      }
    : undefined;
  return { result: value.result, error };
}

function extractTextBlocks(result: unknown): string[] {
  if (!isRecord(result) || !Array.isArray(result.content)) return [];
  const out: string[] = [];
  for (const block of result.content) {
    if (
      isRecord(block) &&
      block.type === 'text' &&
      typeof block.text === 'string'
    ) {
      out.push(block.text);
    }
  }
  return out;
}

function parseBlocks(texts: string[]): ParsedBlock[] {
  return texts.map((text, index) => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return {
      index,
      text,
      json,
      isSteering: isRecord(json) && json._agent_steering === true,
    };
  });
}

export class EvalClient {
  constructor(private readonly cfg: EvalClientConfig) {}

  get endpoint(): string {
    return this.cfg.endpoint;
  }

  get scheme(): string {
    return this.cfg.scheme;
  }

  private async rpc(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<{ http: number; body: JsonRpcResponse }> {
    const res = await fetch(this.cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `${this.cfg.scheme} ${this.cfg.token}`,
        'MCP-Protocol-Version': PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: randomUUID(),
        method,
        ...(params ? { params } : {}),
      }),
    });
    const raw = await res.text();
    let parsed: unknown;
    try {
      parsed = parseBody(raw);
    } catch {
      parsed = undefined;
    }
    return { http: res.status, body: asJsonRpc(parsed) };
  }

  async initialize(): Promise<{ http: number; serverInfo: unknown }> {
    const { http, body } = await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 't49-mcp-eval', version: '1.0.0' },
    });
    const serverInfo = isRecord(body.result)
      ? body.result.serverInfo
      : undefined;
    return { http, serverInfo };
  }

  async listTools(): Promise<ToolInfo[]> {
    const { body } = await this.rpc('tools/list');
    const tools =
      isRecord(body.result) && Array.isArray(body.result.tools)
        ? body.result.tools
        : [];
    const out: ToolInfo[] = [];
    for (const tool of tools) {
      if (isRecord(tool) && typeof tool.name === 'string') {
        out.push({
          name: tool.name,
          description:
            typeof tool.description === 'string' ? tool.description : undefined,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return out;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolResult> {
    const start = Date.now();
    const { http, body } = await this.rpc('tools/call', {
      name,
      arguments: args,
    });
    const latencyMs = Date.now() - start;
    const texts = extractTextBlocks(body.result);
    const blocks = parseBlocks(texts);
    const steeringBlock = blocks.find((block) => block.isSteering);
    const payloadBlock = blocks.find(
      (block) => !block.isSteering && block.json !== undefined,
    );
    const isError =
      (isRecord(body.result) && body.result.isError === true) ||
      Boolean(body.error);
    return {
      http,
      isError,
      latencyMs,
      bytes: texts.reduce((sum, text) => sum + text.length, 0),
      blocks,
      payload: payloadBlock?.json,
      steering:
        steeringBlock && isRecord(steeringBlock.json)
          ? steeringBlock.json
          : undefined,
      errorMessage: body.error?.message,
      rawText: texts.join('\n'),
    };
  }
}
