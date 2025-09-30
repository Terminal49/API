// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { IncomingMessage } from 'node:http';
import { ClientOptions } from 'terminal49';

export const parseAuthHeaders = (req: IncomingMessage): Partial<ClientOptions> => {
  const apiKey =
    Array.isArray(req.headers['x-terminal49-api-key']) ?
      req.headers['x-terminal49-api-key'][0]
    : req.headers['x-terminal49-api-key'];
  return { apiKey };
};
