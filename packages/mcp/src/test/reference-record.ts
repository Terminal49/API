import { z } from 'zod';
import type { FakeRequest, FakeResponse } from './fake-api.js';

export const REF_CONTAINER_ID = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** A raw container record with this ref_numbers list. */
export const refContainer = (refNumbers: string[]) => ({
  data: {
    id: REF_CONTAINER_ID,
    type: 'container',
    attributes: { number: 'MSCU1234565', ref_numbers: refNumbers },
  },
});

/** The ref_numbers list a PATCH request sent. */
export const sentRefNumbers = (request: FakeRequest) =>
  z
    .object({
      data: z.object({
        attributes: z.object({ ref_numbers: z.array(z.string()) }),
      }),
    })
    .parse(request.body).data.attributes.ref_numbers;

/**
 * Routes for a record whose ref_numbers follow every PATCH, like the real
 * API. `body` builds the raw record for a list.
 */
export function storedRefNumbers(
  initial: string[],
  body: (refNumbers: string[]) => unknown = refContainer,
) {
  let list = initial;
  return {
    get: (): FakeResponse => ({ body: body(list) }),
    patch: (request: FakeRequest): FakeResponse => {
      list = sentRefNumbers(request);
      return { body: body(list) };
    },
    current: () => list,
  };
}
