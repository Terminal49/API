import fs from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

interface CollectionItem {
  name: string;
  item?: CollectionItem[];
  response?: { code: number; body: string }[];
}

const collection = JSON.parse(
  fs.readFileSync(
    new URL('../../../Terminal49-API.postman_collection.json', import.meta.url),
    'utf8',
  ),
);

function responses(
  items: CollectionItem[],
  name: string,
): { code: number; body: string }[] {
  for (const item of items) {
    if (item.name === name && item.response) return item.response;
    const nested = responses(item.item ?? [], name);
    if (nested.length > 0) return nested;
  }
  return [];
}

describe('generated document-type Postman examples', () => {
  it('keeps option-only list entries without a schema', () => {
    const example = responses(collection.item, 'List document types').find(
      (item) => item.code === 200,
    );
    expect(example).toBeDefined();
    expect(JSON.parse(example!.body).document_types).toContainEqual({
      code: 'unknown',
      label: 'Unknown',
    });
  });

  it('uses a structural JSON schema in the detail example', () => {
    const example = responses(collection.item, 'Get a document type').find(
      (item) => item.code === 200,
    );
    expect(example).toBeDefined();
    expect(JSON.parse(example!.body).document_type.schema.payload).toEqual({
      type: 'object',
      properties: {},
    });
    expect(example!.body).not.toContain('<Circular reference');
  });

  it('includes required titles in both unauthorized examples', () => {
    for (const name of ['List document types', 'Get a document type']) {
      const example = responses(collection.item, name).find(
        (item) => item.code === 401,
      );
      expect(example).toBeDefined();
      expect(JSON.parse(example!.body).errors).toEqual([
        { detail: 'invalid API token', title: 'Unauthorized' },
      ]);
    }
  });
});
