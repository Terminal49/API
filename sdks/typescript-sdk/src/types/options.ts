export type ResponseFormat = 'raw' | 'mapped' | 'both';

export interface CallOptions {
  format?: ResponseFormat;
}

export interface ListOptions extends CallOptions {
  page?: number;
  pageSize?: number;
}
