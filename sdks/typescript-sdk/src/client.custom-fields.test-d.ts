import type { Terminal49Client } from './client.js';

export function customFieldListCalls(client: Terminal49Client): void {
  void client.customFieldOptions.list('def-1', { format: 'raw' });
  // @ts-expect-error the API does not paginate custom field options
  void client.customFieldOptions.list('def-1', { page: 2 });
  // @ts-expect-error the API does not paginate custom field options
  void client.listCustomFieldOptions('def-1', { pageSize: 5 });

  void client.customFields.list({ filters: { entityType: 'Shipment' } });
  // @ts-expect-error the API does not paginate custom fields
  void client.customFields.list({ page: 2 });
  // @ts-expect-error the API does not paginate custom fields
  void client.listCustomFields({ pageSize: 5 });

  void client.customFieldDefinitions.list({ scope: 'templates' });
  // @ts-expect-error the API does not paginate custom field definitions
  void client.customFieldDefinitions.list({ page: 2 });
  // @ts-expect-error the API does not paginate custom field definitions
  void client.listCustomFieldDefinitions({ pageSize: 5 });
}
