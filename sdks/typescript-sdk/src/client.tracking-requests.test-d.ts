import type { Terminal49Client } from './client.js';

export function trackingRequestUpdateCalls(client: Terminal49Client): void {
  void client.trackingRequests.update('tr-1', { ref_numbers: ['PO-1'] });
  void client.updateTrackingRequest('tr-1', { ref_numbers: [] });
  // @ts-expect-error the API ignores ref_number; send ref_numbers
  void client.trackingRequests.update('tr-1', { ref_number: 'PO-1' });
  // @ts-expect-error the API ignores ref_number; send ref_numbers
  void client.updateTrackingRequest('tr-1', { ref_number: 'PO-1' });
  // @ts-expect-error ref_numbers is a list
  void client.trackingRequests.update('tr-1', { ref_numbers: 'PO-1' });
}
