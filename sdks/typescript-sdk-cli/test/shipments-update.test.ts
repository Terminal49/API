import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

afterEach(resetApiStub);

const shipment = { data: { id: 's-1', type: 'shipment', attributes: {} } };

describe('shipments update --attr', () => {
  it('splits on the first =, parses JSON values, and sends array attributes as arrays', async () => {
    const requests = stubApi(() => shipment);

    const result = await runProgram([
      '--json',
      'shipments',
      'update',
      's-1',
      '--attr',
      'tags=pr433-attr',
      '--attr',
      'tags=second',
      'tags="third"',
      'ref_numbers=["R1","R2"]',
      '--attr',
      'user_provided_booking_number=12345678901234567890',
      '--attr',
      'user_provided_mbl_number=a=b',
      '--attr',
      'customer_name="0123"',
      '--attr',
      'flag_on=true',
      '--attr',
      'flag_off=false',
    ]);

    expect(result.status).toBe(0);
    expect(
      requests.map(({ method, url, body }) => [method, url.pathname, body]),
    ).toEqual([
      [
        'PATCH',
        '/v2/shipments/s-1',
        {
          data: {
            type: 'shipment',
            id: 's-1',
            attributes: {
              tags: ['pr433-attr', 'second', 'third'],
              ref_numbers: ['R1', 'R2'],
              user_provided_booking_number: '12345678901234567890',
              user_provided_mbl_number: 'a=b',
              customer_name: '0123',
              flag_on: true,
              flag_off: false,
            },
          },
        },
      ],
    ]);
  });

  it('keeps true, false, and null as strings on array attributes only', async () => {
    const requests = stubApi(() => shipment);

    const result = await runProgram([
      '--json',
      'shipments',
      'update',
      's-1',
      '--attr',
      'tags=true',
      '--attr',
      'tags=null',
      '--attr',
      'ref_numbers=false',
      '--attr',
      'user_provided_mbl_number=null',
    ]);

    expect(result.status).toBe(0);
    expect(requests.map(({ body }) => body)).toEqual([
      {
        data: {
          type: 'shipment',
          id: 's-1',
          attributes: {
            tags: ['true', 'null'],
            ref_numbers: ['false'],
            user_provided_mbl_number: null,
          },
        },
      },
    ]);
  });

  it('sends --payload keys and lets an --attr key replace the payload value', async () => {
    const requests = stubApi(() => shipment);

    const result = await runProgram([
      '--json',
      'shipments',
      'update',
      's-1',
      '--payload',
      '{"customer_name":"Acme","tags":["a"],"ref_numbers":["PO-1"]}',
      '--attr',
      'tags=b',
      '--attr',
      'tags=c',
      '--attr',
      'customer_name=Beta',
    ]);

    expect(result.status).toBe(0);
    expect(requests.map(({ body }) => body)).toEqual([
      {
        data: {
          type: 'shipment',
          id: 's-1',
          attributes: {
            customer_name: 'Beta',
            tags: ['b', 'c'],
            ref_numbers: ['PO-1'],
          },
        },
      },
    ]);
  });

  it.each([
    ['no-equals-sign', '--attr expects key=value, got "no-equals-sign"'],
    ['=value', '--attr expects key=value, got "=value"'],
    ['tags=[unclosed', '--attr tags is not valid JSON: [unclosed'],
    ['tags=[1]', '--attr tags must be a string or an array of strings: [1]'],
    [
      'ref_numbers={"a":"b"}',
      '--attr ref_numbers must be a string or an array of strings: {"a":"b"}',
    ],
  ])('rejects --attr %s before calling the API', async (pair, message) => {
    const requests = stubApi(() => shipment);

    const result = await runProgram([
      'shipments',
      'update',
      's-1',
      '--attr',
      pair,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(requests).toEqual([]);
  });
});
