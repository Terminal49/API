import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import { executeGetLocation, getLocationOutputSchema } from './get-location.js';

const PORT_ID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const TERMINAL_ID = '1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b';
const METRO_ID = '13a8bea0-36e7-4186-a9a0-5fc4f94ccdd9';

const port = {
  data: {
    id: PORT_ID,
    type: 'port',
    attributes: {
      name: 'Los Angeles',
      code: 'USLAX',
      state_abbr: 'CA',
      city: 'Los Angeles',
      country_code: 'US',
      time_zone: 'America/Los_Angeles',
      latitude: '33.7395',
      longitude: '-118.2610',
    },
  },
};

const terminal = {
  data: {
    id: TERMINAL_ID,
    type: 'terminal',
    attributes: {
      name: 'APM Terminals Pier 400',
      nickname: 'APM',
      firms_code: 'W185',
      smdg_code: 'APMT',
      bic_facility_code: 'USLAXAPMT',
      street: '2500 Navy Way',
      city: 'San Pedro',
      state: 'California',
      state_abbr: 'CA',
      zip: '90731',
      country: 'United States',
    },
    relationships: { port: { data: { id: PORT_ID, type: 'port' } } },
  },
};

describe('get_location', () => {
  it('returns a port by UN/LOCODE with numeric coordinates', async () => {
    const { client, requests } = fakeApiClient({
      'GET /ports/USLAX': { body: port },
    });

    const result = await executeGetLocation(
      { kind: 'port', id: 'uslax' },
      client,
    );

    expect(requests.map((request) => request.path)).toEqual(['/ports/USLAX']);
    expect(result).toEqual({
      kind: 'port',
      id: PORT_ID,
      name: 'Los Angeles',
      code: 'USLAX',
      city: 'Los Angeles',
      state_abbr: 'CA',
      country_code: 'US',
      time_zone: 'America/Los_Angeles',
      latitude: 33.7395,
      longitude: -118.261,
    });
    expect(getLocationOutputSchema.parse(result)).toEqual(result);
  });

  it('returns a terminal with its address and the time zone of its port', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /terminals/${TERMINAL_ID}`]: { body: terminal },
      [`GET /ports/${PORT_ID}`]: { body: port },
    });

    const result = await executeGetLocation(
      { kind: 'terminal', id: TERMINAL_ID },
      client,
    );

    expect(requests.map((request) => request.path)).toEqual([
      `/terminals/${TERMINAL_ID}`,
      `/ports/${PORT_ID}`,
    ]);
    expect(result).toEqual({
      kind: 'terminal',
      id: TERMINAL_ID,
      name: 'APM Terminals Pier 400',
      time_zone: 'America/Los_Angeles',
      nickname: 'APM',
      firms_code: 'W185',
      smdg_code: 'APMT',
      bic_facility_code: 'USLAXAPMT',
      address: {
        street: '2500 Navy Way',
        city: 'San Pedro',
        state: 'California',
        state_abbr: 'CA',
        zip: '90731',
        country: 'United States',
      },
      port: {
        id: PORT_ID,
        name: 'Los Angeles',
        code: 'USLAX',
        time_zone: 'America/Los_Angeles',
      },
    });
    expect(getLocationOutputSchema.parse(result)).toEqual(result);
  });

  it('still returns a terminal when its port cannot be read', async () => {
    const { client } = fakeApiClient({
      [`GET /terminals/${TERMINAL_ID}`]: { body: terminal },
    });

    const result = await executeGetLocation(
      { kind: 'terminal', id: TERMINAL_ID },
      client,
    );

    expect(result).toMatchObject({
      firms_code: 'W185',
      time_zone: null,
      port: null,
    });
  });

  it('returns a metro area without a city', async () => {
    const { client } = fakeApiClient({
      [`GET /metro_areas/${METRO_ID}`]: {
        body: {
          data: {
            id: METRO_ID,
            type: 'metro_area',
            attributes: {
              name: 'Los Angeles',
              code: 'USLAX',
              state_abbr: 'CA',
              country_code: 'US',
              time_zone: 'America/Los_Angeles',
              latitude: '34.0522342',
              longitude: '-118.2436849',
            },
          },
        },
      },
    });

    const result = await executeGetLocation(
      { kind: 'metro_area', id: METRO_ID },
      client,
    );

    expect(result).toMatchObject({
      kind: 'metro_area',
      code: 'USLAX',
      latitude: 34.0522342,
    });
    expect(result).not.toHaveProperty('city');
  });

  it('treats an unknown metro area, which answers data: null, as not found', async () => {
    const { client } = fakeApiClient({
      'GET /metro_areas/ZZZZZ': { body: { data: null } },
    });

    await expect(
      executeGetLocation({ kind: 'metro_area', id: 'ZZZZZ' }, client),
    ).rejects.toMatchObject({ name: 'NotFoundError', status: 404 });
  });

  it('rejects a UN/LOCODE for a terminal before calling the API', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeGetLocation({ kind: 'terminal', id: 'USLAX' }, client),
    ).rejects.toMatchObject({
      name: 'ToolInputError',
      message: 'A terminal id must be a Terminal49 UUID.',
    });
    expect(requests).toEqual([]);
  });

  it('rejects an id that is neither a UUID nor a UN/LOCODE', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeGetLocation({ kind: 'port', id: 'Los Angeles' }, client),
    ).rejects.toMatchObject({ name: 'ToolInputError' });
    expect(requests).toEqual([]);
  });
});
