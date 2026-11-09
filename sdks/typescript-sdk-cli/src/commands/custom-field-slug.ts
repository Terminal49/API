import type { Terminal49Client } from '@terminal49/sdk';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The api_slug that POST /{entity}/{id}/custom_fields expects. The backend
 * strips every character but letters, digits, and `_` from api_slugs, so a
 * UUID can only be a definition id; it is resolved to that definition's slug.
 */
export async function customFieldSlug(
  client: Terminal49Client,
  slugOrDefinitionId: string,
): Promise<string> {
  if (!UUID.test(slugOrDefinitionId)) return slugOrDefinitionId;
  const definition = await client.customFieldDefinitions.get(
    slugOrDefinitionId,
    { format: 'raw' },
  );
  return definition.data.attributes.api_slug;
}
