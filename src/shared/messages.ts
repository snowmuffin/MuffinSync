import type {
  TextLayerData,
  Scope,
  ProposedChange,
  BlockedChange,
  ChangeSet,
} from './types';

export type UiToMain =
  | { type: 'extract'; scope: Scope }
  | { type: 'plan-import'; rows: TextLayerData[] }
  | { type: 'apply'; changes: ProposedChange[] }
  | { type: 'cancel' };

export type MainToUi =
  | { type: 'extracted'; rows: TextLayerData[] }
  | { type: 'no-text-found' }
  | { type: 'change-set'; changeSet: ChangeSet }
  | { type: 'import-complete'; updated: number; failed: number; errors: string[] }
  | { type: 'error'; message: string };

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

const SOURCES = ['import', 'find-replace', 'spellcheck'];
const BLOCK_REASONS = ['missing', 'not-text'];

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
        typeof v.source === 'string' &&
        SOURCES.includes(v.source) &&
        typeof v.accepted === 'boolean' &&
        (v.reason === undefined || typeof v.reason === 'string')
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
        typeof v.reason === 'string' &&
        BLOCK_REASONS.includes(v.reason)
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
    typeof v.createdAt === 'number'
  );
}

export function unwrapUiMessage(event: unknown): UiToMain | null {
  const p = peel(event);
  if (!p || typeof p.type !== 'string') return null;

  switch (p.type) {
    case 'extract':
      return p.scope === 'selection' || p.scope === 'page'
        ? { type: 'extract', scope: p.scope }
        : null;
    case 'plan-import':
      return isTextLayerRows(p.rows) ? { type: 'plan-import', rows: p.rows } : null;
    case 'apply':
      return isProposedChanges(p.changes) ? { type: 'apply', changes: p.changes } : null;
    case 'cancel':
      return { type: 'cancel' };
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
    default:
      return null;
  }
}
