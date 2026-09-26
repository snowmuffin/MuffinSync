import type { TextLayerData } from '../../shared/types';

/** Raised when input cannot be read as a text-layer file. */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

const HEADERS = ['id', 'name', 'characters'] as const;

/**
 * A field needs quoting if it holds a structural character, or if it has
 * leading/trailing whitespace. Without the whitespace rule, "  hello  " is
 * written bare and the parser trims it away — silent loss of real content.
 */
function needsQuoting(value: string): boolean {
  return /[",\n\r]/.test(value) || value !== value.trim();
}

function escapeField(value: string): string {
  const s = value ?? '';
  return needsQuoting(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Any table as CSV, quoting fields the same way the export does. */
export function rowsToCSV(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(escapeField).join(',')).join('\n');
}

/** Characters as a person counts them: code points, so an emoji is one. */
export function textLength(text: string): number {
  return Array.from(text).length;
}

/**
 * The round-trip columns, plus `path` and `length` when `context` is on.
 * Import reads the first three, and `path` only to match layers by position
 * when an id misses; `length` is for the reader.
 */
export function toCSV(rows: TextLayerData[], context = false): string {
  const headers = context ? [...HEADERS, 'path', 'length'] : [...HEADERS];
  const lines = [headers.join(',')];
  for (const row of rows) {
    const fields = HEADERS.map((h) => escapeField(row[h]));
    if (context) fields.push(escapeField(row.path ?? ''), String(textLength(row.characters)));
    lines.push(fields.join(','));
  }
  return lines.join('\n');
}

/** Character-by-character so that quoted fields may contain , " \n and \r. */
export function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;    // did THIS field arrive wrapped in quotes?
  let inQuotes = false;
  let i = 0;

  // A quoted field is preserved byte for byte. An unquoted one is trimmed,
  // so that a hand-edited "1:1, Layer" reads the way a human meant it.
  const endField = () => {
    row.push(quoted ? field : field.trim());
    field = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; quoted = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r' && next === '\n') { endRow(); i += 2; continue; }
    if (c === '\n' || c === '\r') { endRow(); i++; continue; }

    field += c;
    i++;
  }

  if (field !== '' || row.length > 0 || quoted) endRow();
  return rows;
}

export function fromCSV(text: string): TextLayerData[] {
  const rows = parseRows(text);
  if (rows.length === 0) {
    throw new FormatError('The file is empty.');
  }

  const headers = rows[0].map((h) => h.trim());
  const missing = HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new FormatError(
      `Missing required column(s): ${missing.join(', ')}. ` +
        `Expected a header row of: ${HEADERS.join(', ')}.`
    );
  }

  const index = Object.fromEntries(
    HEADERS.map((h) => [h, headers.indexOf(h)])
  ) as Record<(typeof HEADERS)[number], number>;
  const pathIndex = headers.indexOf('path');

  return rows
    .slice(1)
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => {
      const row: TextLayerData = {
        id: r[index.id] ?? '',
        name: r[index.name] ?? '',
        characters: r[index.characters] ?? '',
      };
      const path = pathIndex === -1 ? '' : (r[pathIndex] ?? '');
      if (path !== '') row.path = path;
      return row;
    });
}
