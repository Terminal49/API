/**
 * Container status values from Terminal49 API
 */
export type ContainerStatus =
  | 'new'
  | 'on_ship'
  | 'available'
  | 'not_available'
  | 'grounded'
  | 'awaiting_inland_transfer'
  | 'on_rail'
  | 'picked_up'
  | 'off_dock'
  | 'delivered'
  | 'empty_returned'
  | 'dropped'
  | 'loaded';

/**
 * Status badge configuration
 */
export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}

/**
 * SDK method showcase metadata
 */
export interface MethodShowcase {
  name: string;
  namespace: string;
  description: string;
  codeExample: string;
  page: string;
}

/**
 * Dashboard summary stats
 */
export interface DashboardStats {
  totalShipments: number;
  totalContainers: number;
  inTransit: number;
  available: number;
  urgentLfd: number;
  pendingRequests: number;
}

/**
 * LFD Alert item
 */
export interface LfdAlert {
  containerId: string;
  containerNumber: string;
  lfd: string;
  daysRemaining: number;
  terminal: string;
}

/**
 * Tracking request inference result
 */
export interface InferenceResult {
  number_type: 'container' | 'booking' | 'bill_of_lading';
  decision: 'auto_select' | 'needs_confirmation';
  candidates: Array<{
    scac: string;
    name: string;
    confidence: number;
  }>;
  selected?: {
    scac: string;
    name: string;
  };
}
