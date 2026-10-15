/**
 * t49 custom-fields <action>
 */

import type { Command } from 'commander';
import { parseJsonObjectPayload } from '../util/input.js';
import { action, listAction } from './action.js';

type PayloadOptions = {
  payload: Record<string, unknown>;
};

export function registerCustomFieldsCommand(program: Command): void {
  const cmd = program
    .command('custom-fields')
    .description('Manage custom fields');

  const listCommand = cmd
    .command('list')
    .description('List custom field assignments');
  listCommand.action(
    listAction('custom-fields.list', async ({ client, globals }) => {
      return client.customFields.list({
        format: globals.format,
      });
    }),
  );

  cmd
    .command('get <id>')
    .description('Get a custom field')
    .action(
      action('custom-fields.get', async ({ client, globals }, id: string) =>
        client.customFields.get(id, { format: globals.format }),
      ),
    );

  const createCommand = cmd
    .command('create')
    .description('Create a custom field assignment')
    .requiredOption(
      '--payload <json>',
      'Custom field JSON payload',
      parseJsonObjectPayload,
    );
  createCommand.action(
    action('custom-fields.create', async ({ client, globals }) => {
      const options = createCommand.opts() as PayloadOptions;
      return client.customFields.create(options.payload, {
        format: globals.format,
      });
    }),
  );

  const updateCommand = cmd
    .command('update <id>')
    .description('Update a custom field assignment')
    .requiredOption(
      '--payload <json>',
      'Custom field JSON payload',
      parseJsonObjectPayload,
    );
  updateCommand.action(
    action('custom-fields.update', async ({ client, globals }, id: string) => {
      const options = updateCommand.opts() as PayloadOptions;
      return client.customFields.update(id, options.payload, {
        format: globals.format,
      });
    }),
  );

  cmd
    .command('delete <id>')
    .description('Delete a custom field assignment')
    .action(
      action('custom-fields.delete', async ({ client, globals }, id: string) =>
        client.customFields.delete(id, { format: globals.format }),
      ),
    );
}
