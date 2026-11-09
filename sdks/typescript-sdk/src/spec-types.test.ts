import { describe, expectTypeOf, it } from 'vite-plus/test';
import type { ContainerManager } from './client/managers/containers.js';
import type { ShipmentManager } from './client/managers/shipments.js';
import type { TrackingRequestManager } from './client/managers/tracking-requests.js';
import type { components } from './generated/terminal49.js';
import type { Terminal49Client } from './client.js';
import type { Transport } from './client/transport.js';
import type { TrackingRequestInclude } from './types/options.js';

describe('generated spec types', () => {
  it('types a container resource as type "container"', () => {
    expectTypeOf<
      components['schemas']['container']['type']
    >().toEqualTypeOf<'container'>();
  });

  it('lets a container have no POD terminal', () => {
    type PodTerminal = NonNullable<
      components['schemas']['container']['relationships']
    >['pod_terminal'];

    expectTypeOf<{ data: null }>().toExtend<NonNullable<PodTerminal>>();
  });

  it('accepts a non-empty object as a custom field value in every setter', () => {
    type ObjectValue = { id: string; type: string };

    expectTypeOf<ObjectValue>().toExtend<
      components['schemas']['custom_field_value']
    >();
    expectTypeOf<ObjectValue>().toExtend<
      Parameters<ContainerManager['updateCustomField']>[2]
    >();
    expectTypeOf<ObjectValue>().toExtend<
      Parameters<ShipmentManager['updateCustomField']>[2]
    >();
    expectTypeOf<ObjectValue>().toExtend<
      Parameters<TrackingRequestManager['setCustomField']>[2]
    >();
    expectTypeOf<ObjectValue>().toExtend<
      Parameters<TrackingRequestManager['updateCustomField']>[2]
    >();
  });

  it('accepts only the tracking request relationships the API serializes as includes', () => {
    type GetInclude = NonNullable<
      NonNullable<
        Parameters<Terminal49Client['getTrackingRequest']>[1]
      >['include']
    >;
    type ListInclude = NonNullable<
      Parameters<TrackingRequestManager['list']>[0]
    >['include'];

    expectTypeOf<
      ['tracked_object', 'customer', 'user']
    >().toExtend<GetInclude>();
    expectTypeOf<
      ['tracked_object', 'customer', 'user']
    >().toExtend<ListInclude>();
    expectTypeOf<['shipment']>().not.toExtend<GetInclude>();
    expectTypeOf<['container']>().not.toExtend<ListInclude>();
  });

  it('offers exactly the relationships the spec documents on a tracking request', () => {
    type SpecRelationship = keyof NonNullable<
      components['schemas']['tracking_request']['relationships']
    >;

    expectTypeOf<TrackingRequestInclude>().toEqualTypeOf<SpecRelationship>();
  });

  it('types the trade intelligence nulls and omissions the service sends', () => {
    type Schemas = components['schemas'];
    type TopImporter = Schemas['TradeIntelTopImporter'];
    type RankingFilters = Schemas['TradeIntelTopImporters']['filters'];
    type ValidationBody =
      components['responses']['TradeIntelValidationFailed']['content']['application/json'];

    expectTypeOf<TopImporter['states']>().toEqualTypeOf<string[] | null>();
    expectTypeOf<TopImporter['estimated_value']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<
      Schemas['TradeIntelCompanyProfileTotals']['states']
    >().toEqualTypeOf<string[] | null>();
    expectTypeOf<Schemas['TradeIntelCompanyProfile']['until']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<keyof RankingFilters>().toEqualTypeOf<
      'hs4' | 'pod' | 'origin_country'
    >();
    expectTypeOf<{
      error: 'Query too broad for the cost cap; narrow the time window or filters.';
    }>().toExtend<ValidationBody>();
  });

  it('types execute as the success body, or undefined for a bodyless success', () => {
    const run = (transport: Transport) => ({
      deleted: transport.execute(() =>
        transport.client.DELETE('/webhooks/{id}', {
          params: { path: { id: 'webhook-id' } },
        }),
      ),
      me: transport.execute(() => transport.client.GET('/me')),
    });
    type Results = ReturnType<typeof run>;

    expectTypeOf<Awaited<Results['deleted']>>().toEqualTypeOf<undefined>();
    expectTypeOf<
      Awaited<Results['me']>['data']['type']
    >().toEqualTypeOf<'credential'>();
  });
});
