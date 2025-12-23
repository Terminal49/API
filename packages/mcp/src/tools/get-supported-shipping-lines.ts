/**
 * get_supported_shipping_lines tool
 * Returns list of shipping lines supported by Terminal49
 */

import { Terminal49Client } from '@terminal49/sdk';

export const getSupportedShippingLinesTool = {
  name: 'get_supported_shipping_lines',
  description:
    'Get list of shipping lines (carriers) supported by Terminal49 for container tracking. ' +
    'Returns SCAC codes, names, nicknames, and BOL prefixes pulled from the canonical support CSV. ' +
    'Use this when validating whether a carrier is supported or mapping SCAC codes.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Optional: Filter by carrier name, nickname, or SCAC code',
      },
    },
  },
};

interface SupportedLinesResponse {
  total_lines: number;
  shipping_lines: ShippingLineRecord[];
  _metadata: Record<string, string>;
}

export interface ShippingLineRecord {
  scac: string;
  name: string;
  short_name?: string;
  bol_prefix?: string;
  notes?: string;
}

let cachedLines: ShippingLineRecord[] = [];

export async function executeGetSupportedShippingLines(
  args: { search?: string },
  client: Terminal49Client
): Promise<SupportedLinesResponse> {
  const search = args.search?.trim().toLowerCase();
  const lines = await loadShippingLines(client);

  const filtered = search
    ? lines.filter((line) =>
        [line.scac, line.name, line.short_name]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(search))
      )
    : lines;

  return {
    total_lines: filtered.length,
    shipping_lines: filtered,
    _metadata: {
      presentation_guidance: search
        ? `User searched for "${args.search}". Present matching carriers clearly.`
        : 'Present carriers alphabetically. Data sourced from Terminal49 shipping_lines API.',
    },
  };
}

async function loadShippingLines(client: Terminal49Client): Promise<ShippingLineRecord[]> {
  if (cachedLines.length > 0) {
    return cachedLines;
  }

  try {
    const response = await client.shippingLines.list(undefined, { format: 'mapped' });
    const data = Array.isArray(response) ? response : [];

    const mapped = data.map((item: any): Partial<ShippingLineRecord> => ({
      scac: item.scac,
      name: item.name,
      short_name: item.shortName,
      bol_prefix: item.bolPrefix,
      notes: item.notes,
    }));

    cachedLines = mapped
      .filter((item): item is ShippingLineRecord => item != null && Boolean(item.scac) && Boolean(item.name))
      .sort((a: ShippingLineRecord, b: ShippingLineRecord) => a.name.localeCompare(b.name));

    return cachedLines;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to load shipping line data. API request failed.';

    cachedLines = [
      {
        scac: 'UNKNOWN',
        name: 'Shipping line data unavailable',
        notes: message,
      },
    ];
    return cachedLines;
  }
}
