/**
 * get_supported_shipping_lines tool
 * Returns list of shipping lines supported by Terminal49
 */

export const getSupportedShippingLinesTool = {
  name: 'get_supported_shipping_lines',
  description:
    'Get list of shipping lines (carriers) supported by Terminal49 for container tracking. ' +
    'Returns SCAC codes, full names, and common abbreviations. ' +
    'Use this when user asks which carriers are supported or to validate a carrier name.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Optional: Filter by carrier name or SCAC code',
      },
    },
  },
};

export async function executeGetSupportedShippingLines(args: any): Promise<any> {
  const search = args.search?.toLowerCase();

  let lines = getAllShippingLines();

  // Filter if search provided
  if (search) {
    lines = lines.filter(
      (line) =>
        line.scac.toLowerCase().includes(search) ||
        line.name.toLowerCase().includes(search) ||
        line.short_name?.toLowerCase().includes(search)
    );
  }

  return {
    total_lines: lines.length,
    shipping_lines: lines,
    _metadata: {
      note: 'Terminal49 supports 100+ shipping lines. This is a curated list of major carriers.',
      presentation_guidance: search
        ? `User searched for "${args.search}". Present matching carriers clearly.`
        : 'Present major carriers grouped by region or alphabetically.',
    },
  };
}

/**
 * Curated list of major shipping lines supported by Terminal49
 * Based on Terminal49's supported carriers
 */
function getAllShippingLines(): Array<{
  scac: string;
  name: string;
  short_name: string;
  region?: string;
}> {
  return [
    // Top 10 Global Carriers
    { scac: 'MAEU', name: 'Maersk Line', short_name: 'Maersk', region: 'Global' },
    { scac: 'MSCU', name: 'Mediterranean Shipping Company', short_name: 'MSC', region: 'Global' },
    {
      scac: 'CMDU',
      name: 'CMA CGM',
      short_name: 'CMA CGM',
      region: 'Global',
    },
    {
      scac: 'COSU',
      name: 'COSCO Shipping Lines',
      short_name: 'COSCO',
      region: 'Asia',
    },
    {
      scac: 'HLCU',
      name: 'Hapag-Lloyd',
      short_name: 'Hapag-Lloyd',
      region: 'Global',
    },
    {
      scac: 'ONEY',
      name: 'Ocean Network Express',
      short_name: 'ONE',
      region: 'Asia',
    },
    {
      scac: 'EGLV',
      name: 'Evergreen Line',
      short_name: 'Evergreen',
      region: 'Asia',
    },
    {
      scac: 'YMLU',
      name: 'Yang Ming Marine Transport',
      short_name: 'Yang Ming',
      region: 'Asia',
    },
    {
      scac: 'HDMU',
      name: 'Hyundai Merchant Marine',
      short_name: 'HMM',
      region: 'Asia',
    },
    {
      scac: 'ZIMU',
      name: 'ZIM Integrated Shipping Services',
      short_name: 'ZIM',
      region: 'Global',
    },

    // Other Major Carriers
    {
      scac: 'OOLU',
      name: 'Orient Overseas Container Line',
      short_name: 'OOCL',
      region: 'Asia',
    },
    {
      scac: 'APLU',
      name: 'APL',
      short_name: 'APL',
      region: 'Asia',
    },
    {
      scac: 'WHLC',
      name: 'Wan Hai Lines',
      short_name: 'Wan Hai',
      region: 'Asia',
    },
    {
      scac: 'ANNU',
      name: 'ANL Container Line',
      short_name: 'ANL',
      region: 'Oceania',
    },
    {
      scac: 'SEJJ',
      name: 'SeaLand',
      short_name: 'SeaLand',
      region: 'Americas',
    },
    {
      scac: 'SEAU',
      name: 'SeaLand Americas',
      short_name: 'SeaLand',
      region: 'Americas',
    },
    {
      scac: 'MATS',
      name: 'Matson Navigation',
      short_name: 'Matson',
      region: 'Americas',
    },
    {
      scac: 'PCIU',
      name: 'PIL Pacific International Lines',
      short_name: 'PIL',
      region: 'Asia',
    },
    {
      scac: 'SMLU',
      name: 'Hapag-Lloyd (formerly CSAV)',
      short_name: 'Hapag-Lloyd',
      region: 'Americas',
    },
    {
      scac: 'HASU',
      name: 'Hamburg Sud',
      short_name: 'Hamburg Sud',
      region: 'Americas',
    },
    {
      scac: 'SUDU',
      name: 'Hamburg Sudamerikanische',
      short_name: 'Hamburg Sud',
      region: 'Americas',
    },
    {
      scac: 'KKLU',
      name: 'Kawasaki Kisen Kaisha (K Line)',
      short_name: 'K Line',
      region: 'Asia',
    },
    {
      scac: 'NYKS',
      name: 'NYK Line (Nippon Yusen Kaisha)',
      short_name: 'NYK',
      region: 'Asia',
    },
    {
      scac: 'MOLU',
      name: 'Mitsui O.S.K. Lines',
      short_name: 'MOL',
      region: 'Asia',
    },
    {
      scac: 'ARKU',
      name: 'Arkas Container Transport',
      short_name: 'Arkas',
      region: 'Middle East',
    },
    {
      scac: 'TRIU',
      name: 'Triton Container International',
      short_name: 'Triton',
      region: 'Global',
    },

    // Regional Carriers
    {
      scac: 'CSLC',
      name: 'China Shipping Container Lines',
      short_name: 'CSCL',
      region: 'Asia',
    },
    {
      scac: 'EISU',
      name: 'Evergreen Marine (UK)',
      short_name: 'Evergreen',
      region: 'Europe',
    },
    {
      scac: 'GSLU',
      name: 'Gold Star Line',
      short_name: 'Gold Star',
      region: 'Americas',
    },
    {
      scac: 'ITAU',
      name: 'Italia Marittima',
      short_name: 'Italia Marittima',
      region: 'Europe',
    },
    {
      scac: 'UASC',
      name: 'United Arab Shipping Company',
      short_name: 'UASC',
      region: 'Middle East',
    },
  ];
}
