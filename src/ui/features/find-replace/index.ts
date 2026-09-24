import { h, render } from 'preact';
import type { MatchOptions, ReplaceTarget, Scope, SearchMatch } from '../../../shared/types';
import { ResultList } from './results';
import { post } from '../../post';
import { clearStatus, showStatus } from '../../status';
import { byId } from '../../dom';
import { getScope } from '../scope';

/**
 * `ResultList` is pure -- it reports a decision, it sends nothing. This
 * module is the only thing that turns that decision into a message and owns
 * when the list is mounted at all. No JSX here on purpose: this file keeps
 * the `.ts` extension, and JSX syntax requires `.tsx`.
 */

interface RememberedSearch {
  query: string;
  replacement: string;
  scope: Scope;
  options: MatchOptions;
}

/**
 * What a search was run with, captured the moment Search is clicked. The
 * inputs can change while results are on screen -- the row checkboxes, the
 * find/replace text -- so `plan-replace` has to read this, not the live DOM,
 * or it would send whatever the fields happen to hold rather than what the
 * results in front of the user were produced from.
 */
let lastSearch: RememberedSearch | null = null;

function setMainHidden(hidden: boolean): void {
  byId('main-content')?.classList.toggle('hidden', hidden);
}

function handleReplace(targets: ReplaceTarget[]): void {
  if (!lastSearch) return;
  post({
    type: 'plan-replace',
    query: lastSearch.query,
    replacement: lastSearch.replacement,
    targets,
    scope: lastSearch.scope,
    caseSensitive: lastSearch.options.caseSensitive,
    wholeWord: lastSearch.options.wholeWord,
  });
  closeResults();
  // The results are already gone but the sandbox is still re-reading every
  // target; say so until `change-set` opens the review, whose `openReview`
  // clears this. Same sentence as the import producer: it is the same wait.
  showStatus('Checking what would change...', 'info');
}

function handleNavigate(nodeId: string): void {
  post({ type: 'navigate', nodeId });
}

function handleCancel(): void {
  closeResults();
}

export function showResults(matches: SearchMatch[]): void {
  const host = byId('results-host');
  if (!host) return;

  if (matches.length === 0) {
    render(null, host);
    showStatus('No layers matched your search.', 'info');
    return;
  }

  const canReplace = (lastSearch?.replacement ?? '').length > 0;

  clearStatus();
  setMainHidden(true);
  // Unmount first, so a second result set cannot reconcile the first one's
  // tree and inherit its checkbox state -- `ResultList` seeds its selection in
  // a `useState` initialiser, which does not re-run on an update. Two searches
  // can be in flight: the main screen stays live until the first rows arrive.
  // (`openReview` gets the same guarantee from its `key`.)
  render(null, host);
  render(
    h(ResultList, {
      matches,
      canReplace,
      onReplace: handleReplace,
      onCancel: handleCancel,
      onNavigate: handleNavigate,
    }),
    host
  );
}

function closeResults(): void {
  const host = byId('results-host');
  if (!host) return;
  render(null, host);
  setMainHidden(false);
}

export function initFindReplace(root: Document): void {
  const findInput = root.getElementById('find-input') as HTMLInputElement | null;
  const replaceInput = root.getElementById('replace-input') as HTMLInputElement | null;
  const caseSensitive = root.getElementById('case-sensitive') as HTMLInputElement | null;
  const wholeWord = root.getElementById('whole-word') as HTMLInputElement | null;
  const searchBtn = root.getElementById('search-btn') as HTMLButtonElement | null;
  if (!findInput || !replaceInput || !caseSensitive || !wholeWord || !searchBtn) return;

  // Empty disables the button (spec 3.4); whitespace does not. A query of two
  // spaces replaced by one is ordinary copy QA, so the length that decides is
  // the raw one -- trimming here would make that job unreachable.
  findInput.addEventListener('input', () => {
    searchBtn.disabled = findInput.value.length === 0;
  });

  searchBtn.addEventListener('click', () => {
    // Posted verbatim. Trimming would search something other than what the
    // field shows: " Pro" typed to avoid matching "Product" would search
    // "Pro" and then rewrite it, on the path that writes to the document.
    const query = findInput.value;
    if (query.length === 0) return;

    const options: MatchOptions = {
      caseSensitive: caseSensitive.checked,
      wholeWord: wholeWord.checked,
    };
    const scope = getScope();
    const replacement = replaceInput.value;

    lastSearch = { query, replacement, scope, options };

    // Traversal is not chunked (deferred by ruling), so a large page can hold
    // the panel for seconds. Silence there reads as a crash. `showResults`
    // takes this down either way -- with `clearStatus` when rows arrive, or by
    // replacing it with "No layers matched your search."
    showStatus('Searching text layers...', 'info');
    post({
      type: 'search',
      query,
      scope,
      caseSensitive: options.caseSensitive,
      wholeWord: options.wholeWord,
    });
  });
}
