import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings';
import { post } from '../post';
import { getTab, showTab } from './tabs';
import { getIncludeHidden, getScope, setIncludeHidden, setScope } from './scope';

/**
 * Remembered settings: applies what the sandbox sends after `ui-ready`, and
 * saves whenever the user changes something it covers. Nothing is saved until
 * the stored settings have arrived, so a slow start never overwrites them with
 * defaults. See docs/superpowers/specs/2026-09-26-copy-tools-design.md §2.
 *
 * Modules signal a change by dispatching `copydesk:settings-changed` on the
 * document (tabs, scope) or it is picked up from the controls' `change` events
 * (checkboxes), so no module needs to import this one.
 */

const SAVE_DELAY_MS = 300;

/** Checkbox ids whose value is part of the settings. */
const CHECKBOXES = ['case-sensitive', 'whole-word', 'use-regex', 'context-columns'];

let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Rule toggles kept by the Check tab; stored as-is. */
let checks: Record<string, boolean> = {};

function box(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
}

export function currentSettings(): Settings {
  return {
    tab: getTab(),
    scope: getScope(),
    includeHidden: getIncludeHidden(),
    match: {
      caseSensitive: box('case-sensitive')?.checked ?? false,
      wholeWord: box('whole-word')?.checked ?? false,
      regex: box('use-regex')?.checked ?? false,
    },
    contextColumns: box('context-columns')?.checked ?? false,
    checks: { ...checks },
  };
}

function scheduleSave(): void {
  if (!loaded) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    post({ type: 'save-settings', settings: currentSettings() });
  }, SAVE_DELAY_MS);
}

export function applySettings(settings: Settings): void {
  showTab(settings.tab);
  setScope(settings.scope);
  setIncludeHidden(settings.includeHidden);
  const set = (id: string, value: boolean) => {
    const element = box(id);
    if (element) element.checked = value;
  };
  set('case-sensitive', settings.match.caseSensitive);
  set('whole-word', settings.match.wholeWord);
  set('use-regex', settings.match.regex);
  set('context-columns', settings.contextColumns);
  checks = { ...settings.checks };
  loaded = true;
  document.dispatchEvent(new CustomEvent('copydesk:settings-applied'));
}

export function getCheckToggles(): Record<string, boolean> {
  return checks;
}

export function setCheckToggle(rule: string, on: boolean): void {
  checks = { ...checks, [rule]: on };
  scheduleSave();
}

/** Aborting it removes the listeners the previous `initSettings` added. */
let listeners: AbortController | null = null;

export function initSettings(root: Document): void {
  loaded = false;
  checks = { ...DEFAULT_SETTINGS.checks };
  listeners?.abort();
  listeners = new AbortController();
  const { signal } = listeners;
  root.addEventListener('copydesk:settings-changed', scheduleSave, { signal });
  root.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && CHECKBOXES.includes(target.id)) scheduleSave();
    },
    { signal }
  );
}
