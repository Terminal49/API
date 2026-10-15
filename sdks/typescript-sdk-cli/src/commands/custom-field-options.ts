/**
 * t49 custom-field-options <action>
 */

import type { Command } from 'commander';
import { parseJsonObjectPayload } from '../util/input.js';
import { action, listAction } from './action.js';

type PayloadOptions = {
  payload: Record<string, unknown>;
};

export function registerCustomFieldOptionsCommand(program: Command): void {
  const cmd = program
    .command('custom-field-options')
    .description('Manage options for a custom field definition');

  const listCommand = cmd
    .command('list <definition-id>')
    .description('List options for a custom field definition');
  listCommand.action(
    listAction('custom-field-options.list', async ({ client, globals }) => {
      const [definitionId] = listCommand.processedArgs as [string];
      return client.customFieldOptions.list(definitionId, {
        format: globals.format,
      });
    }),
  );

  cmd
    .command('get <definition-id> <option-id>')
    .description('Get a custom field option')
    .action(
      action(
        'custom-field-options.get',
        async ({ client, globals }, definitionId: string, optionId: string) =>
          client.customFieldOptions.get(definitionId, optionId, {
            format: globals.format,
          }),
      ),
    );

  const createCommand = cmd
    .command('create <definition-id>')
    .description('Create a custom field option')
    .requiredOption(
      '--payload <json>',
      'Option object JSON payload',
      parseJsonObjectPayload,
    );
  createCommand.action(
    action(
      'custom-field-options.create',
      async ({ client, globals }, definitionId: string) => {
        const options = createCommand.opts() as PayloadOptions;
        return client.customFieldOptions.create(definitionId, options.payload, {
          format: globals.format,
        });
      },
    ),
  );

  const updateCommand = cmd
    .command('update <definition-id> <option-id>')
    .description('Update a custom field option')
    .requiredOption(
      '--payload <json>',
      'Option object JSON payload',
      parseJsonObjectPayload,
    );
  updateCommand.action(
    action(
      'custom-field-options.update',
      async ({ client, globals }, definitionId: string, optionId: string) => {
        const options = updateCommand.opts() as PayloadOptions;
        return client.customFieldOptions.update(
          definitionId,
          optionId,
          options.payload,
          {
            format: globals.format,
          },
        );
      },
    ),
  );

  cmd
    .command('delete <definition-id> <option-id>')
    .description('Delete a custom field option')
    .action(
      action(
        'custom-field-options.delete',
        async ({ client, globals }, definitionId: string, optionId: string) =>
          client.customFieldOptions.delete(definitionId, optionId, {
            format: globals.format,
          }),
      ),
    );
}
