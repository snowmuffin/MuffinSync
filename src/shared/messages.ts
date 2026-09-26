import type {
  TextLayerData,
  Scope,
  ProposedChange,
  BlockedChange,
  ChangeSet,
  SearchMatch,
  ReplaceTarget,
  TaskKind,
} from './types';
import { isSnippets, isStringRecord, type Snippet, type Translations } from './generate';
import { isTabName, parseSettings, type Settings, type TabName } from './settings';

export type UiToMain =
  // Sent once the iframe's message handler is installed. Anything the sandbox
  // pushes before this would arrive at nothing and be dropped.
  | { type: 'ui-ready' }
  // `includeHidden: false` skips layers that are hidden or inside something hidden.
  | { type: 'extract'; scope: Scope; includeHidden: boolean }
  | { type: 'plan-import'; rows: TextLayerData[] }
  | { type: 'apply'; changes: ProposedChange[] }
  | { type: 'cancel' }
  | {
      type: 'search';
      query: string;
      scope: Scope;
      includeHidden: boolean;
      caseSensitive: boolean;
      wholeWord: boolean;
      regex: boolean;
    }
  | {
      type: 'plan-replace';
      query: string;
      replacement: string;
      // Name included so a node deleted between searching and replacing can
      // still be named in the blocked row.
      targets: ReplaceTarget[];
      scope: Scope;
      caseSensitive: boolean;
      wholeWord: boolean;
      regex: boolean;
    }
  | { type: 'navigate'; nodeId: string }
  // Ask the running extract, search or plan to stop. Distinct from 'cancel',
  // which closes the plugin. Apply cannot be stopped (spec 2026-09-26 §6).
  | { type: 'stop-task' }
  // Export the selected frames, or every top-level frame on the page, as PDF.
  | { type: 'export-pdf' }
  // Snippet library (local features spec §5).
  | { type: 'get-snippets' }
  | { type: 'save-snippets'; snippets: Snippet[] }
  | { type: 'plan-snippet'; text: string }
  | { type: 'add-snippet-layer'; name: string; text: string }
  // Generate tab (local features spec §6). `rows` are the data file's rows.
  | { type: 'merge'; rows: Array<Record<string, string>> }
  | { type: 'localize'; locales: string[]; translations: Translations }
  // Remembered settings (copy tools spec §2).
  | { type: 'save-settings'; settings: Settings };

export type MainToUi =
  | { type: 'extracted'; rows: TextLayerData[] }
  | { type: 'no-text-found' }
  | { type: 'change-set'; changeSet: ChangeSet }
  | { type: 'import-complete'; updated: number; failed: number; errors: string[] }
  | { type: 'error'; message: string }
  | { type: 'selection'; present: boolean }
  | { type: 'search-results'; matches: SearchMatch[]; scope: Scope }
  // Sent at the end of each time slice of a long task, not per layer.
  | { type: 'progress'; task: TaskKind; done: number; total: number }
  // The task ended at the user's request and produced nothing.
  | { type: 'task-stopped'; task: TaskKind }
  | { type: 'pdf-exported'; files: ExportedFile[] }
  | { type: 'snippets'; snippets: Snippet[] }
  | { type: 'settings'; settings: Settings }
  // A menu command asked for this tab; overrides the remembered one.
  | { type: 'open-tab'; tab: TabName }
  // A short confirmation that is not the answer to a long task.
  | { type: 'notice'; message: string }
  | {
      type: 'generated';
      kind: 'merge' | 'localize';
      count: number;
      /** Tags that named no column (merge). */
      missingTags: string[];
      /** Layers left in the source language for want of a translation (localize). */
      untranslated: number;
    };

/** One exported file, named after its layer. */
export interface ExportedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Figma delivers plugin messages under more than one envelope depending on
 * direction and API version. Peel them here, once, so no caller has to guess.
 */
function peel(event: unknown): Record<string, unknown> | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;

  if (typeof e.pluginMessage === 'object' && e.pluginMessage !== null) {
    return e.pluginMessage as Record<string, unknown>;
  }
  if (typeof e.data === 'object' && e.data !== null) {
    const data = e.data as Record<string, unknown>;
    if (typeof data.pluginMessage === 'object' && data.pluginMessage !== null) {
      return data.pluginMessage as Record<string, unknown>;
    }
  }
  return e;
}

function isTextLayerRows(value: unknown): value is TextLayerData[] {
  return (
    Array.isArray(value) &&
    value.every((r) => {
      if (typeof r !== 'object' || r === null) return false;
      const v = r as Record<string, unknown>;
      return (
        typeof v.id === 'string' &&
        typeof v.name === 'string' &&
        typeof v.characters === 'string' &&
        (v.frame === undefined || typeof v.frame === 'string')
      );
    })
  );
}

/**
 * The accepted values of the two enum-shaped fields, keyed by the union rather
 * than listed in a `string[]`. A `Record` makes the compiler demand one entry
 * per member, so adding a `source` or a blocked `reason` in `types.ts` cannot
 * silently start being rejected here — it fails to compile until it is listed.
 */
const SOURCES: Record<ProposedChange['source'], true> = {
  import: true,
  'find-replace': true,
  snippet: true,
};

const BLOCK_REASONS: Record<BlockedChange['reason'], true> = {
  missing: true,
  'not-text': true,
  changed: true,
};

/**
 * Membership without trusting the value's type: `key in table` would also
 * match inherited names like `toString`, and the values arriving here are
 * `unknown`.
 */
function isMember(table: Record<string, true>, key: unknown): boolean {
  return (
    typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key)
  );
}

function isProposedChanges(value: unknown): value is ProposedChange[] {
  return (
    Array.isArray(value) &&
    value.every((c) => {
      if (typeof c !== 'object' || c === null) return false;
      const v = c as Record<string, unknown>;
      return (
        typeof v.nodeId === 'string' &&
        typeof v.layerName === 'string' &&
        typeof v.before === 'string' &&
        typeof v.after === 'string' &&
        isMember(SOURCES, v.source) &&
        typeof v.accepted === 'boolean'
      );
    })
  );
}

function isBlockedChanges(value: unknown): value is BlockedChange[] {
  return (
    Array.isArray(value) &&
    value.every((b) => {
      if (typeof b !== 'object' || b === null) return false;
      const v = b as Record<string, unknown>;
      return (
        typeof v.nodeId === 'string' &&
        typeof v.layerName === 'string' &&
        isMember(BLOCK_REASONS, v.reason)
      );
    })
  );
}

const TASK_KINDS: Record<TaskKind, true> = {
  extract: true,
  search: true,
  plan: true,
  apply: true,
  export: true,
  generate: true,
};

/** A count a progress report can carry: a whole number, never negative. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isScope(value: unknown): value is Scope {
  return value === 'selection' || value === 'page' || value === 'document';
}

function isReplaceTargets(value: unknown): value is ReplaceTarget[] {
  return (
    Array.isArray(value) &&
    value.every((t) => {
      if (typeof t !== 'object' || t === null) return false;
      const v = t as Record<string, unknown>;
      if (typeof v.nodeId !== 'string' || typeof v.layerName !== 'string') return false;
      if (v.occurrences === undefined) return v.expected === undefined || typeof v.expected === 'string';
      // Chosen occurrences only mean something against the text they were
      // chosen in, so `expected` must come with them.
      return (
        Array.isArray(v.occurrences) &&
        v.occurrences.every((i) => Number.isInteger(i) && (i as number) >= 0) &&
        typeof v.expected === 'string'
      );
    })
  );
}

function isSearchMatches(value: unknown): value is SearchMatch[] {
  return (
    Array.isArray(value) &&
    value.every((m) => {
      if (typeof m !== 'object' || m === null) return false;
      const v = m as Record<string, unknown>;
      return (
        typeof v.nodeId === 'string' &&
        typeof v.layerName === 'string' &&
        typeof v.characters === 'string' &&
        typeof v.matchCount === 'number'
      );
    })
  );
}

function isChangeSet(value: unknown): value is ChangeSet {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isProposedChanges(v.changes) &&
    isBlockedChanges(v.blocked) &&
    typeof v.unchangedCount === 'number' &&
    typeof v.createdAt === 'number' &&
    (v.scope === undefined || isScope(v.scope))
  );
}

export function unwrapUiMessage(event: unknown): UiToMain | null {
  const p = peel(event);
  if (!p || typeof p.type !== 'string') return null;

  switch (p.type) {
    case 'ui-ready':
      // No payload: the discriminant is the whole message.
      return { type: 'ui-ready' };
    case 'extract':
      return isScope(p.scope) && typeof p.includeHidden === 'boolean'
        ? { type: 'extract', scope: p.scope, includeHidden: p.includeHidden }
        : null;
    case 'plan-import':
      return isTextLayerRows(p.rows) ? { type: 'plan-import', rows: p.rows } : null;
    case 'apply':
      return isProposedChanges(p.changes) ? { type: 'apply', changes: p.changes } : null;
    case 'cancel':
      return { type: 'cancel' };
    case 'search':
      return typeof p.query === 'string' &&
        isScope(p.scope) &&
        typeof p.includeHidden === 'boolean' &&
        typeof p.caseSensitive === 'boolean' &&
        typeof p.wholeWord === 'boolean' &&
        typeof p.regex === 'boolean'
        ? {
            type: 'search',
            query: p.query,
            scope: p.scope,
            includeHidden: p.includeHidden,
            caseSensitive: p.caseSensitive,
            wholeWord: p.wholeWord,
            regex: p.regex,
          }
        : null;
    case 'plan-replace':
      return typeof p.query === 'string' &&
        typeof p.replacement === 'string' &&
        isReplaceTargets(p.targets) &&
        isScope(p.scope) &&
        typeof p.caseSensitive === 'boolean' &&
        typeof p.wholeWord === 'boolean' &&
        typeof p.regex === 'boolean'
        ? {
            type: 'plan-replace',
            query: p.query,
            replacement: p.replacement,
            targets: p.targets,
            scope: p.scope,
            caseSensitive: p.caseSensitive,
            wholeWord: p.wholeWord,
            regex: p.regex,
          }
        : null;
    case 'navigate':
      return typeof p.nodeId === 'string' ? { type: 'navigate', nodeId: p.nodeId } : null;
    case 'stop-task':
      return { type: 'stop-task' };
    case 'export-pdf':
      return { type: 'export-pdf' };
    case 'get-snippets':
      return { type: 'get-snippets' };
    case 'save-snippets':
      return isSnippets(p.snippets) ? { type: 'save-snippets', snippets: p.snippets } : null;
    case 'plan-snippet':
      return typeof p.text === 'string' ? { type: 'plan-snippet', text: p.text } : null;
    case 'add-snippet-layer':
      return typeof p.name === 'string' && typeof p.text === 'string'
        ? { type: 'add-snippet-layer', name: p.name, text: p.text }
        : null;
    case 'save-settings':
      // Parsed rather than strictly validated: settings are a convenience,
      // and a field this version doesn't know should fall back, not fail.
      return typeof p.settings === 'object' && p.settings !== null
        ? { type: 'save-settings', settings: parseSettings(p.settings) }
        : null;
    case 'merge':
      return Array.isArray(p.rows) && p.rows.every(isStringRecord)
        ? { type: 'merge', rows: p.rows as Array<Record<string, string>> }
        : null;
    case 'localize': {
      if (!Array.isArray(p.locales) || !p.locales.every((l) => typeof l === 'string')) return null;
      const locales = p.locales as string[];
      const t = p.translations;
      if (typeof t !== 'object' || t === null || Array.isArray(t)) return null;
      const translations = t as Record<string, unknown>;
      return locales.every((locale) => isStringRecord(translations[locale]))
        ? { type: 'localize', locales, translations: translations as Translations }
        : null;
    }
    default:
      return null;
  }
}

export function unwrapMainMessage(event: unknown): MainToUi | null {
  const p = peel(event);
  if (!p || typeof p.type !== 'string') return null;

  switch (p.type) {
    case 'extracted':
      return isTextLayerRows(p.rows) ? { type: 'extracted', rows: p.rows } : null;
    case 'no-text-found':
      return { type: 'no-text-found' };
    case 'change-set':
      return isChangeSet(p.changeSet) ? { type: 'change-set', changeSet: p.changeSet } : null;
    case 'import-complete':
      return typeof p.updated === 'number' &&
        typeof p.failed === 'number' &&
        Array.isArray(p.errors) &&
        p.errors.every((e) => typeof e === 'string')
        ? {
            type: 'import-complete',
            updated: p.updated,
            failed: p.failed,
            errors: p.errors as string[],
          }
        : null;
    case 'error':
      return typeof p.message === 'string'
        ? { type: 'error', message: p.message }
        : null;
    case 'selection':
      return typeof p.present === 'boolean'
        ? { type: 'selection', present: p.present }
        : null;
    case 'search-results':
      return isSearchMatches(p.matches) && isScope(p.scope)
        ? { type: 'search-results', matches: p.matches, scope: p.scope }
        : null;
    case 'progress':
      return isMember(TASK_KINDS, p.task) &&
        isCount(p.done) &&
        isCount(p.total) &&
        p.done <= p.total
        ? { type: 'progress', task: p.task as TaskKind, done: p.done, total: p.total }
        : null;
    case 'pdf-exported':
      return Array.isArray(p.files) &&
        p.files.every(
          (f) =>
            typeof f === 'object' &&
            f !== null &&
            typeof (f as Record<string, unknown>).name === 'string' &&
            (f as Record<string, unknown>).data instanceof Uint8Array
        )
        ? { type: 'pdf-exported', files: p.files as ExportedFile[] }
        : null;
    case 'snippets':
      return isSnippets(p.snippets) ? { type: 'snippets', snippets: p.snippets } : null;
    case 'settings':
      return typeof p.settings === 'object' && p.settings !== null
        ? { type: 'settings', settings: parseSettings(p.settings) }
        : null;
    case 'open-tab':
      return isTabName(p.tab) ? { type: 'open-tab', tab: p.tab } : null;
    case 'notice':
      return typeof p.message === 'string' ? { type: 'notice', message: p.message } : null;
    case 'generated':
      return (p.kind === 'merge' || p.kind === 'localize') &&
        isCount(p.count) &&
        Array.isArray(p.missingTags) &&
        p.missingTags.every((t) => typeof t === 'string') &&
        isCount(p.untranslated)
        ? {
            type: 'generated',
            kind: p.kind,
            count: p.count,
            missingTags: p.missingTags as string[],
            untranslated: p.untranslated,
          }
        : null;
    case 'task-stopped':
      return isMember(TASK_KINDS, p.task)
        ? { type: 'task-stopped', task: p.task as TaskKind }
        : null;
    default:
      return null;
  }
}
