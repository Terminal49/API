import { Transport } from '../client/transport.js';
import { createMockFetch } from './mock-fetch.js';

export class MockTransport extends Transport {
  public calls: Array<{ url: URL; init?: RequestInit }> = [];

  constructor(handlers: Record<string, any>) {
    const { fetchImpl, calls } = createMockFetch(handlers);
    super({
      apiToken: 'mock-token',
      baseUrl: 'https://api.test',
      fetchImpl,
      maxRetries: 0,
    });
    this.calls = calls;
  }
}
