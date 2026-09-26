/**
 * Pure rules behind the Generate tab and the snippet library, shared by the
 * sandbox (which applies them) and the UI (which previews them). See
 * docs/superpowers/specs/2026-09-26-local-features-design.md §5 and §6.
 */

/** A saved piece of text. Stored per user with figma.clientStorage. */
export interface Snippet {
  id: string;
  name: string;
  text: string;
}

export function isSnippets(value: unknown): value is Snippet[] {
  return (
    Array.isArray(value) &&
    value.every((s) => {
      if (typeof s !== 'object' || s === null) return false;
      const v = s as Record<string, unknown>;
      return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.text === 'string';
    })
  );
}

/** `{{ Column }}`: a tag names a column, spaces around the name ignored. */
const TAG = /\{\{\s*([^{}]*?)\s*\}\}/g;

export interface Filled {
  text: string;
  /** Tags that named no column, left in the text as they were. */
  missing: string[];
}

/**
 * Replaces each `{{Column}}` tag with the row's value for that column. A tag
 * naming no column stays as written, so a typo shows up in the output rather
 * than vanishing, and is reported.
 */
export function fillTags(text: string, row: Readonly<Record<string, string>>): Filled {
  const missing: string[] = [];
  const filled = text.replace(TAG, (tag, name: string) => {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    if (!missing.includes(name)) missing.push(name);
    return tag;
  });
  return { text: filled, missing };
}

/** Whether a text contains any tag at all. */
export function hasTags(text: string): boolean {
  TAG.lastIndex = 0;
  const found = TAG.test(text);
  TAG.lastIndex = 0;
  return found;
}

/** Columns Extract writes; any other column in a translation file is a locale. */
const SOURCE_COLUMNS = new Set(['id', 'name', 'characters', 'frame', 'path', 'length']);

export function localesOf(headers: ReadonlyArray<string>): string[] {
  return headers.filter((header) => header !== '' && !SOURCE_COLUMNS.has(header.toLowerCase()));
}

/** locale -> layer id -> translated text. Empty cells are left out. */
export type Translations = Record<string, Record<string, string>>;

export function buildTranslations(
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
  locales: ReadonlyArray<string>
): Translations {
  const out: Translations = {};
  for (const locale of locales) out[locale] = {};
  for (const row of rows) {
    const id = row.id;
    if (!id) continue;
    for (const locale of locales) {
      const text = row[locale];
      if (text !== undefined && text !== '') out[locale][id] = text;
    }
  }
  return out;
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Space left between generated copies, in canvas pixels. */
export const COPY_GAP = 80;

/**
 * Where the `index`th generated copy of `box` goes: a grid of `perRow` columns
 * starting one step to the right of the original, so nothing overlaps it.
 */
export function gridPosition(index: number, box: Box, perRow = 10, gap = COPY_GAP): { x: number; y: number } {
  return {
    x: box.x + (box.width + gap) * (1 + (index % perRow)),
    y: box.y + (box.height + gap) * Math.floor(index / perRow),
  };
}
