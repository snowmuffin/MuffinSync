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

export function showTab(name: TabName): void {
  if (!host) return;
  for (const tab of TABS) {
    host.getElementById(`${tab}-panel`)?.classList.toggle('hidden', tab !== name);
    host
      .querySelector<HTMLElement>(`.tab[data-tab="${tab}"]`)
      ?.classList.toggle('selected', tab === name);
  }
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
      if (name === 'extract' || name === 'find-replace') showTab(name);
    });
  });
}
