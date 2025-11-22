/**
 * Simplified HTTP client for Terminal49 API
 * Uses fetch directly with proper typing
 */

import { getConfig } from '../config/env.js';
import { Terminal49Error } from './client.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Make an authenticated request to the Terminal49 API
 */
export async function makeRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const config = getConfig();
  const { method = 'GET', body, query } = options;

  // Build URL with query params
  let url = `${config.baseUrl}${path}`;
  if (query) {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Prepare headers
  const apiKey = config.apiKey;
  const authHeader = apiKey.startsWith('Token ') ? apiKey : `Token ${apiKey}`;

  const headers: Record<string, string> = {
    'Authorization': authHeader,
    'Accept': 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  // Make request
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle response
  if (!response.ok) {
    const errorText = await response.text();
    throw new Terminal49Error(
      `Terminal49 API error: ${errorText || response.statusText}`,
      response.status,
      response.statusText,
      errorText
    );
  }

  // Parse JSON response
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return (await response.json()) as T;
}
