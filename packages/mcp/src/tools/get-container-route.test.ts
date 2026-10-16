import { Terminal49Client } from '@terminal49/sdk';
import { describe, expect, it } from 'vite-plus/test';
import { EXPECTED_ROUTE_SUMMARY, routeFixture } from '../test/route-fixture.js';
import { executeGetContainerRoute } from './get-container-route.js';

describe('get_container_route with the real SDK client', () => {
  it('summarizes the map_geojson response the SDK fetches', async () => {
    const paths: string[] = [];
    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: 'https://api.test/v2',
      fetchImpl: async (input: Request | URL | string) => {
        paths.push(
          new URL(input instanceof Request ? input.url : String(input))
            .pathname,
        );
        return new Response(JSON.stringify(routeFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const result = await executeGetContainerRoute({ id: 'c-1' }, client);

    expect(paths).toEqual(['/v2/containers/c-1/map_geojson']);
    expect(result).toEqual(EXPECTED_ROUTE_SUMMARY);
  });
});
