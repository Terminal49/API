import type { Terminal49Client } from './client.js';

export function shipmentUpdateCalls(client: Terminal49Client): void {
  void client.shipments.update('s-1', { ref_numbers: ['PO-1'], tags: ['hot'] });
  void client.updateShipment('s-1', { tags: [] });
  void client.shipments.update('s-1', {
    user_provided_mbl_number: 'MEDUFR030802',
    user_provided_booking_number: 'BK123456',
  });
  void client.updateShipment('s-1', {
    user_provided_booking_number: 'BK123456',
  });
  // @ts-expect-error tags is a list, not a comma-separated string
  void client.shipments.update('s-1', { tags: 'a,b' });
  // @ts-expect-error tags is a list, not a comma-separated string
  void client.updateShipment('s-1', { tags: 'a,b' });
  // @ts-expect-error the API ignores ref_number; send ref_numbers
  void client.shipments.update('s-1', { ref_number: 'PO-1' });
}
