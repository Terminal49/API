import { ValidationError } from '../errors.js';
import type { Transport } from '../transport.js';
import { BaseManager } from './base.js';

// User-scoped assistant endpoints are outside the API-key OpenAPI contract.
// Keep their response types here and reuse Transport's auth/error/timeout path.
export type AssistantQueryPreview = {
  result_id: string;
  expires_at: string;
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  row_count: number;
  total_count: number | null;
  truncated: boolean;
  row_limit: number;
  preview_row_count: number;
};
export type AssistantQueryPage = Omit<
  AssistantQueryPreview,
  'preview_row_count'
> & {
  offset: number;
  page_row_count: number;
  next_offset: number | null;
};
export type AssistantViewIndex = {
  views: {
    name: string;
    label: string;
    description: string;
    columns: string[];
    metrics: string[];
  }[];
};
export type AssistantView = {
  name: string;
  label: string;
  description: string;
  columns: { name: string; type: string | null; description: string }[];
  metrics: { name: string; description: string; sql: string }[];
};
export type AssistantGuideIndex = {
  guides: { topic: string; title: string; summary: string }[];
};
export type AssistantGuide = { topic: string; body: string };

/** User-scoped analytics. Requires assistant-sql; ordinary API keys are rejected. */
export class AssistantQueryManager extends BaseManager {
  constructor(
    transport: Transport,
    private accountId?: string,
  ) {
    super(transport);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.accountId)
      throw new ValidationError(
        'Assistant SQL requires accountId in the client configuration.',
      );
    return this.transport.executeManual<T>(
      `${this.transport.baseUrl}${path}`,
      init,
    );
  }

  /** Execute once and store a 24-hour result. POST is not automatically retried. */
  query(sql: string, previewRows?: number): Promise<AssistantQueryPreview> {
    return this.request('/assistant_queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, preview_rows: previewRows }),
    });
  }

  /** Read a page from a result owned by the current user and account. */
  result(id: string, offset = 0, limit = 50): Promise<AssistantQueryPage> {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    return this.request(
      `/assistant_queries/${encodeURIComponent(id)}?${params}`,
    );
  }

  /** Discover views before writing SQL. */
  views(): Promise<AssistantViewIndex> {
    return this.request('/assistant_views');
  }

  /** Get exact column definitions and named metrics, optionally filtered. */
  view(
    id: string,
    columns?: string[],
    search?: string,
  ): Promise<AssistantView> {
    const params = new URLSearchParams();
    if (columns) params.set('columns', columns.join(','));
    if (search !== undefined) params.set('search', search);
    const query = params.size ? `?${params}` : '';
    return this.request(`/assistant_views/${encodeURIComponent(id)}${query}`);
  }

  /** List available measurement guides. */
  guides(): Promise<AssistantGuideIndex> {
    return this.request('/assistant_guides');
  }

  /** Read a measurement guide. Start with method. */
  guide(id: string): Promise<AssistantGuide> {
    return this.request(`/assistant_guides/${encodeURIComponent(id)}`);
  }
}
