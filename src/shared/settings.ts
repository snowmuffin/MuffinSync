import type { MatchOptions, Scope } from './types';

/**
 * What the panel remembers between sessions, per user on this device
 * (figma.clientStorage). Deliberately not the Find/Replace text, chosen files
 * or results: those belong to one task, and restoring a stale query confuses
 * more than it helps. See docs/superpowers/specs/2026-09-26-copy-tools-design.md §2.
 */
export const TAB_NAMES = ['extract', 'find-replace', 'check', 'generate', 'snippets'] as const;
export type TabName = (typeof TAB_NAMES)[number];

export interface Settings {
  tab: TabName;
  scope: Scope;
  includeHidden: boolean;
  match: MatchOptions;
  /** Add `path` and `length` columns to CSV and JSON exports. */
  contextColumns: boolean;
  /** Check rule id -> enabled. Rules not listed use their own default. */
  checks: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  tab: 'extract',
  scope: 'selection',
  includeHidden: true,
  match: { caseSensitive: false, wholeWord: false, regex: false },
  contextColumns: false,
  checks: {},
};

export function isTabName(value: unknown): value is TabName {
  return typeof value === 'string' && (TAB_NAMES as readonly string[]).includes(value);
}

function isScope(value: unknown): value is Scope {
  return value === 'selection' || value === 'page' || value === 'document';
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads stored settings field by field, each falling back to its default. A
 * shape written by an older or newer version, or nothing at all, yields
 * usable settings rather than an error.
 */
export function parseSettings(value: unknown): Settings {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const match = typeof v.match === 'object' && v.match !== null ? (v.match as Record<string, unknown>) : {};
  const checks: Record<string, boolean> = {};
  if (typeof v.checks === 'object' && v.checks !== null && !Array.isArray(v.checks)) {
    for (const [rule, on] of Object.entries(v.checks as Record<string, unknown>)) {
      if (typeof on === 'boolean') checks[rule] = on;
    }
  }
  const d = DEFAULT_SETTINGS;
  return {
    tab: isTabName(v.tab) ? v.tab : d.tab,
    scope: isScope(v.scope) ? v.scope : d.scope,
    includeHidden: bool(v.includeHidden, d.includeHidden),
    match: {
      caseSensitive: bool(match.caseSensitive, d.match.caseSensitive),
      wholeWord: bool(match.wholeWord, d.match.wholeWord),
      regex: bool(match.regex, d.match.regex),
    },
    contextColumns: bool(v.contextColumns, d.contextColumns),
    checks,
  };
}

/** Menu commands that open the panel on a particular tab. */
export const COMMAND_TABS: Readonly<Record<string, TabName>> = {
  extract: 'extract',
  find: 'find-replace',
  check: 'check',
  generate: 'generate',
  snippets: 'snippets',
};
