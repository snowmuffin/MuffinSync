import type { MatchOptions, SearchMatch, TextLayerData } from './types';

/**
 * One matcher for the sandbox and the UI: the sandbox searches and replaces
 * with it, the UI highlights matches and lets the user pick occurrences with
 * it, and both must agree on where every match is.
 *
 * Literal queries are scanned directly rather than compiled into a regular
 * expression, so the default path never risks catastrophic backtracking.
 * Regular expressions are an explicit opt-in (`opts.regex`); a pathological
 * pattern there can stall the plugin, which the README says.
 * See docs/superpowers/specs/2026-09-26-local-features-design.md §2.
 */

/** One match: `[start, end)` in the text, plus capture groups in regex mode. */
export interface MatchRange {
  start: number;
  end: number;
  /** Numbered groups, `groups[1]` for `$1`. Empty in literal mode. */
  groups: ReadonlyArray<string | undefined>;
  /** Named groups, for `$<name>`. Empty in literal mode. */
  named: Readonly<Record<string, string | undefined>>;
}

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
 * against the original, and both the boundary check below and replacement's
 * slicing depend on it being the same coordinate space.
 */
function literalOccurrences(text: string, query: string, opts: MatchOptions): number[] {
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

/** The same word-character class as `WORD`, for use inside a pattern. */
const WORD_CLASS = '[\\p{L}\\p{N}_]';

/**
 * Compile a regex-mode query. Always `u`, so `\p{…}` works and indices are
 * the same UTF-16 offsets literal mode uses; `i` unless case-sensitive. Whole
 * word wraps the pattern in the same Unicode word boundary literal mode uses.
 * Throws a SyntaxError for an invalid pattern.
 */
function compile(query: string, opts: MatchOptions): RegExp {
  const source = opts.wholeWord
    ? `(?<!${WORD_CLASS})(?:${query})(?!${WORD_CLASS})`
    : query;
  return new RegExp(source, opts.caseSensitive ? 'gu' : 'giu');
}

/**
 * Why `query` cannot be searched for, or null if it can. Checked by the UI
 * before a search is sent, so a typo in a pattern is reported, not thrown.
 */
export function checkQuery(query: string, opts: MatchOptions): string | null {
  if (query === '') return 'Type something to find.';
  if (!opts.regex) return null;
  try {
    compile(query, opts);
    return null;
  } catch (error) {
    return `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const NO_GROUPS: ReadonlyArray<string | undefined> = [];
const NO_NAMES: Readonly<Record<string, string | undefined>> = {};

function regexMatches(text: string, query: string, opts: MatchOptions): MatchRange[] {
  if (query === '') return [];
  const pattern = compile(query, opts);
  const found: MatchRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      // An empty match replaces nothing and would loop forever; step past it,
      // by a whole code point so the `u` flag's indices stay aligned.
      const code = text.charCodeAt(pattern.lastIndex);
      pattern.lastIndex += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
      continue;
    }
    found.push({
      start: match.index,
      end: match.index + match[0].length,
      groups: Array.from(match),
      named: match.groups ?? NO_NAMES,
    });
  }
  return found;
}

/** Every match of `query` in `text`, left to right and non-overlapping. */
export function findMatches(text: string, query: string, opts: MatchOptions): MatchRange[] {
  if (opts.regex) return regexMatches(text, query, opts);
  return literalOccurrences(text, query, opts).map((start) => ({
    start,
    end: start + query.length,
    groups: NO_GROUPS,
    named: NO_NAMES,
  }));
}

export function countMatches(text: string, query: string, opts: MatchOptions): number {
  return findMatches(text, query, opts).length;
}

/**
 * What one match is replaced with. Literal mode uses the replacement as is.
 * Regex mode expands `$$`, `$&`, `$1`–`$99` and `$<name>` the way
 * `String.prototype.replace` does; anything else after `$` stays literal.
 */
function expand(replacement: string, text: string, match: MatchRange, regex: boolean): string {
  if (!regex || !replacement.includes('$')) return replacement;
  let out = '';
  for (let i = 0; i < replacement.length; i++) {
    const char = replacement[i];
    const next = replacement[i + 1];
    if (char !== '$' || next === undefined) {
      out += char;
      continue;
    }
    if (next === '$') {
      out += '$';
      i++;
    } else if (next === '&') {
      out += text.slice(match.start, match.end);
      i++;
    } else if (next === '<') {
      const close = replacement.indexOf('>', i + 2);
      const name = close === -1 ? '' : replacement.slice(i + 2, close);
      if (close === -1 || !(name in match.named)) {
        out += char;
        continue;
      }
      out += match.named[name] ?? '';
      i = close;
    } else if (next >= '0' && next <= '9') {
      // Two digits when that names a group, as String.prototype.replace does.
      const two = replacement.slice(i + 1, i + 3);
      const useTwo = /^\d\d$/.test(two) && Number(two) < match.groups.length && Number(two) > 0;
      const index = useTwo ? Number(two) : Number(next);
      if (index === 0 || index >= match.groups.length) {
        out += char;
        continue;
      }
      out += match.groups[index] ?? '';
      i += useTwo ? 2 : 1;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Replace the matches of `query` in `text`. With `chosen`, only the matches at
 * those indices (0-based, left to right) are replaced -- per-occurrence
 * replacement; without it, every match is.
 *
 * Built left to right from the original text, so a replacement is never
 * rescanned -- replacing 'a' with 'aa' terminates.
 */
export function replaceMatches(
  text: string,
  query: string,
  replacement: string,
  opts: MatchOptions,
  chosen?: ReadonlySet<number>
): string {
  const matches = findMatches(text, query, opts);
  if (matches.length === 0) return text;

  let out = '';
  let cursor = 0;
  matches.forEach((match, index) => {
    if (chosen && !chosen.has(index)) return;
    out += text.slice(cursor, match.start) + expand(replacement, text, match, opts.regex);
    cursor = match.end;
  });
  return out + text.slice(cursor);
}

export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  opts: MatchOptions
): string {
  return replaceMatches(text, query, replacement, opts);
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
