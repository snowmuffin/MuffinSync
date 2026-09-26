/**
 * Which panel of the main screen is showing.
 *
 * A class toggle rather than a Preact shell: the extract and import sections
 * are imperative modules that query this markup, and wrapping them in a
 * component tree buys nothing the user can see. Preact is here for the review
 * table and the results list. See spec section 3.3.
 */
export type TabName = 'extract' | 'find-replace' | 'generate' | 'snippets';

const TABS: readonly TabName[] = ['extract', 'find-replace', 'generate', 'snippets'];

let host: Document | null = null;

/** Aborting it removes every listener the previous `initTabs` added. */
let listeners: AbortController | null = null;

function tabElement(root: Document, name: TabName): HTMLElement | null {
  return root.querySelector<HTMLElement>(`.tab[data-tab="${name}"]`);
}

/**
 * The class carries the look; `aria-selected` carries the same fact to a
 * screen reader, which cannot see colour or weight. Only the selected tab is
 * in the Tab order -- the others are reached with the arrow keys, per the
 * WAI-ARIA tabs pattern.
 */
export function showTab(name: TabName): void {
  if (!host) return;
  for (const tab of TABS) {
    const selected = tab === name;
    host.getElementById(`${tab}-panel`)?.classList.toggle('hidden', !selected);
    const element = tabElement(host, tab);
    if (!element) continue;
    element.classList.toggle('selected', selected);
    element.setAttribute('aria-selected', String(selected));
    element.tabIndex = selected ? 0 : -1;
  }
}

/**
 * Which tab an arrow, Home or End key moves to from `current`, if any, among
 * the tabs actually in the markup.
 */
function tabForKey(tabs: readonly TabName[], current: TabName, key: string): TabName | null {
  const index = tabs.indexOf(current);
  switch (key) {
    case 'ArrowRight':
      return tabs[(index + 1) % tabs.length];
    case 'ArrowLeft':
      return tabs[(index - 1 + tabs.length) % tabs.length];
    case 'Home':
      return tabs[0];
    case 'End':
      return tabs[tabs.length - 1];
    default:
      return null;
  }
}

function isTabName(value: string | undefined): value is TabName {
  return (TABS as readonly (string | undefined)[]).includes(value);
}

export function initTabs(root: Document): void {
  host = root;
  // Extract is the tab every session opens on. Reasserting it here rather than
  // trusting whatever class the markup carries keeps module and DOM in step --
  // the same reason `initScope` reasserts its default.
  showTab('extract');
  listeners?.abort();
  listeners = new AbortController();
  const { signal } = listeners;
  root.querySelectorAll<HTMLElement>('.tab').forEach((element) => {
    element.addEventListener('click', () => {
      const name = element.dataset.tab;
      if (isTabName(name)) showTab(name);
    }, { signal });
    element.addEventListener('keydown', (event) => {
      const current = element.dataset.tab;
      if (!isTabName(current)) return;
      const present = TABS.filter((tab) => tabElement(root, tab) !== null);
      const next = tabForKey(present, current, event.key);
      if (!next) return;
      event.preventDefault();
      showTab(next);
      tabElement(root, next)?.focus();
    }, { signal });
  });
}
