/**
 * Which panel of the main screen is showing.
 *
 * A class toggle rather than a Preact shell: the extract and import sections
 * are imperative modules that query this markup, and wrapping them in a
 * component tree buys nothing the user can see. Preact is here for the review
 * table and the results list. See spec section 3.3.
 */
export type TabName = 'extract' | 'find-replace';

const TABS: readonly TabName[] = ['extract', 'find-replace'];

let host: Document | null = null;

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

/** Which tab an arrow, Home or End key moves to from `current`, if any. */
function tabForKey(current: TabName, key: string): TabName | null {
  const index = TABS.indexOf(current);
  switch (key) {
    case 'ArrowRight':
      return TABS[(index + 1) % TABS.length];
    case 'ArrowLeft':
      return TABS[(index - 1 + TABS.length) % TABS.length];
    case 'Home':
      return TABS[0];
    case 'End':
      return TABS[TABS.length - 1];
    default:
      return null;
  }
}

function isTabName(value: string | undefined): value is TabName {
  return value === 'extract' || value === 'find-replace';
}

export function initTabs(root: Document): void {
  host = root;
  // Extract is the tab every session opens on. Reasserting it here rather than
  // trusting whatever class the markup carries keeps module and DOM in step --
  // the same reason `initScope` reasserts its default.
  showTab('extract');
  root.querySelectorAll<HTMLElement>('.tab').forEach((element) => {
    element.addEventListener('click', () => {
      const name = element.dataset.tab;
      if (isTabName(name)) showTab(name);
    });
    element.addEventListener('keydown', (event) => {
      const current = element.dataset.tab;
      if (!isTabName(current)) return;
      const next = tabForKey(current, event.key);
      if (!next) return;
      event.preventDefault();
      showTab(next);
      tabElement(root, next)?.focus();
    });
  });
}
