import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  downsample,
  ETA_FEATURE_NOTE,
  ETA_PORTS_NOTE,
  executeGetVessel,
  getVesselOutputSchema,
  MAX_FUTURE_POSITIONS,
  VESSEL_FEATURE_NOT_ENABLED,
} from './get-vessel.js';

const VESSEL_ID = '50b58b30-acf9-4f2f-a2d4-7d2b0a1c3e5f';
const POD_ID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const POL_ID = '2b3c4d5e-6f70-4a81-9b2c-3d4e5f6a7b8c';

const vesselAttributes = {
  name: 'MAERSK KENSINGTON',
  imo: '9333046',
  mmsi: '219018271',
  latitude: 33.7,
  longitude: -140.2,
  nautical_speed_knots: 18.4,
  navigational_heading_degrees: 92,
  position_timestamp: '2026-10-16T08:00:00Z',
};

const vessel = (attributes: Record<string, unknown> = {}) => ({
  data: {
    id: VESSEL_ID,
    type: 'vessel',
    attributes: { ...vesselAttributes, ...attributes },
  },
});

/** One position per minute, as the API sends them. */
function futurePositions(count: number) {
  const start = Date.parse('2026-10-16T08:00:00Z');
  return {
    data: {
      id: VESSEL_ID,
      type: 'vessel',
      attributes: {
        ...vesselAttributes,
        positions: Array.from({ length: count }, (_, index) => ({
          latitude: 33.7 + index / 10_000,
          longitude: -140.2 + index / 1_000,
          heading: 92,
          timestamp: new Date(start + index * 60_000).toISOString(),
          estimated: true,
        })),
      },
    },
  };
}

const featureNotEnabled = {
  status: 403,
  body: {
    errors: [{ status: '403', detail: 'Routing Data feature is not enabled' }],
  },
};

describe('downsample', () => {
  it('keeps short tracks unchanged', () => {
    const points = Array.from({ length: MAX_FUTURE_POSITIONS }, (_, i) => i);

    expect(downsample(points)).toEqual(points);
  });

  it(`cuts a long track to ${MAX_FUTURE_POSITIONS} evenly spaced points with both ends`, () => {
    const points = Array.from({ length: 10_000 }, (_, i) => i);

    const sampled = downsample(points);

    expect(sampled).toHaveLength(MAX_FUTURE_POSITIONS);
    expect(sampled[0]).toBe(0);
    expect(sampled.at(-1)).toBe(9_999);
    expect(sampled).toEqual([...sampled].sort((a, b) => a - b));
    expect(new Set(sampled).size).toBe(MAX_FUTURE_POSITIONS);
  });
});

describe('get_vessel', () => {
  it('returns the vessel and its last reported position', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: { body: vessel() },
    });

    const result = await executeGetVessel({ id: VESSEL_ID }, client);

    expect(requests.map((request) => request.path)).toEqual([
      `/vessels/${VESSEL_ID}`,
    ]);
    expect(result).toEqual({
      id: VESSEL_ID,
      name: 'MAERSK KENSINGTON',
      imo: '9333046',
      mmsi: '219018271',
      position: {
        latitude: 33.7,
        longitude: -140.2,
        speed_knots: 18.4,
        heading_degrees: 92,
        reported_at: '2026-10-16T08:00:00Z',
      },
    });
    expect(getVesselOutputSchema.parse(result)).toEqual(result);
  });

  it('reports no position when the vessel has not reported one', async () => {
    const { client } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: {
        body: vessel({ latitude: null, longitude: null }),
      },
    });

    const result = await executeGetVessel({ id: VESSEL_ID }, client);

    expect(result).toMatchObject({ position: null });
  });

  it('projects the track to a port, downsampled, with the arrival time', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: { body: vessel() },
      [`GET /vessels/${VESSEL_ID}/future_positions`]: {
        body: futurePositions(7_201),
      },
    });

    const result = await executeGetVessel(
      { id: VESSEL_ID, eta_to: { port_id: POD_ID, previous_port_id: POL_ID } },
      client,
    );

    const projection = requests.find((request) =>
      request.path.endsWith('/future_positions'),
    );
    expect(Object.fromEntries(projection!.query)).toEqual({
      port_id: POD_ID,
      previous_port_id: POL_ID,
    });
    expect(result).toMatchObject({
      eta: {
        port_id: POD_ID,
        previous_port_id: POL_ID,
        starts_from: 'last_reported_position',
        estimated_arrival_at: '2026-10-21T08:00:00.000Z',
        total_positions: 7_201,
      },
    });
    const eta = 'eta' in result ? result.eta : undefined;
    expect(eta?.positions).toHaveLength(MAX_FUTURE_POSITIONS);
    expect(eta?.positions[0]).toEqual({
      latitude: 33.7,
      longitude: -140.2,
      timestamp: '2026-10-16T08:00:00.000Z',
    });
    expect(eta?.positions.at(-1)?.timestamp).toBe('2026-10-21T08:00:00.000Z');
    expect(getVesselOutputSchema.parse(result)).toEqual(result);
  });

  it('starts the projection from given coordinates', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: { body: vessel() },
      [`GET /vessels/${VESSEL_ID}/future_positions_with_coordinates`]: {
        body: futurePositions(3),
      },
    });

    const result = await executeGetVessel(
      {
        id: VESSEL_ID,
        eta_to: {
          port_id: POD_ID,
          previous_port_id: POL_ID,
          latitude: 30.5,
          longitude: -150.25,
        },
      },
      client,
    );

    const projection = requests.find((request) =>
      request.path.endsWith('/future_positions_with_coordinates'),
    );
    expect(Object.fromEntries(projection!.query)).toEqual({
      port_id: POD_ID,
      previous_port_id: POL_ID,
      latitude: '30.5',
      longitude: '-150.25',
    });
    expect(result).toMatchObject({
      eta: { starts_from: 'given_coordinates', total_positions: 3 },
    });
  });

  it('keeps the vessel and adds a note when the projection is a paid feature', async () => {
    const { client } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: { body: vessel() },
      [`GET /vessels/${VESSEL_ID}/future_positions`]: featureNotEnabled,
    });

    const result = await executeGetVessel(
      { id: VESSEL_ID, eta_to: { port_id: POD_ID, previous_port_id: POL_ID } },
      client,
    );

    expect(result).toMatchObject({
      name: 'MAERSK KENSINGTON',
      eta: null,
      eta_note: ETA_FEATURE_NOTE,
    });
    expect(getVesselOutputSchema.parse(result)).toEqual(result);
  });

  it.each([404, 422])(
    'keeps the vessel and names the ports when the projection returns %i',
    async (status) => {
      const { client } = fakeApiClient({
        [`GET /vessels/${VESSEL_ID}`]: { body: vessel() },
        [`GET /vessels/${VESSEL_ID}/future_positions`]: { status },
      });

      const result = await executeGetVessel(
        {
          id: VESSEL_ID,
          eta_to: { port_id: POD_ID, previous_port_id: POL_ID },
        },
        client,
      );

      expect(result).toMatchObject({
        id: VESSEL_ID,
        name: 'MAERSK KENSINGTON',
        eta: null,
        eta_note: ETA_PORTS_NOTE,
      });
      expect(getVesselOutputSchema.parse(result)).toEqual(result);
    },
  );

  it.each([
    ['no data', {}],
    ['data with no id', { data: { attributes: vesselAttributes } }],
    ['attributes that are not an object', { data: { id: VESSEL_ID } }],
  ])(
    'fails instead of reporting an empty vessel for a response with %s',
    async (_case, body) => {
      const { client } = fakeApiClient({
        [`GET /vessels/${VESSEL_ID}`]: { body },
      });

      await expect(
        executeGetVessel({ id: VESSEL_ID }, client),
      ).rejects.toThrow();
    },
  );

  it.each([
    ['no data', {}],
    [
      'no positions list',
      { data: { id: VESSEL_ID, attributes: vesselAttributes } },
    ],
  ])(
    'fails instead of reporting an empty projection for a response with %s',
    async (_case, body) => {
      const { client } = fakeApiClient({
        [`GET /vessels/${VESSEL_ID}`]: { body: vessel() },
        [`GET /vessels/${VESSEL_ID}/future_positions`]: { body },
      });

      await expect(
        executeGetVessel(
          {
            id: VESSEL_ID,
            eta_to: { port_id: POD_ID, previous_port_id: POL_ID },
          },
          client,
        ),
      ).rejects.toThrow();
    },
  );

  it('still fails with not found when the vessel itself is unknown', async () => {
    const { client } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}/future_positions`]: { status: 404 },
    });

    await expect(
      executeGetVessel(
        {
          id: VESSEL_ID,
          eta_to: { port_id: POD_ID, previous_port_id: POL_ID },
        },
        client,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns a soft FeatureNotEnabled result when vessel data is gated', async () => {
    const { client } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: featureNotEnabled,
    });

    const result = await executeGetVessel({ id: VESSEL_ID }, client);

    expect(result).toEqual(VESSEL_FEATURE_NOT_ENABLED);
    expect(getVesselOutputSchema.parse(result)).toEqual(result);
  });

  it('rejects a starting latitude without a longitude before calling the API', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeGetVessel(
        {
          id: VESSEL_ID,
          eta_to: { port_id: POD_ID, previous_port_id: POL_ID, latitude: 30 },
        },
        client,
      ),
    ).rejects.toMatchObject({ name: 'ToolInputError' });
    expect(requests).toEqual([]);
  });

  it('lets a 403 that names no feature fail the call', async () => {
    const { client } = fakeApiClient({
      [`GET /vessels/${VESSEL_ID}`]: {
        status: 403,
        body: { errors: [{ status: '403', detail: 'Forbidden' }] },
      },
    });

    await expect(
      executeGetVessel({ id: VESSEL_ID }, client),
    ).rejects.toMatchObject({ status: 403 });
  });
});
