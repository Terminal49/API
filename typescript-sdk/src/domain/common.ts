/**
 * Common types and interfaces shared across domain models
 */

/**
 * Base interface for all domain models
 */
export interface BaseModel {
  id: string;
  type: string;
  raw?: unknown;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

/**
 * API response with pagination
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta?: PaginationMeta;
  links?: {
    self?: string;
    first?: string;
    last?: string;
    prev?: string;
    next?: string;
  };
}
