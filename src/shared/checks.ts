import { findMatches } from './match';

/**
 * Rule-based copy checks, shared by the sandbox (which runs them over the
 * document and applies fixes at plan time) and the UI (which lists and
 * highlights findings). Pure. See
 * docs/superpowers/specs/2026-09-26-copy-tools-design.md §5.
 */

export const RULE_IDS = [
  'double-space',
  'edge-space',
  'space-before-punct',
  'repeated-word',
  'ellipsis',
  'quotes',
  'placeholder',
  'empty',
  'glossary',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface RuleInfo {
  id: RuleId;
  label: string;
  /** Whether findings carry a fix; report-only rules can only be shown. */
  fixable: boolean;
  defaultOn: boolean;
}

export const RULES: ReadonlyArray<RuleInfo> = [
  { id: 'double-space', label: 'Double spaces', fixable: true, defaultOn: true },
  { id: 'edge-space', label: 'Leading or trailing spaces', fixable: true, defaultOn: true },
  { id: 'space-before-punct', label: 'Space before punctuation', fixable: true, defaultOn: true },
  { id: 'repeated-word', label: 'Repeated words', fixable: true, defaultOn: true },
  { id: 'ellipsis', label: 'Three dots instead of …', fixable: true, defaultOn: false },
  { id: 'quotes', label: 'Straight quotes', fixable: true, defaultOn: false },
  { id: 'placeholder', label: 'Placeholder text', fixable: false, defaultOn: true },
  { id: 'empty', label: 'Empty layers', fixable: false, defaultOn: true },
  { id: 'glossary', label: 'Glossary terms', fixable: true, defaultOn: true },
];

export function isRuleId(value: unknown): value is RuleId {
  return typeof value === 'string' && (RULE_IDS as readonly string[]).includes(value);
}

export function ruleInfo(id: RuleId): RuleInfo {
  return RULES.find((rule) => rule.id === id) as RuleInfo;
}

/** The rules on, given remembered toggles; a rule not mentioned uses its default. */
export function enabledRules(toggles: Readonly<Record<string, boolean>>): RuleId[] {
  return RULES.filter((rule) => toggles[rule.id] ?? rule.defaultOn).map((rule) => rule.id);
}

/** One glossary entry: text to avoid and what to use instead. */
export interface GlossaryEntry {
  avoid: string;
  use: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export function isGlossary(value: unknown): value is GlossaryEntry[] {
  return (
    Array.isArray(value) &&
    value.every((e) => {
      if (typeof e !== 'object' || e === null) return false;
      const v = e as Record<string, unknown>;
      return (
        typeof v.avoid === 'string' &&
        v.avoid !== '' &&
        typeof v.use === 'string' &&
        typeof v.caseSensitive === 'boolean' &&
        typeof v.wholeWord === 'boolean'
      );
    })
  );
}

/** A problem found in a text: `[start, end)` and, when fixable, what to put there. */
export interface Finding {
  rule: RuleId;
  start: number;
  end: number;
  replacement?: string;
}

export function isFindings(value: unknown): value is Finding[] {
  return (
    Array.isArray(value) &&
    value.every((f) => {
      if (typeof f !== 'object' || f === null) return false;
      const v = f as Record<string, unknown>;
      return (
        isRuleId(v.rule) &&
        Number.isInteger(v.start) &&
        Number.isInteger(v.end) &&
        (v.start as number) >= 0 &&
        (v.end as number) >= (v.start as number) &&
        (v.replacement === undefined || typeof v.replacement === 'string')
      );
    })
  );
}

function each(text: string, pattern: RegExp, make: (m: RegExpExecArray) => Finding | null): Finding[] {
  const out: Finding[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    const finding = make(match);
    if (finding) out.push(finding);
  }
  return out;
}

const WORD = '[\\p{L}\\p{N}_]';

/** Words and phrases that mark text as not final yet. */
const PLACEHOLDER_WORDS = new RegExp(`(?<!${WORD})(lorem ipsum|todo|tbd|fixme|xxx)(?!${WORD})`, 'giu');
/** Whole-layer texts that are designers' defaults, not copy. */
const PLACEHOLDER_WHOLE = new Set(['placeholder', 'text', 'text here', 'type something', 'label', 'title', 'heading']);

/** Opening position for a straight quote: start of text, or after space or an opening bracket. */
function opensAt(text: string, index: number): boolean {
  return index === 0 || /[\s([{—–-]/u.test(text[index - 1]);
}

/** Matches the capitalisation of the first letter of `found` onto `use`. */
function matchCase(found: string, use: string): string {
  const first = found[0];
  if (first && first !== first.toLowerCase() && first === first.toUpperCase()) {
    return use.charAt(0).toUpperCase() + use.slice(1);
  }
  return use;
}

const RUNNERS: Record<RuleId, (text: string, glossary: ReadonlyArray<GlossaryEntry>) => Finding[]> = {
  // Only ordinary spaces between visible characters: indentation, a
  // non-breaking space and runs at the edges are someone else's business.
  'double-space': (text) =>
    each(text, /(?<=\S) {2,}(?=\S)/g, (m) => ({ rule: 'double-space', start: m.index, end: m.index + m[0].length, replacement: ' ' })),

  'edge-space': (text) => {
    if (text.trim() === '') return [];
    const out: Finding[] = [];
    const lead = /^\s+/.exec(text);
    if (lead) out.push({ rule: 'edge-space', start: 0, end: lead[0].length, replacement: '' });
    const trail = /\s+$/.exec(text);
    if (trail) out.push({ rule: 'edge-space', start: trail.index, end: text.length, replacement: '' });
    return out;
  },

  // An ordinary space only: French typography puts a (narrow) non-breaking
  // space before ; : ! ?, and those are left alone.
  'space-before-punct': (text) =>
    each(text, /(?<=\S) +(?=[,.;:!?]+(?:\s|$))/g, (m) => ({
      rule: 'space-before-punct',
      start: m.index,
      end: m.index + m[0].length,
      replacement: '',
    })),

  'repeated-word': (text) =>
    each(text, new RegExp(`(?<!${WORD})(\\p{L}+)(\\s+)\\1(?!${WORD})`, 'giu'), (m) => ({
      rule: 'repeated-word',
      start: m.index,
      end: m.index + m[0].length,
      replacement: m[1],
    })),

  ellipsis: (text) =>
    each(text, /(?<!\.)\.{3}(?!\.)/g, (m) => ({ rule: 'ellipsis', start: m.index, end: m.index + 3, replacement: '…' })),

  quotes: (text) =>
    each(text, /["']/g, (m) => {
      const i = m.index;
      const double = m[0] === '"';
      // An apostrophe inside a word (don't, it's) is always a closing quote.
      const inWord = !double && i > 0 && /\p{L}/u.test(text[i - 1]) && /\p{L}/u.test(text[i + 1] ?? '');
      const open = !inWord && opensAt(text, i);
      const replacement = double ? (open ? '“' : '”') : open ? '‘' : '’';
      return { rule: 'quotes', start: i, end: i + 1, replacement };
    }),

  placeholder: (text) => {
    if (PLACEHOLDER_WHOLE.has(text.trim().toLowerCase())) {
      return [{ rule: 'placeholder', start: 0, end: text.length }];
    }
    return each(text, PLACEHOLDER_WORDS, (m) => ({ rule: 'placeholder', start: m.index, end: m.index + m[0].length }));
  },

  empty: (text) => (text.trim() === '' ? [{ rule: 'empty', start: 0, end: text.length }] : []),

  glossary: (text, glossary) =>
    glossary.flatMap((entry) =>
      findMatches(text, entry.avoid, { caseSensitive: entry.caseSensitive, wholeWord: entry.wholeWord, regex: false })
        // An entry whose preferred term contains the avoided one (avoid "Log",
        // use "Log in") would otherwise flag the correct text itself.
        .filter((range) => text.slice(range.start, range.start + entry.use.length) !== entry.use)
        .map((range) => ({
          rule: 'glossary' as const,
          start: range.start,
          end: range.end,
          replacement: entry.caseSensitive ? entry.use : matchCase(text.slice(range.start, range.end), entry.use),
        }))
    ),
};

/** Every finding of the enabled rules, ordered by position, then rule order. */
export function findIssues(
  text: string,
  rules: ReadonlyArray<RuleId>,
  glossary: ReadonlyArray<GlossaryEntry> = []
): Finding[] {
  const order = new Map(RULE_IDS.map((id, i) => [id, i]));
  return rules
    .flatMap((rule) => RUNNERS[rule](text, glossary))
    .sort((a, b) => a.start - b.start || (order.get(a.rule) ?? 0) - (order.get(b.rule) ?? 0));
}

/**
 * Applies fixable findings left to right. A finding overlapping one already
 * applied is skipped -- its text has changed -- and would be found again by
 * the next check if still wrong.
 */
export function applyFixes(text: string, findings: ReadonlyArray<Finding>): string {
  const fixable = findings
    .filter((f) => f.replacement !== undefined)
    .slice()
    .sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const finding of fixable) {
    if (finding.start < cursor) continue;
    out += text.slice(cursor, finding.start) + finding.replacement;
    cursor = finding.end;
  }
  return out + text.slice(cursor);
}

/** The text with every fix of the given rules applied: what plan writes. */
export function fixText(text: string, rules: ReadonlyArray<RuleId>, glossary: ReadonlyArray<GlossaryEntry> = []): string {
  return applyFixes(text, findIssues(text, rules, glossary));
}

/** A glossary as CSV (`avoid,use,caseSensitive,wholeWord`) for sharing. */
export function glossaryToRows(entries: ReadonlyArray<GlossaryEntry>): string[][] {
  return [
    ['avoid', 'use', 'caseSensitive', 'wholeWord'],
    ...entries.map((e) => [e.avoid, e.use, String(e.caseSensitive), String(e.wholeWord)]),
  ];
}

/**
 * A glossary from table rows with `avoid` and `use` columns; the two option
 * columns are optional and default to case-insensitive, whole word. Rows with
 * an empty `avoid` are skipped.
 */
export function glossaryFromRows(rows: ReadonlyArray<Readonly<Record<string, string>>>): GlossaryEntry[] {
  const flag = (value: string | undefined, fallback: boolean) =>
    value === undefined || value === '' ? fallback : /^(true|yes|1)$/i.test(value.trim());
  return rows
    .filter((row) => (row.avoid ?? '') !== '')
    .map((row) => ({
      avoid: row.avoid,
      use: row.use ?? '',
      caseSensitive: flag(row.caseSensitive, false),
      wholeWord: flag(row.wholeWord, true),
    }));
}
