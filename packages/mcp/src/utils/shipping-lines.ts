import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ShippingLineRecord {
  scac: string;
  name: string;
  short_name?: string;
  bol_prefix?: string;
  notes?: string;
}

let cachedLines: ShippingLineRecord[] | null = null;

/**
 * Load supported shipping lines from the canonical CSV file.
 * Results are cached in-memory because the source data is static at runtime.
 */
export function getShippingLines(): ShippingLineRecord[] {
  if (cachedLines) {
    return cachedLines;
  }

  const csvPath = resolveCsvPath();
  const csv = fs.readFileSync(csvPath, 'utf8');
  cachedLines = parseCsv(csv);
  return cachedLines;
}

function resolveCsvPath(): string {
  const override = process.env.T49_SHIPPING_LINES_CSV;
  if (override && fs.existsSync(override)) {
    return override;
  }

  const filename = 'Terminal49 Shiping Line Support.csv';
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, '../../../', filename), // works for both src and dist builds
    path.resolve(moduleDir, '../../../../', filename),
    path.resolve(process.cwd(), filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate "${filename}". Set T49_SHIPPING_LINES_CSV to override.`);
}

function parseCsv(csv: string): ShippingLineRecord[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines.shift()!);
  const headerIndex = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const fullNameIdx = headerIndex('Full Name');
  const nicknameIdx = headerIndex('Nickname');
  const scacIdx = headerIndex('SCAC');
  const bolPrefixIdx = headerIndex('BOL Prefix');
  const supportIdx = headerIndex('Support');
  const notesIdx = headerIndex('Notes');

  const records: ShippingLineRecord[] = [];

  for (const line of lines) {
    const columns = parseCsvLine(line);
    const supportValue = columns[supportIdx]?.trim().toLowerCase();
    const scac = columns[scacIdx]?.trim();

    if (supportValue !== 'yes' || !scac) {
      continue;
    }

    const name = columns[fullNameIdx]?.trim() || columns[nicknameIdx]?.trim() || scac;

    records.push({
      scac,
      name,
      short_name: columns[nicknameIdx]?.trim() || undefined,
      bol_prefix: columns[bolPrefixIdx]?.trim() || undefined,
      notes: columns[notesIdx]?.trim() || undefined,
    });
  }

  return records.sort((a, b) => a.name.localeCompare(b.name));
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}
