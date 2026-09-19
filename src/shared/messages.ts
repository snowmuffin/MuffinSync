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

const UI_TO_MAIN_TYPES = ['extract', 'import', 'cancel'];
const MAIN_TO_UI_TYPES = [
  'extracted',
  'no-text-found',
  'import-complete',
  'error',
];

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

function unwrap<T>(event: unknown, allowed: string[]): T | null {
  const payload = peel(event);
  if (!payload || typeof payload.type !== 'string') return null;
  return allowed.includes(payload.type) ? (payload as T) : null;
}

export function unwrapUiMessage(event: unknown): UiToMain | null {
  return unwrap<UiToMain>(event, UI_TO_MAIN_TYPES);
}

export function unwrapMainMessage(event: unknown): MainToUi | null {
  return unwrap<MainToUi>(event, MAIN_TO_UI_TYPES);
}
