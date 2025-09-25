// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, Endpoint, HandlerFunction } from './types';

export { Metadata, Endpoint, HandlerFunction };

import retrieve_shipments from './shipments/retrieve-shipments';
import update_shipments from './shipments/update-shipments';
import list_shipments from './shipments/list-shipments';
import resume_tracking_shipments from './shipments/resume-tracking-shipments';
import stop_tracking_shipments from './shipments/stop-tracking-shipments';
import create_tracking_requests from './tracking-requests/create-tracking-requests';
import retrieve_tracking_requests from './tracking-requests/retrieve-tracking-requests';
import update_tracking_requests from './tracking-requests/update-tracking-requests';
import list_tracking_requests from './tracking-requests/list-tracking-requests';
import create_webhooks from './webhooks/create-webhooks';
import retrieve_webhooks from './webhooks/retrieve-webhooks';
import update_webhooks from './webhooks/update-webhooks';
import list_webhooks from './webhooks/list-webhooks';
import delete_webhooks from './webhooks/delete-webhooks';
import list_ips_webhooks from './webhooks/list-ips-webhooks';
import retrieve_webhook_notifications from './webhook-notifications/retrieve-webhook-notifications';
import list_webhook_notifications from './webhook-notifications/list-webhook-notifications';
import get_examples_webhook_notifications from './webhook-notifications/get-examples-webhook-notifications';
import retrieve_containers from './containers/retrieve-containers';
import update_containers from './containers/update-containers';
import list_containers from './containers/list-containers';
import get_raw_events_containers from './containers/get-raw-events-containers';
import get_transport_events_containers from './containers/get-transport-events-containers';
import retrieve_shipping_lines from './shipping-lines/retrieve-shipping-lines';
import list_shipping_lines from './shipping-lines/list-shipping-lines';
import retrieve_metro_areas from './metro-areas/retrieve-metro-areas';
import retrieve_ports from './ports/retrieve-ports';
import retrieve_by_id_vessels from './vessels/retrieve-by-id-vessels';
import retrieve_by_imo_vessels from './vessels/retrieve-by-imo-vessels';
import retrieve_terminals from './terminals/retrieve-terminals';
import create_parties from './parties/create-parties';
import retrieve_parties from './parties/retrieve-parties';
import update_parties from './parties/update-parties';
import list_parties from './parties/list-parties';

export const endpoints: Endpoint[] = [];

function addEndpoint(endpoint: Endpoint) {
  endpoints.push(endpoint);
}

addEndpoint(retrieve_shipments);
addEndpoint(update_shipments);
addEndpoint(list_shipments);
addEndpoint(resume_tracking_shipments);
addEndpoint(stop_tracking_shipments);
addEndpoint(create_tracking_requests);
addEndpoint(retrieve_tracking_requests);
addEndpoint(update_tracking_requests);
addEndpoint(list_tracking_requests);
addEndpoint(create_webhooks);
addEndpoint(retrieve_webhooks);
addEndpoint(update_webhooks);
addEndpoint(list_webhooks);
addEndpoint(delete_webhooks);
addEndpoint(list_ips_webhooks);
addEndpoint(retrieve_webhook_notifications);
addEndpoint(list_webhook_notifications);
addEndpoint(get_examples_webhook_notifications);
addEndpoint(retrieve_containers);
addEndpoint(update_containers);
addEndpoint(list_containers);
addEndpoint(get_raw_events_containers);
addEndpoint(get_transport_events_containers);
addEndpoint(retrieve_shipping_lines);
addEndpoint(list_shipping_lines);
addEndpoint(retrieve_metro_areas);
addEndpoint(retrieve_ports);
addEndpoint(retrieve_by_id_vessels);
addEndpoint(retrieve_by_imo_vessels);
addEndpoint(retrieve_terminals);
addEndpoint(create_parties);
addEndpoint(retrieve_parties);
addEndpoint(update_parties);
addEndpoint(list_parties);

export type Filter = {
  type: 'resource' | 'operation' | 'tag' | 'tool';
  op: 'include' | 'exclude';
  value: string;
};

export function query(filters: Filter[], endpoints: Endpoint[]): Endpoint[] {
  const allExcludes = filters.length > 0 && filters.every((filter) => filter.op === 'exclude');
  const unmatchedFilters = new Set(filters);

  const filtered = endpoints.filter((endpoint: Endpoint) => {
    let included = false || allExcludes;

    for (const filter of filters) {
      if (match(filter, endpoint)) {
        unmatchedFilters.delete(filter);
        included = filter.op === 'include';
      }
    }

    return included;
  });

  // Check if any filters didn't match
  const unmatched = Array.from(unmatchedFilters).filter((f) => f.type === 'tool' || f.type === 'resource');
  if (unmatched.length > 0) {
    throw new Error(
      `The following filters did not match any endpoints: ${unmatched
        .map((f) => `${f.type}=${f.value}`)
        .join(', ')}`,
    );
  }

  return filtered;
}

function match({ type, value }: Filter, endpoint: Endpoint): boolean {
  switch (type) {
    case 'resource': {
      const regexStr = '^' + normalizeResource(value).replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexStr);
      return regex.test(normalizeResource(endpoint.metadata.resource));
    }
    case 'operation':
      return endpoint.metadata.operation === value;
    case 'tag':
      return endpoint.metadata.tags.includes(value);
    case 'tool':
      return endpoint.tool.name === value;
  }
}

function normalizeResource(resource: string): string {
  return resource.toLowerCase().replace(/[^a-z.*\-_]*/g, '');
}
