import type { TextLayerData } from '../../shared/types';
import { FormatError } from './csv';

/** Exactly id, name and characters, in that order -- the round-trip format. */
export function toJSON(rows: TextLayerData[]): string {
  return JSON.stringify(
    rows.map(({ id, name, characters }) => ({ id, name, characters })),
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

  return parsed as TextLayerData[];
}
