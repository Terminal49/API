import type { paths } from '../../generated/terminal49.js';
import type { CallOptions, ListOptions } from '../../types/options.js';
import { ValidationError } from '../errors.js';
import { applyTypedPagination } from '../query.js';
import { BaseManager } from './base.js';

type DocumentListQuery = NonNullable<
  paths['/documents']['get']['parameters']['query']
>;
type EmailSubmissionListQuery = NonNullable<
  paths['/email_submissions']['get']['parameters']['query']
>;
type DocumentUpdateAttributes = NonNullable<
  paths['/documents/{id}']['patch']['requestBody']['content']['application/json']['data']
>['attributes'];

/** Filters accepted by {@link DocumentManager.list}. */
export interface DocumentListFilters {
  /** Full-text match on the document filename. */
  filename?: string;
  /** Filter by reference token. */
  reference?: string;
  /** One or more document types (sent comma-separated). */
  documentTypes?: readonly string[];
  /** Sort by `document_type`, `added_by`, or `created_at`; prefix with `-` for descending. */
  sort?: string;
  /** Comma-separated JSON:API includes. */
  include?: string;
}

/** Attributes accepted by {@link DocumentManager.create}. */
export interface CreateDocumentParams {
  /** Display name for the document. */
  name: string;
  /** ActiveStorage signed blob id returned by a direct upload. */
  attachedDocument: string;
}

/** Attributes accepted by {@link DocumentManager.update}. */
export interface UpdateDocumentParams {
  /** Manually override the classified document type. */
  documentTypeManual?: string;
  /** Manually provide extracted key/value data. Pass `null` to clear manual values. */
  extractedDataManual?: DocumentUpdateAttributes['extracted_data_manual'];
}

export type DocumentRotation = 90 | 180 | 270;

export class DocumentManager extends BaseManager {
  /** List documents with optional filters and pagination. */
  async list(
    filters: DocumentListFilters = {},
    options?: ListOptions,
  ): Promise<any> {
    const query: DocumentListQuery = {
      include: filters.include,
      sort: filters.sort,
      'filter[filename]': filters.filename,
      'filter[reference]': filters.reference,
      'filter[document_types]': filters.documentTypes?.join(','),
    };
    applyTypedPagination(query, options);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/documents', { params: { query } }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a document by ID. */
  async get(
    id: string,
    options?: CallOptions & { include?: string },
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/documents/{id}', {
        params: {
          path: { id },
          query: options?.include ? { include: options.include } : undefined,
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Create a document from a previously direct-uploaded blob. */
  async create(
    params: CreateDocumentParams,
    options?: CallOptions,
  ): Promise<any> {
    if (!params.name) {
      throw new ValidationError('name is required (/data/attributes/name)');
    }
    if (!params.attachedDocument) {
      throw new ValidationError(
        'attached_document is required (/data/attributes/attached_document)',
      );
    }

    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/documents', {
        body: {
          data: {
            type: 'document',
            attributes: {
              name: params.name,
              attached_document: params.attachedDocument,
            },
          },
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Override a document's type or extracted data. */
  async update(
    id: string,
    params: UpdateDocumentParams,
    options?: CallOptions,
  ): Promise<any> {
    const attributes: DocumentUpdateAttributes = {};
    if (params.documentTypeManual !== undefined) {
      attributes.document_type_manual = params.documentTypeManual;
    }
    if (params.extractedDataManual !== undefined) {
      attributes.extracted_data_manual = params.extractedDataManual;
    }

    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/documents/{id}', {
        params: { path: { id } },
        body: { data: { type: 'document', attributes } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Delete a document. */
  async delete(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE('/documents/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List the document types Terminal49 can classify. */
  async types(options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/documents/types'),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Get a short-lived download URL for a document's file. */
  async downloadUrl(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/documents/{id}/download_url', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Re-run data extraction on a document. */
  async reextract(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/documents/{id}/reextract', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Re-run classification on a document. */
  async reclassify(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/documents/{id}/reclassify', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Re-run shipment/container linking on a document. */
  async relink(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/documents/{id}/relink', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Rotate a document's pages by 90, 180, or 270 degrees. */
  async rotate(
    id: string,
    degrees: DocumentRotation,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/documents/{id}/rotate', {
        params: { path: { id } },
        body: { degrees },
      }),
    );
    return this.formatResult(raw, options?.format);
  }
}

export class EmailSubmissionManager extends BaseManager {
  /** List email submissions (documents sent to your Terminal49 inbox). */
  async list(options?: ListOptions & { include?: string }): Promise<any> {
    const query: EmailSubmissionListQuery = { include: options?.include };
    applyTypedPagination(query, options);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/email_submissions', { params: { query } }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch an email submission by ID. */
  async get(
    id: string,
    options?: CallOptions & { include?: string },
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/email_submissions/{id}', {
        params: {
          path: { id },
          query: options?.include ? { include: options.include } : undefined,
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }
}

export class DocumentSchemaManager extends BaseManager {
  /** Fetch an extraction schema by its versioned id, `<document_type>@<version>`, such as `commercial_invoice@2026-03-23`. */
  async get(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/document_schemas/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }
}
