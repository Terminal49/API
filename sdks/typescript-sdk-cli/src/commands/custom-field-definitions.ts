/**
 * t49 custom-field-definitions <action>
 */

import type { Command } from 'commander';
import { parseJsonObjectPayload } from '../util/input.js';
import { action, defineList } from './action.js';

type PayloadOptions = {
  payload: Record<string, unknown>;
};

export function registerCustomFieldDefinitionsCommand(program: Command): void {
  const cmd = program
    .command('custom-field-definitions')
    .description('Manage custom field definitions');

  const listCommand = cmd
    .command('list')
    .description('List custom field definitions')
    .option(
      '--templates',
      'List the Terminal49 templates you can copy with template_id instead of your account definitions',
    );
  defineList(listCommand, {
    name: 'custom-field-definitions.list',
    paginated: false,
    run: ({ client, format }) => {
      const { templates } = listCommand.opts() as { templates?: boolean };
      return client.customFieldDefinitions.list({
        format,
        scope: templates ? 'templates' : 'account',
      });
    },
  });

  cmd
    .command('get <id>')
    .description('Get a custom field definition')
    .action(
      action(
        'custom-field-definitions.get',
        async ({ client, globals }, id: string) =>
          client.customFieldDefinitions.get(id, { format: globals.format }),
      ),
    );

  const createCommand = cmd
    .command('create')
    .description('Create a custom field definition')
    .requiredOption(
      '--payload <json>',
      'Custom field definition JSON payload',
      parseJsonObjectPayload,
    );
  createCommand.action(
    action('custom-field-definitions.create', async ({ client, globals }) => {
      const options = createCommand.opts() as PayloadOptions;
      return client.customFieldDefinitions.create(options.payload, {
        format: globals.format,
      });
    }),
  );

  const updateCommand = cmd
    .command('update <id>')
    .description('Update a custom field definition')
    .requiredOption(
      '--payload <json>',
      'Custom field definition JSON payload',
      parseJsonObjectPayload,
    );
  updateCommand.action(
    action(
      'custom-field-definitions.update',
      async ({ client, globals }, id: string) => {
        const options = updateCommand.opts() as PayloadOptions;
        return client.customFieldDefinitions.update(id, options.payload, {
          format: globals.format,
        });
      },
    ),
  );

  cmd
    .command('delete <id>')
    .description('Delete a custom field definition')
    .action(
      action(
        'custom-field-definitions.delete',
        async ({ client, globals }, id: string) =>
          client.customFieldDefinitions.delete(id, { format: globals.format }),
      ),
    );
}
