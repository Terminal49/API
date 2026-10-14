import { describe, expectTypeOf, it } from 'vite-plus/test';
import type { ContainerManager } from './client/managers/containers.js';
import type { ShipmentManager } from './client/managers/shipments.js';
import type { TrackingRequestManager } from './client/managers/tracking-requests.js';
import type { components } from './generated/terminal49.js';

describe('generated spec types', () => {
  it('types a container resource as type "container"', () => {
    expectTypeOf<
      components['schemas']['container']['type']
    >().toEqualTypeOf<'container'>();
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
});
