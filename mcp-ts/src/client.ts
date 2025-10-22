/**
 * Terminal49 API Client
 * Handles HTTP requests to Terminal49 API with retry logic and error handling
 */

export class Terminal49Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Terminal49Error';
  }
}

export class AuthenticationError extends Terminal49Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends Terminal49Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Terminal49Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Terminal49Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class UpstreamError extends Terminal49Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

interface Terminal49ClientConfig {
  apiToken: string;
  apiBaseUrl?: string;
  maxRetries?: number;
}

interface FetchOptions extends RequestInit {
  retries?: number;
}

export class Terminal49Client {
  private apiToken: string;
  private apiBaseUrl: string;
  private maxRetries: number;

  constructor(config: Terminal49ClientConfig) {
    if (!config.apiToken) {
      throw new AuthenticationError('API token is required');
    }
    this.apiToken = config.apiToken;
    this.apiBaseUrl = config.apiBaseUrl || 'https://api.terminal49.com/v2';
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * GET /containers/:id
   */
  async getContainer(id: string): Promise<any> {
    const url = `${this.apiBaseUrl}/containers/${id}?include=shipment,pod_terminal,transport_events`;
    return this.request(url);
  }

  /**
   * POST /tracking_requests
   */
  async trackContainer(params: {
    containerNumber?: string;
    bookingNumber?: string;
    scac?: string;
    refNumbers?: string[];
  }): Promise<any> {
    const requestType = params.containerNumber ? 'container' : 'bill_of_lading';
    const requestNumber = params.containerNumber || params.bookingNumber;

    const payload = {
      data: {
        type: 'tracking_request',
        attributes: {
          request_type: requestType,
          request_number: requestNumber,
          scac: params.scac,
          ref_numbers: params.refNumbers,
        },
      },
    };

    return this.request(`${this.apiBaseUrl}/tracking_requests`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /shipments
   */
  async listShipments(filters: {
    status?: string;
    port?: string;
    carrier?: string;
    updatedAfter?: string;
  } = {}): Promise<any> {
    const params = new URLSearchParams({
      include: 'containers,pod_terminal,pol_terminal',
    });

    if (filters.status) params.append('filter[status]', filters.status);
    if (filters.port) params.append('filter[pod_locode]', filters.port);
    if (filters.carrier) params.append('filter[line_scac]', filters.carrier);
    if (filters.updatedAfter) params.append('filter[updated_at]', filters.updatedAfter);

    const url = `${this.apiBaseUrl}/shipments?${params}`;
    return this.request(url);
  }

  /**
   * GET /containers/:id (focused on demurrage data)
   */
  async getDemurrage(containerId: string): Promise<any> {
    const url = `${this.apiBaseUrl}/containers/${containerId}?include=pod_terminal`;
    const data = await this.request(url);

    const container = data.data?.attributes || {};
    return {
      container_id: containerId,
      pickup_lfd: container.pickup_lfd,
      pickup_appointment_at: container.pickup_appointment_at,
      available_for_pickup: container.available_for_pickup,
      fees_at_pod_terminal: container.fees_at_pod_terminal,
      holds_at_pod_terminal: container.holds_at_pod_terminal,
      pod_arrived_at: container.pod_arrived_at,
      pod_discharged_at: container.pod_discharged_at,
    };
  }

  /**
   * GET /containers/:id (focused on rail milestones)
   */
  async getRailMilestones(containerId: string): Promise<any> {
    const url = `${this.apiBaseUrl}/containers/${containerId}?include=transport_events`;
    const data = await this.request(url);

    const container = data.data?.attributes || {};
    const included = data.included || [];

    const railEvents = included
      .filter((item: any) => item.type === 'transport_event')
      .filter((item: any) => item.attributes?.event?.startsWith('rail.'))
      .map((item: any) => item.attributes);

    return {
      container_id: containerId,
      pod_rail_carrier_scac: container.pod_rail_carrier_scac,
      ind_rail_carrier_scac: container.ind_rail_carrier_scac,
      pod_rail_loaded_at: container.pod_rail_loaded_at,
      pod_rail_departed_at: container.pod_rail_departed_at,
      ind_rail_arrived_at: container.ind_rail_arrived_at,
      ind_rail_unloaded_at: container.ind_rail_unloaded_at,
      ind_eta_at: container.ind_eta_at,
      ind_ata_at: container.ind_ata_at,
      rail_events: railEvents,
    };
  }

  /**
   * Make HTTP request with retry logic
   */
  private async request(url: string, options: FetchOptions = {}): Promise<any> {
    const retries = options.retries || 0;

    const headers = {
      'Authorization': `Token ${this.apiToken}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
      'User-Agent': 'Terminal49-MCP-TS/0.1.0',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle response status codes
      if (response.status === 200 || response.status === 201 || response.status === 202) {
        return response.json();
      }

      if (response.status === 204) {
        return { data: null };
      }

      const body = await response.json().catch(() => ({}));

      switch (response.status) {
        case 400:
          throw new ValidationError(this.extractErrorMessage(body));
        case 401:
          throw new AuthenticationError('Invalid or missing API token');
        case 403:
          throw new AuthenticationError('Access forbidden');
        case 404:
          throw new NotFoundError(this.extractErrorMessage(body) || 'Resource not found');
        case 422:
          throw new ValidationError(this.extractErrorMessage(body));
        case 429:
          // Retry on rate limit
          if (retries < this.maxRetries) {
            const delay = Math.pow(2, retries) * 1000; // Exponential backoff
            await this.sleep(delay);
            return this.request(url, { ...options, retries: retries + 1 });
          }
          throw new RateLimitError('Rate limit exceeded');
        case 500:
        case 502:
        case 503:
        case 504:
          // Retry on server errors
          if (retries < this.maxRetries) {
            const delay = Math.pow(2, retries) * 1000;
            await this.sleep(delay);
            return this.request(url, { ...options, retries: retries + 1 });
          }
          throw new UpstreamError(`Upstream server error (${response.status})`);
        default:
          throw new Terminal49Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Terminal49Error) {
        throw error;
      }
      throw new Terminal49Error(`Request failed: ${(error as Error).message}`);
    }
  }

  /**
   * Extract error message from JSON:API error response
   */
  private extractErrorMessage(body: any): string {
    if (!body?.errors || !Array.isArray(body.errors) || body.errors.length === 0) {
      return 'Unknown error';
    }

    return body.errors
      .map((error: any) => {
        const detail = error.detail;
        const title = error.title;
        const pointer = error.source?.pointer;

        let msg = detail || title || 'Unknown error';
        if (pointer) {
          msg += ` (${pointer})`;
        }
        return msg;
      })
      .join('; ');
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
