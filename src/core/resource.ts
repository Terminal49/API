// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type { Terminal49 } from '../client';

export abstract class APIResource {
  protected _client: Terminal49;

  constructor(client: Terminal49) {
    this._client = client;
  }
}
