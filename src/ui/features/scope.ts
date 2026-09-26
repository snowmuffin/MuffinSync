import type { Scope } from '../../shared/types';

/**
 * The chosen extraction scope. `resolveRoots` in `src/main/traverse.ts` is
 * the one place that decides what an empty selection falls back to -- this
 * module only tracks what the user picked and keeps the control honest about
 * whether "Selection" is even choosable right now.
 */
let chosen: Scope = 'selection';
let host: Document | null = null;

/** Aborting it removes every listener the previous `initScope` added. */
let listeners: AbortController | null = null;

function options(root: Document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.scope-option'));
}

function selectionOptions(root: Document): HTMLElement[] {
  return options(root).filter((option) => option.dataset.scope === 'selection');
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
  listeners?.abort();
  listeners = new AbortController();
  const { signal } = listeners;
  includeHidden = true;
  hiddenBoxes(root).forEach((box) => {
    box.checked = true;
    box.addEventListener('change', () => {
      setIncludeHidden(box.checked);
      settingsChanged();
    }, { signal });
  });
  options(root).forEach((option) => {
    option.classList.remove('disabled');
    option.addEventListener('click', () => {
      if (option.classList.contains('disabled')) return;
      const next = option.dataset.scope;
      if (next === 'selection' || next === 'page' || next === 'document') {
        applySelection(root, next);
        settingsChanged();
      }
    }, { signal });
  });
}

export function getScope(): Scope {
  return chosen;
}

/** Tells remembered settings that the user changed something. */
function settingsChanged(): void {
  document.dispatchEvent(new CustomEvent('copydesk:settings-changed'));
}

/**
 * Restores a remembered scope. Selection is only restored when it is a real
 * choice right now -- when its option is enabled -- otherwise the current
 * fallback (Current page) stands.
 */
export function setScope(scope: Scope): void {
  if (!host) return;
  if (scope === 'selection' && selectionOptions(host).some((o) => o.classList.contains('disabled'))) return;
  applySelection(host, scope);
}

export function setIncludeHidden(value: boolean): void {
  includeHidden = value;
  if (host) hiddenBoxes(host).forEach((box) => (box.checked = value));
}

/**
 * Whether walks include hidden layers. Like the scope, one value shown in each
 * panel: ticking either box sets both. On by default -- today's behaviour.
 */
let includeHidden = true;

function hiddenBoxes(root: Document): HTMLInputElement[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>('input.include-hidden'));
}

export function getIncludeHidden(): boolean {
  return includeHidden;
}

/**
 * The sandbox tells the UI whether anything is selected -- the UI cannot ask
 * Figma itself. When nothing is selected, "Selection" is not a real choice:
 * disable it, and if it was the chosen scope, fall the visible choice back to
 * "Current page" so the control never shows something the user can't have.
 *
 * The control is rendered once per panel (Extract and Find & Replace each
 * have their own `.scope-selector` markup, sharing one scope per spec 3.1),
 * so every copy of the "Selection" option must be disabled together -- an
 * un-disabled copy elsewhere in the document would let a click set the scope
 * to `selection` while presenting itself as choosable with nothing selected.
 */
export function setSelectionPresent(present: boolean): void {
  if (!host) return;
  const matches = selectionOptions(host);
  if (matches.length === 0) return;

  matches.forEach((option) => option.classList.toggle('disabled', !present));
  if (!present && chosen === 'selection') {
    applySelection(host, 'page');
  }
}
