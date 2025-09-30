// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'containers',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/containers/{id}/raw_events',
  operationId: 'get-containers-id-raw_events',
};

export const tool: Tool = {
  name: 'get_raw_events_containers',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\n#### Deprecation warning\nThe `raw_events` endpoint is provided as-is.\n\n For past events we recommend consuming `transport_events`.\n\n---\nGet a list of past and future (estimated) milestones for a container as reported by the carrier. Some of the data is normalized even though the API is called raw_events. \n\nNormalized attributes: `event` and `timestamp` timestamp. Not all of the `event` values have been normalized. You can expect the the events related to container movements to be normalized but there are cases where events are not normalized. \n\nFor past historical events we recommend consuming `transport_events`. Although there are fewer events here those events go through additional vetting and normalization to avoid false positives and get you correct data.\n\n# Response Schema\n```json\n{\n  type: 'object',\n  properties: {\n    data: {\n      type: 'array',\n      items: {\n        type: 'object',\n        title: 'Raw Event Model',\n        description: 'Raw Events represent the milestones from the shipping line for a given container.\\n\\n### About raw_event datetimes\\n\\nThe events may include estimated future events. The event is a future event if an `estimated_` timestamp is not null. \\n\\nThe datetime properties `timestamp` and `estimated`. \\n\\nWhen the `time_zone` property is present the datetimes are UTC timestamps, which can be converted to the local time by parsing the provided `time_zone`.\\n\\nWhen the `time_zone` property is absent, the datetimes represent local times which serialized as UTC timestamps for consistency. ',\n        properties: {\n          id: {\n            type: 'string'\n          },\n          attributes: {\n            type: 'object',\n            properties: {\n              actual_at: {\n                type: 'string',\n                description: 'Deprecated: The datetime the event transpired in UTC',\n                format: 'date-time'\n              },\n              actual_on: {\n                type: 'string',\n                description: 'Deprecated: The date of the event at the event location when no time information is available. ',\n                format: 'date'\n              },\n              created_at: {\n                type: 'string',\n                description: 'When the raw_event was created in UTC',\n                format: 'date-time'\n              },\n              estimated: {\n                type: 'boolean',\n                description: 'True if the timestamp is estimated, false otherwise'\n              },\n              estimated_at: {\n                type: 'string',\n                description: 'Deprecated: The estimated datetime the event will occur in UTC',\n                format: 'date-time'\n              },\n              estimated_on: {\n                type: 'string',\n                description: 'Deprecated: The estimated date of the event at the event location when no time information is available. ',\n                format: 'date'\n              },\n              event: {\n                type: 'string',\n                description: 'Normalized string representing the event',\n                enum: [                  'empty_out',\n                  'full_in',\n                  'positioned_in',\n                  'positioned_out',\n                  'vessel_loaded',\n                  'vessel_departed',\n                  'transshipment_arrived',\n                  'transshipment_discharged',\n                  'transshipment_loaded',\n                  'transshipment_departed',\n                  'feeder_arrived',\n                  'feeder_discharged',\n                  'feeder_loaded',\n                  'feeder_departed',\n                  'rail_loaded',\n                  'rail_departed',\n                  'rail_arrived',\n                  'rail_unloaded',\n                  'vessel_arrived',\n                  'vessel_discharged',\n                  'arrived_at_destination',\n                  'delivered',\n                  'full_out',\n                  'empty_in',\n                  'vgm_received',\n                  'carrier_release',\n                  'customs_release'\n                ]\n              },\n              index: {\n                type: 'integer',\n                description: 'The order of the event. This may be helpful when only dates (i.e. actual_on) are available.'\n              },\n              location_locode: {\n                type: 'string',\n                description: 'UNLOCODE of the event location'\n              },\n              location_name: {\n                type: 'string',\n                description: 'The city or facility name of the event location'\n              },\n              original_event: {\n                type: 'string',\n                description: 'The event name as returned by the carrier'\n              },\n              timestamp: {\n                type: 'string',\n                description: 'The datetime the event either transpired or will occur in UTC',\n                format: 'date-time'\n              },\n              timezone: {\n                type: 'string',\n                description: 'IANA tz where the event occured'\n              },\n              vessel_imo: {\n                type: 'string',\n                description: 'The IMO of the vessel where applicable'\n              },\n              vessel_name: {\n                type: 'string',\n                description: 'The name of the vessel where applicable'\n              },\n              voyage_number: {\n                type: 'string'\n              }\n            }\n          },\n          relationships: {\n            type: 'object',\n            properties: {\n              location: {\n                type: 'object',\n                properties: {\n                  data: {\n                    type: 'object',\n                    properties: {\n                      id: {\n                        type: 'string'\n                      },\n                      type: {\n                        type: 'string',\n                        enum: [                          'port',\n                          'metro_area'\n                        ]\n                      }\n                    }\n                  }\n                }\n              },\n              vessel: {\n                type: 'object',\n                properties: {\n                  data: {\n                    type: 'object',\n                    properties: {\n                      id: {\n                        type: 'string'\n                      },\n                      type: {\n                        type: 'string',\n                        enum: [                          'vessel'\n                        ]\n                      }\n                    }\n                  }\n                }\n              }\n            }\n          },\n          type: {\n            type: 'string',\n            enum: [              'raw_event'\n            ]\n          }\n        }\n      }\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      jq_filter: {
        type: 'string',
        title: 'jq Filter',
        description:
          'A jq filter to apply to the response to include certain fields. Consult the output schema in the tool description to see the fields that are available.\n\nFor example: to include only the `name` field in every object of a results array, you can provide ".results[].name".\n\nFor more information, see the [jq documentation](https://jqlang.org/manual/).',
      },
    },
    required: ['id'],
  },
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, jq_filter, ...body } = args as any;
  return asTextContentResult(await maybeFilter(jq_filter, await client.containers.getRawEvents(id)));
};

export default { metadata, tool, handler };
