import { describe, expect, it } from 'vitest';
import { projectFields } from '../src/output/fields.js';

describe('projectFields', () => {
  it('projects simple object fields', () => {
    const input = {
      id: 'abc',
      container: {
        number: 'MSCU1234567',
        status: 'in_transit',
      },
      nested: {
        deep: {
          code: 'X1',
        },
      },
      ignored: true,
    };

    const out = projectFields(input, 'id,container.number,nested.deep.code');
    expect(out).toEqual({
      id: 'abc',
      container: { number: 'MSCU1234567' },
      nested: { deep: { code: 'X1' } },
    });
    expect((out as { ignored?: boolean }).ignored).toBeUndefined();
  });

  it('projects arrays using top-level object projection', () => {
    const input = [
      { id: 'a', value: 1, nested: { keep: 'x' } },
      { id: 'b', nested: { keep: 'y' } },
    ];

    const out = projectFields(input, 'id,nested.keep');
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([
      { id: 'a', nested: { keep: 'x' } },
      { id: 'b', nested: { keep: 'y' } },
    ]);
  });

  it('projects list envelopes with items rows', () => {
    const input = {
      items: [
        { id: 'a', value: 1, nested: { keep: 'x', drop: 'n' } },
        { id: 'b', value: 2, nested: { keep: 'y', drop: 'n' } },
      ],
      meta: { page: 1 },
    };

    const out = projectFields(input, 'id,nested.keep');
    expect(out).toEqual({
      items: [
        { id: 'a', nested: { keep: 'x' } },
        { id: 'b', nested: { keep: 'y' } },
      ],
      meta: { page: 1 },
    });
  });
});
