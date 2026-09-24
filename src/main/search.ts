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

/** Is the occurrence at `at` flanked by non-word characters (or nothing)? */
function isWholeWordAt(text: string, at: string, index: number): boolean {
  return (
    !isWordChar(text[index - 1]) && !isWordChar(text[index + at.length])
  );
}

/**
 * Every index where `query` occurs, left to right and non-overlapping. The
 * boundary check runs against the original text so that case folding cannot
 * shift positions.
 */
function occurrences(text: string, query: string, opts: MatchOptions): number[] {
  if (query === '') return [];

  const haystack = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const found: number[] = [];

  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (!opts.wholeWord || isWholeWordAt(text, needle, at)) {
      found.push(at);
    }
    // Advance past this occurrence so 'aa' counts twice in 'aaaa', not three
    // times. When the match is rejected by the boundary check, advancing by one
    // is right -- the next occurrence may start inside this one.
    from = opts.wholeWord && !isWholeWordAt(text, needle, at) ? at + 1 : at + needle.length;
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
