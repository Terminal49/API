import { ValidationError } from '../errors.js';
import { mapTrackingRequest, mapTrackingRequestList } from '../mappers.js';
import type { TrackingRequest } from '../../types/models.js';
import type { CallOptions, ListOptions, TrackingRequestInclude } from '../../types/options.js';
import { BaseManager } from './base.js';

export type TrackingRequestType =
  | 'container'
  | 'bill_of_lading'
  | 'booking_number';

export interface CreateTrackingRequestFromInferOptions {
  scac?: string;
  numberType?: string;
  refNumbers?: string[];
  shipmentTags?: string[];
}

export class TrackingRequestManager extends BaseManager {
  async list(
    filters: Record<string, string> & { include?: TrackingRequestInclude[] } = {},
    options?: ListOptions,
  ): Promise<any> {
    const params: Record<string, string> = { ...filters } as any;
    if (filters.include) {
      params.include = filters.include.join(',');
    }
    this.applyPagination(params, options);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/tracking_requests', {
        params: { query: params as any },
      }),
    );
    return this.formatResult(raw, options?.format, (doc) =>
      this.mapListResult(doc, mapTrackingRequestList),
    );
  }

  iterate(
    filters: Parameters<TrackingRequestManager['list']>[0] = {},
    options?: Omit<ListOptions, 'page'>,
  ): AsyncGenerator<TrackingRequest, void, unknown> {
    return this.createIterator<TrackingRequest>(
      (pageOpts) => this.list(filters, { ...options, ...pageOpts, format: 'mapped' }),
      options,
    );
  }

  async get(id: string, options?: CallOptions & { include?: TrackingRequestInclude[] }): Promise<any> {
    const query: any = {};
    if (options?.include) {
      query.include = options.include.join(',');
    }

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/tracking_requests/{id}', {
        params: { path: { id }, query: Object.keys(query).length > 0 ? query : undefined },
      }),
    );
    return this.formatResult(raw, options?.format, mapTrackingRequest);
  }

  async update(
    id: string,
    attrs: Record<string, any>,
    options?: CallOptions,
  ): Promise<any> {
    const payload = {
      data: {
        type: 'tracking_request' as const,
        id,
        attributes: attrs,
      },
    };

    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/tracking_requests/{id}', {
        params: { path: { id } },
        body: payload as any,
      }),
    );

    return this.formatResult(raw, options?.format, mapTrackingRequest);
  }

  async create(params: {
    requestType: TrackingRequestType;
    requestNumber: string;
    scac?: string;
    refNumbers?: string[];
    shipmentTags?: string[];
  }): Promise<any> {
    if (!params.requestNumber) {
      throw new ValidationError(
        'request_number is required (/data/attributes/request_number)',
      );
    }
    if (!params.requestType) {
      throw new ValidationError(
        'request_type is required (/data/attributes/request_type)',
      );
    }

    const payload = {
      data: {
        type: 'tracking_request' as const,
        attributes: {
          request_type: params.requestType,
          request_number: params.requestNumber,
          scac: params.scac ?? '',
          ref_numbers: params.refNumbers,
          shipment_tags: params.shipmentTags,
        },
      },
    };

    return this.transport.execute(() =>
      this.transport.client.POST('/tracking_requests', {
        body: payload as any,
      }),
    );
  }

  async inferNumber(number: string): Promise<any> {
    if (!number || number.trim() === '') {
      throw new ValidationError('number is required (/data/attributes/number)');
    }

    return this.transport.execute(() =>
      this.transport.client.POST('/tracking_requests/infer_number', {
        body: { number } as any,
      }),
    );
  }

  async createFromInfer(
    number: string,
    options: CreateTrackingRequestFromInferOptions = {},
  ): Promise<{ infer: any; trackingRequest: any }> {
    const infer = await this.inferNumber(number);
    const attrs = infer?.data?.attributes || {};
    const numberType = this.normalizeInferNumberType(
      attrs.number_type || options.numberType,
    );
    const shippingLine = attrs.shipping_line || {};
    const selected = shippingLine.selected || null;
    const candidates = Array.isArray(shippingLine.candidates)
      ? shippingLine.candidates
      : [];

    const scac =
      options.scac ||
      selected?.scac ||
      (candidates.length === 1 ? candidates[0]?.scac : undefined);

    if (!numberType) {
      throw new ValidationError(
        'Unable to infer tracking number type. Provide numberType to override.',
      );
    }

    if (!scac) {
      throw new ValidationError(
        'Unable to infer carrier SCAC. Provide scac or use infer candidates to select a carrier.',
      );
    }

    const trackingRequest = await this.create({
      requestType: numberType,
      requestNumber: number,
      scac,
      refNumbers: options.refNumbers,
      shipmentTags: options.shipmentTags,
    });

    return { infer, trackingRequest };
  }

  private normalizeInferNumberType(
    numberType?: string,
  ): TrackingRequestType | null {
    if (!numberType) return null;
    if (numberType === 'booking') return 'booking_number';
    if (numberType === 'booking_number') return 'booking_number';
    if (numberType === 'bill_of_lading' || numberType === 'container')
      return numberType;
    return null;
  }
}
