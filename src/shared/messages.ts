import type { TextLayerData, Scope } from './types';

export type UiToMain =
  | { type: 'extract'; scope: Scope }
  | { type: 'import'; rows: TextLayerData[] }
  | { type: 'cancel' };

export type MainToUi =
  | { type: 'extracted'; rows: TextLayerData[] }
  | { type: 'no-text-found' }
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

export function unwrapUiMessage(event: unknown): UiToMain | null {
  const p = peel(event);
  if (!p || typeof p.type !== 'string') return null;

  switch (p.type) {
    case 'extract':
      return p.scope === 'selection' || p.scope === 'page'
        ? { type: 'extract', scope: p.scope }
        : null;
    case 'import':
      return isTextLayerRows(p.rows) ? { type: 'import', rows: p.rows } : null;
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
