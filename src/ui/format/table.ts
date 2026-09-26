import { FormatError, parseRows } from './csv';

/**
 * A file read as a table of named columns: the data merge and localization
 * inputs, whose columns are the user's own rather than id/name/characters.
 */
export interface Table {
  headers: string[];
  rows: Array<Record<string, string>>;
}

function fromCsv(text: string): Table {
  const rows = parseRows(text.replace(/^﻿/, ''));
  if (rows.length === 0) throw new FormatError('The file is empty.');
  const headers = rows[0].map((h) => h.trim());
  if (headers.every((h) => h === '')) throw new FormatError('The first row has no column names.');
  return {
    headers,
    rows: rows
      .slice(1)
      .filter((r) => r.some((v) => v !== ''))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))),
  };
}

function fromJson(text: string): Table {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FormatError('The file is not valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.some((e) => typeof e !== 'object' || e === null || Array.isArray(e))) {
    throw new FormatError('Expected a JSON array of objects.');
  }
  const headers: string[] = [];
  const rows = (parsed as Array<Record<string, unknown>>).map((entry) => {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!headers.includes(key)) headers.push(key);
      // Numbers and booleans are fine as text; nested values are not a cell.
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        row[key] = String(value);
      } else if (value === null) {
        row[key] = '';
      } else {
        throw new FormatError(`Column "${key}" holds a nested value; each cell must be text.`);
      }
    }
    return row;
  });
  return { headers, rows };
}

export function parseTable(text: string, filename: string): Table {
  if (filename.toLowerCase().endsWith('.json')) return fromJson(text);
  if (filename.toLowerCase().endsWith('.csv')) return fromCsv(text);
  throw new FormatError('Choose a CSV or JSON file.');
}
