// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as ShipmentsAPI from './shipments';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Parties extends APIResource {
  /**
   * Creates a new party
   */
  create(
    body: PartyCreateParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<PartyCreateResponse> {
    return this._client.post('/parties', { body, ...options });
  }

  /**
   * Returns a party by it's given identifier
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<PartyRetrieveResponse> {
    return this._client.get(path`/parties/${id}`, options);
  }

  /**
   * Updates a party
   */
  update(
    id: string,
    body: PartyUpdateParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<PartyUpdateResponse> {
    return this._client.patch(path`/parties/${id}`, { body, ...options });
  }

  /**
   * Get a list of parties
   */
  list(
    query: PartyListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<PartyListResponse> {
    return this._client.get('/parties', { query, ...options });
  }
}

export interface LinkSelf {
  self?: string;
}

export interface Party {
  attributes: Party.Attributes;

  id?: string;

  type?: 'party';
}

export namespace Party {
  export interface Attributes {
    /**
     * Company name
     */
    company_name: string;
  }
}

export interface PartyCreateResponse {
  data?: Party;

  links?: LinkSelf;
}

export interface PartyRetrieveResponse {
  data?: Party;

  links?: LinkSelf;
}

export interface PartyUpdateResponse {
  data?: Party;

  links?: LinkSelf;
}

export interface PartyListResponse {
  data?: Array<Party>;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export interface PartyCreateParams {
  data?: PartyCreateParams.Data;
}

export namespace PartyCreateParams {
  export interface Data {
    attributes: Data.Attributes;
  }

  export namespace Data {
    export interface Attributes {
      /**
       * The name of the company
       */
      company_name?: string;
    }
  }
}

export interface PartyUpdateParams {
  data?: PartyUpdateParams.Data;
}

export namespace PartyUpdateParams {
  export interface Data {
    attributes: Data.Attributes;
  }

  export namespace Data {
    export interface Attributes {
      /**
       * The name of the company
       */
      company_name?: string;
    }
  }
}

export interface PartyListParams {
  'page[number]'?: number;

  'page[size]'?: number;
}

export declare namespace Parties {
  export {
    type LinkSelf as LinkSelf,
    type Party as Party,
    type PartyCreateResponse as PartyCreateResponse,
    type PartyRetrieveResponse as PartyRetrieveResponse,
    type PartyUpdateResponse as PartyUpdateResponse,
    type PartyListResponse as PartyListResponse,
    type PartyCreateParams as PartyCreateParams,
    type PartyUpdateParams as PartyUpdateParams,
    type PartyListParams as PartyListParams,
  };
}
