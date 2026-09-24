import type { Scope } from '../../shared/types';

/**
 * The chosen extraction scope. `resolveRoots` in `src/main/traverse.ts` is
 * the one place that decides what an empty selection falls back to -- this
 * module only tracks what the user picked and keeps the control honest about
 * whether "Selection" is even choosable right now.
 */
let chosen: Scope = 'selection';
let host: Document | null = null;

function options(root: Document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.scope-option'));
}

function selectionOption(root: Document): HTMLElement | undefined {
  return options(root).find((option) => option.dataset.scope === 'selection');
}

function applySelection(root: Document, next: Scope): void {
  chosen = next;
  options(root).forEach((option) => {
    option.classList.toggle('selected', option.dataset.scope === next);
  });
}

export function initScope(root: Document): void {
  host = root;
  // Selection is the default choice every time the control is (re)initialised
  // -- reasserting it here, rather than trusting leftover markup or state
  // from a previous init, keeps the module and the DOM from drifting apart.
  applySelection(root, 'selection');
  options(root).forEach((option) => {
    option.classList.remove('disabled');
    option.addEventListener('click', () => {
      if (option.classList.contains('disabled')) return;
      const next = option.dataset.scope;
      if (next === 'selection' || next === 'page') {
        applySelection(root, next);
      }
    });
  });
}

export function getScope(): Scope {
  return chosen;
}

/**
 * The sandbox tells the UI whether anything is selected -- the UI cannot ask
 * Figma itself. When nothing is selected, "Selection" is not a real choice:
 * disable it, and if it was the chosen scope, fall the visible choice back to
 * "Current page" so the control never shows something the user can't have.
 */
export function setSelectionPresent(present: boolean): void {
  if (!host) return;
  const option = selectionOption(host);
  if (!option) return;

  option.classList.toggle('disabled', !present);
  if (!present && chosen === 'selection') {
    applySelection(host, 'page');
  }
}
