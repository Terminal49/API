/**
 * Lets a tool return resource_link content blocks that are not part of its
 * structured result. A link attached here reaches the client as a content
 * block only, so it never appears in structuredContent or the text block.
 */

export type ContentAnnotations = {
  audience?: Array<'user' | 'assistant'>;
  priority?: number;
};

export type ResourceLinkContent = {
  type: 'resource_link';
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
};

const RESOURCE_LINKS = Symbol('resourceLinks');

type WithResourceLinks = { [RESOURCE_LINKS]?: readonly ResourceLinkContent[] };

/**
 * Attaches `links` to `result` under a non-enumerable symbol, which JSON,
 * object spread and Object.entries all skip.
 */
export function withResourceLinks<T extends object>(
  result: T,
  links: readonly ResourceLinkContent[],
): T {
  Object.defineProperty(result, RESOURCE_LINKS, {
    value: links,
    enumerable: false,
  });
  return result;
}

/** The links attached to `result` with {@link withResourceLinks}, if any. */
export function resourceLinksOf(result: unknown): ResourceLinkContent[] {
  if (typeof result !== 'object' || result === null) return [];
  // SAFETY: only withResourceLinks writes this module-private symbol.
  return [...((result as WithResourceLinks)[RESOURCE_LINKS] ?? [])];
}
