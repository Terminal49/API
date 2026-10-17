import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import { executeGetContainerTransportEvents } from './get-container-transport-events.js';

const CONTAINER_ID = '3f9a1c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const VESSEL_ID = '50b58b30-acf9-4f2f-a2d4-7d2b0a1c3e5f';

describe('get_container_transport_events', () => {
  it('gives each event the vessel id get_vessel takes, or null', async () => {
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}/transport_events`]: {
        body: {
          data: [
            {
              id: 'event-1',
              type: 'transport_event',
              attributes: {
                event: 'container.transport.vessel_departed',
                timestamp: '2026-10-01T10:00:00Z',
              },
              relationships: {
                vessel: { data: { id: VESSEL_ID, type: 'vessel' } },
              },
            },
            {
              id: 'event-2',
              type: 'transport_event',
              attributes: {
                event: 'container.transport.full_out',
                timestamp: '2026-10-20T10:00:00Z',
              },
              relationships: { vessel: { data: null } },
            },
          ],
        },
      },
    });

    const result = await executeGetContainerTransportEvents(
      { id: CONTAINER_ID },
      client,
    );

    expect(
      result.timeline.map((event: { event: string; vessel_id: unknown }) => [
        event.event,
        event.vessel_id,
      ]),
    ).toEqual([
      ['container.transport.vessel_departed', VESSEL_ID],
      ['container.transport.full_out', null],
    ]);
  });
});
