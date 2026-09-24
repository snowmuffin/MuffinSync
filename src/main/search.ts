import type { MatchOptions, SearchMatch, TextLayerData } from '../shared/types';

/**
 * Matching scans with `indexOf` rather than compiling a regular expression
 * from the query. Spec 3.4 excludes regular expressions partly because of
 * catastrophic backtracking; building one internally would put that back on
 * the path of every search for no gain.
 */

/**
 * A word character by Unicode category, so the rule means something in scripts
 * other than Latin. Note the consequence spec 3.4 records: languages that do
 * not delimit words with spaces cannot usefully use `wholeWord`.
 */
const WORD = /[\p{L}\p{N}_]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD.test(char);
}

/** Is the occurrence at `index` flanked by non-word characters, or by nothing? */
function isWholeWord(text: string, index: number, length: number): boolean {
  return !isWordChar(text[index - 1]) && !isWordChar(text[index + length]);
}

/** Does `query` occur in `text` starting exactly at `index`? */
function matchesAt(
  text: string,
  query: string,
  index: number,
  caseSensitive: boolean
): boolean {
  if (index + query.length > text.length) return false;
  for (let k = 0; k < query.length; k++) {
    const a = text[index + k];
    const b = query[k];
    if (a === b) continue;
    if (caseSensitive) return false;
    if (a.toLowerCase() !== b.toLowerCase()) return false;
  }
  return true;
}

/**
 * Every index where `query` occurs, left to right and non-overlapping.
 *
 * Positions are found in `text` itself rather than in a case-folded copy of
 * it. `toLowerCase()` is not length-preserving for all input -- 'İ' becomes
 * two code units -- so an index taken from a folded string cannot be trusted
 * against the original, and both the boundary check below and `replaceAll`'s
 * slicing depend on it being the same coordinate space.
 */
function occurrences(text: string, query: string, opts: MatchOptions): number[] {
  if (query === '') return [];

  const found: number[] = [];
  let at = 0;
  while (at + query.length <= text.length) {
    if (!matchesAt(text, query, at, opts.caseSensitive)) {
      at++;
      continue;
    }
    if (opts.wholeWord && !isWholeWord(text, at, query.length)) {
      // Rejected candidates advance by one: the next real occurrence may begin
      // inside this one.
      at++;
      continue;
    }
    // An accepted match advances past itself, so 'aa' occurs twice in 'aaaa'
    // rather than three times.
    found.push(at);
    at += query.length;
  }
  return found;
}

export function countMatches(text: string, query: string, opts: MatchOptions): number {
  return occurrences(text, query, opts).length;
}

export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  opts: MatchOptions
): string {
  const at = occurrences(text, query, opts);
  if (at.length === 0) return text;

  // Built left to right from the original text, so the replacement is never
  // rescanned -- replacing 'a' with 'aa' terminates.
  let out = '';
  let cursor = 0;
  for (const index of at) {
    out += text.slice(cursor, index) + replacement;
    cursor = index + query.length;
  }
  return out + text.slice(cursor);
}

export function matchingLayers(
  rows: ReadonlyArray<TextLayerData>,
  query: string,
  opts: MatchOptions
): SearchMatch[] {
  const found: SearchMatch[] = [];
  for (const row of rows) {
    const matchCount = countMatches(row.characters, query, opts);
    if (matchCount === 0) continue;
    found.push({
      nodeId: row.id,
      layerName: row.name,
      characters: row.characters,
      matchCount,
    });
  }
  return found;
}
