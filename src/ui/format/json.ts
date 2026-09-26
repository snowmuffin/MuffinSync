import type { TextLayerData } from '../../shared/types';
import { FormatError, textLength } from './csv';

/**
 * Exactly id, name and characters, in that order -- the round-trip format --
 * plus `path` and `length` when `context` is on.
 */
export function toJSON(rows: TextLayerData[], context = false): string {
  return JSON.stringify(
    rows.map(({ id, name, characters, path }) =>
      context
        ? { id, name, characters, path: path ?? '', length: textLength(characters) }
        : { id, name, characters }
    ),
    null,
    2
  );
}

function isTextLayerData(value: unknown): value is TextLayerData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.characters === 'string'
  );
}

export function fromJSON(text: string): TextLayerData[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FormatError('The file is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new FormatError('Expected a JSON array of text layers.');
  }

  const bad = parsed.findIndex((entry) => !isTextLayerData(entry));
  if (bad !== -1) {
    throw new FormatError(
      `Entry ${bad} is missing a string id, name, or characters field.`
    );
  }

  // Keep only the fields import uses, so extra keys in a hand-edited file
  // (a length column, notes) never travel further.
  return (parsed as Array<Record<string, unknown>>).map((entry) => {
    const row: TextLayerData = {
      id: entry.id as string,
      name: entry.name as string,
      characters: entry.characters as string,
    };
    if (typeof entry.path === 'string' && entry.path !== '') row.path = entry.path;
    return row;
  });
}
