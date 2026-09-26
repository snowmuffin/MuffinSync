import type {
  TextLayerData,
  Scope,
  ProposedChange,
  BlockedChange,
  ChangeSet,
  SearchMatch,
  ReplaceTarget,
} from './types';

export type UiToMain =
  // Sent once the iframe's message handler is installed. Anything the sandbox
  // pushes before this would arrive at nothing and be dropped.
  | { type: 'ui-ready' }
  | { type: 'extract'; scope: Scope }
  | { type: 'plan-import'; rows: TextLayerData[] }
  | { type: 'apply'; changes: ProposedChange[] }
  | { type: 'cancel' }
  | { type: 'search'; query: string; scope: Scope; caseSensitive: boolean; wholeWord: boolean }
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
    }
  | { type: 'navigate'; nodeId: string };

export type MainToUi =
  | { type: 'extracted'; rows: TextLayerData[] }
  | { type: 'no-text-found' }
  | { type: 'change-set'; changeSet: ChangeSet }
  | { type: 'import-complete'; updated: number; failed: number; errors: string[] }
  | { type: 'error'; message: string }
  | { type: 'selection'; present: boolean }
  | { type: 'search-results'; matches: SearchMatch[]; scope: Scope };

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
    value.every(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as Record<string, unknown>).id === 'string' &&
        typeof (r as Record<string, unknown>).name === 'string' &&
        typeof (r as Record<string, unknown>).characters === 'string'
    )
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
};

const BLOCK_REASONS: Record<BlockedChange['reason'], true> = {
  missing: true,
  'not-text': true,
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

function isScope(value: unknown): value is Scope {
  return value === 'selection' || value === 'page';
}

function isReplaceTargets(value: unknown): value is ReplaceTarget[] {
  return (
    Array.isArray(value) &&
    value.every((t) => {
      if (typeof t !== 'object' || t === null) return false;
      const v = t as Record<string, unknown>;
      return typeof v.nodeId === 'string' && typeof v.layerName === 'string';
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
      return isScope(p.scope) ? { type: 'extract', scope: p.scope } : null;
    case 'plan-import':
      return isTextLayerRows(p.rows) ? { type: 'plan-import', rows: p.rows } : null;
    case 'apply':
      return isProposedChanges(p.changes) ? { type: 'apply', changes: p.changes } : null;
    case 'cancel':
      return { type: 'cancel' };
    case 'search':
      return typeof p.query === 'string' &&
        isScope(p.scope) &&
        typeof p.caseSensitive === 'boolean' &&
        typeof p.wholeWord === 'boolean'
        ? {
            type: 'search',
            query: p.query,
            scope: p.scope,
            caseSensitive: p.caseSensitive,
            wholeWord: p.wholeWord,
          }
        : null;
    case 'plan-replace':
      return typeof p.query === 'string' &&
        typeof p.replacement === 'string' &&
        isReplaceTargets(p.targets) &&
        isScope(p.scope) &&
        typeof p.caseSensitive === 'boolean' &&
        typeof p.wholeWord === 'boolean'
        ? {
            type: 'plan-replace',
            query: p.query,
            replacement: p.replacement,
            targets: p.targets,
            scope: p.scope,
            caseSensitive: p.caseSensitive,
            wholeWord: p.wholeWord,
          }
        : null;
    case 'navigate':
      return typeof p.nodeId === 'string' ? { type: 'navigate', nodeId: p.nodeId } : null;
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
    default:
      return null;
  }
}
