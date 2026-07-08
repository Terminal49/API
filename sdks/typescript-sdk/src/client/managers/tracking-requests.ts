import type { TrackingRequest } from '../../types/models.js';
import type {
  CallOptions,
  IncludeParam,
  ListOptions,
  TrackingRequestInclude,
} from '../../types/options.js';
import { ValidationError } from '../errors.js';
import { mapTrackingRequest, mapTrackingRequestList } from '../mappers.js';
import { copyStringParams, normalizeInclude } from '../query.js';
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

export interface TrackingRequestListFilters {
  [key: string]: IncludeParam<TrackingRequestInclude> | string | undefined;
  include?: IncludeParam<TrackingRequestInclude>;
}

export class TrackingRequestManager extends BaseManager {
  async list(
    filters: TrackingRequestListFilters = {},
    options?: ListOptions,
  ): Promise<any> {
    const params: Record<string, string> = {};
    copyStringParams(params, filters, ['include']);
    const includesStr = normalizeInclude(filters.include);
    if (includesStr) params.include = includesStr;
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
      (pageOpts) =>
        this.list(filters, { ...options, ...pageOpts, format: 'mapped' }),
      options,
    );
  }

  async get(
    id: string,
    options?: CallOptions & { include?: IncludeParam<TrackingRequestInclude> },
  ): Promise<any> {
    const query: any = {};
    const includesStr = normalizeInclude(options?.include);
    if (includesStr) query.include = includesStr;

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/tracking_requests/{id}', {
        params: {
          path: { id },
          query: Object.keys(query).length > 0 ? query : undefined,
        },
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
    autoDetectVoccScac?: boolean;
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

    const attributes: Record<string, unknown> = {
      request_type: params.requestType,
      request_number: params.requestNumber,
      scac: params.scac ?? '',
      ref_numbers: params.refNumbers,
      shipment_tags: params.shipmentTags,
    };

    if (params.autoDetectVoccScac) {
      attributes.auto_detect_vocc_scac = true;
      if (!params.scac) delete attributes.scac;
    }

    const payload = {
      data: {
        type: 'tracking_request' as const,
        attributes,
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
