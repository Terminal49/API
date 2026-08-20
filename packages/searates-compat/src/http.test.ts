import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vite-plus/test';
import { createTrackingHandler } from './http.js';
import { SeaRatesCompatibilityGateway } from './service.js';
import type { SeaRatesEnvelope, TrackingQuery, TrackingType } from './types.js';

class CapturingGateway extends SeaRatesCompatibilityGateway {
  apiKey?: string;
  query?: TrackingQuery;

  override async tracking(
    apiKey: string | undefined,
    query: TrackingQuery,
  ): Promise<SeaRatesEnvelope> {
    this.apiKey = apiKey;
    this.query = query;
    return { status: 'success', message: 'OK', data: { containers: [] } };
  }
}

function request(url: string): IncomingMessage {
  // SAFETY: The handler reads only method and url from this test double.
  return { method: 'GET', url } as IncomingMessage;
}

function response(): {
  body?: unknown;
  response: Parameters<ReturnType<typeof createTrackingHandler>>[1];
  status?: number;
} {
  const state: { body?: unknown; status?: number } = {};
  const responseDouble = {
    setHeader: () => undefined,
    status(code: number) {
      state.status = code;
      return responseDouble;
    },
    json(payload: unknown) {
      state.body = payload;
    },
  };
  // SAFETY: The handler uses only setHeader, status, and json on this test double.
  return {
    get body() {
      return state.body;
    },
    get status() {
      return state.status;
    },
    response: responseDouble as unknown as Parameters<
      ReturnType<typeof createTrackingHandler>
    >[1],
  };
}

describe('GET /tracking contract', () => {
  it('parses the SeaRates query and returns its JSON envelope', async () => {
    const gateway = new CapturingGateway();
    const handler = createTrackingHandler(gateway);
    const output = response();

    await handler(
      request(
        '/tracking?api_key=gateway-key&number=mscu1234567&type=CT&sealine=mscu&force_update=true&route=1&ais=yes',
      ),
      output.response,
    );

    expect(output.status).toBe(200);
    expect(output.body).toEqual({
      status: 'success',
      message: 'OK',
      data: { containers: [] },
    });
    expect(gateway.apiKey).toBe('gateway-key');
    expect(gateway.query).toEqual({
      ais: true,
      forceUpdate: true,
      number: 'MSCU1234567',
      route: true,
      sealine: 'MSCU',
      type: 'CT' satisfies TrackingType,
    });
  });

  it('returns a SeaRates-style WRONG_TYPE envelope', async () => {
    const handler = createTrackingHandler(new CapturingGateway());
    const output = response();
    await handler(
      request('/tracking?api_key=gateway-key&number=EXAMPLE&type=AIR'),
      output.response,
    );
    expect(output.status).toBe(200);
    expect(output.body).toEqual({
      status: 'error',
      message: 'WRONG_TYPE',
      data: {},
    });
  });
});
