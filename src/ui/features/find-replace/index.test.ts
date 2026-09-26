// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';

vi.mock('../../post', () => ({ post: vi.fn() }));

import { post } from '../../post';
import { mountStatus } from '../../status';
import { initFindReplace, showResults } from './index';
import { beginTask, endTask } from '../task';
import type { SearchMatch } from '../../../shared/types';

const matches: SearchMatch[] = [
  { nodeId: '1:1', layerName: 'Hero', characters: 'Sign up', matchCount: 1 },
];

function markup(): void {
  document.body.innerHTML = `
    <div id="main-content">
      <div id="find-replace-panel" class="tab-panel">
        <form id="find-form">
          <input id="find-input" type="text" />
          <input id="replace-input" type="text" />
          <input id="case-sensitive" type="checkbox" />
          <input id="whole-word" type="checkbox" />
          <input id="use-regex" type="checkbox" />
          <button class="button primary" id="search-btn" type="submit" disabled></button>
        </form>
      </div>
      <div class="scope-selector">
        <div class="scope-option selected" data-scope="selection"></div>
        <div class="scope-option" data-scope="page"></div>
      </div>
    </div>
    <div id="results-host"></div>
    <div id="status-host"></div>
  `;
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const searchBtn = () => document.getElementById('search-btn') as HTMLButtonElement;
const form = () => document.getElementById('find-form') as HTMLFormElement;

describe('find & replace wiring', () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    // The router ends a task before handing its answer to `showResults`;
    // tests call `showResults` directly, so each starts from idle.
    endTask();
    markup();
    const host = document.getElementById('status-host');
    if (host) mountStatus(host);
    initFindReplace(document);
  });

  it('keeps Search disabled until there is something to find', () => {
    expect(searchBtn().disabled).toBe(true);
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    expect(searchBtn().disabled).toBe(false);
  });

  it('disables Search again when the query is cleared', () => {
    input('find-input').value = 'x';
    input('find-input').dispatchEvent(new Event('input'));
    input('find-input').value = '';
    input('find-input').dispatchEvent(new Event('input'));
    expect(searchBtn().disabled).toBe(true);
  });

  it('treats a whitespace-only query as searchable, and posts it verbatim', () => {
    // Collapsing a double space into a single one is one of the jobs this
    // feature exists for, so only an empty field disables Search.
    input('find-input').value = '  ';
    input('find-input').dispatchEvent(new Event('input'));
    expect(searchBtn().disabled).toBe(false);

    searchBtn().click();
    expect(post).toHaveBeenCalledWith({
      type: 'search',
      query: '  ',
      scope: 'selection',
      includeHidden: true,
      caseSensitive: false,
      wholeWord: false,

      regex: false,
    });
  });

  it('keeps a leading space in the posted query', () => {
    // " Pro" is how a user avoids matching "Product". Trimming it would search
    // "Pro" while the field showed " Pro", and then replace on that.
    input('find-input').value = ' Pro';
    input('find-input').dispatchEvent(new Event('input'));
    searchBtn().click();
    expect(post).toHaveBeenCalledWith({
      type: 'search',
      query: ' Pro',
      scope: 'selection',
      includeHidden: true,
      caseSensitive: false,
      wholeWord: false,

      regex: false,
    });
  });

  it('searches when the form is submitted, as Enter in a field does', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    form().requestSubmit();
    expect(post).toHaveBeenCalledWith({
      type: 'search',
      query: 'Sign up',
      scope: 'selection',
      includeHidden: true,
      caseSensitive: false,
      wholeWord: false,

      regex: false,
    });
  });

  it('posts nothing when a submit arrives with an empty query', () => {
    // The browser does not submit implicitly while the button is disabled;
    // this is the guard for anything that dispatches submit regardless.
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    expect(post).not.toHaveBeenCalled();
  });

  it('cancels the submission, so the panel is never navigated away', () => {
    input('find-input').value = 'x';
    const event = new Event('submit', { cancelable: true });
    form().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('refuses to start a search while another task is running', () => {
    beginTask('extract');
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    searchBtn().click();
    expect(post).not.toHaveBeenCalled();
  });

  it('says what is wrong with an invalid pattern and does not search', () => {
    input('find-input').value = '(net';
    input('find-input').dispatchEvent(new Event('input'));
    input('use-regex').checked = true;
    act(() => searchBtn().click());
    expect(post).not.toHaveBeenCalled();
    expect(document.getElementById('status-host')?.textContent).toMatch(/Invalid regular expression/);
  });

  it('posts regex: true when Regular expression is ticked', () => {
    input('find-input').value = '\\d+';
    input('find-input').dispatchEvent(new Event('input'));
    input('use-regex').checked = true;
    searchBtn().click();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'search', regex: true }));
  });

  it('posts the query, the scope, and both options', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    input('case-sensitive').checked = true;
    searchBtn().click();
    expect(post).toHaveBeenCalledWith({
      type: 'search',
      query: 'Sign up',
      scope: 'selection',
      includeHidden: true,
      caseSensitive: true,
      wholeWord: false,

      regex: false,
    });
  });

  it('says so when a search comes back with nothing', () => {
    // Preact batches the status banner's state update (see status.test.tsx
    // and review/index.test.ts, which wrap every status-triggering call the
    // same way), so the assertion below needs the update flushed first.
    act(() => {
      showResults([]);
    });
    expect(document.getElementById('results-host')?.innerHTML).toBe('');
    expect(document.getElementById('status-host')?.textContent).toContain('No layers');
  });

  it('covers the main screen while results are showing', () => {
    showResults(matches);
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(true);
  });

  it('uncovers it again on close', () => {
    showResults(matches);
    const close = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close')
    )!;
    close.click();
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('results-host')?.innerHTML).toBe('');
  });

  it('posts a navigate when a row asks to be centred', () => {
    showResults(matches);
    document.querySelector<HTMLElement>('[data-navigate]')!.click();
    expect(post).toHaveBeenCalledWith({ type: 'navigate', nodeId: '1:1' });
  });

  it('posts plan-replace with the query and replacement it was searched with', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    input('replace-input').value = 'Get started';
    searchBtn().click();
    showResults(matches);

    const replace = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Replace')
    )!;
    replace.click();

    expect(post).toHaveBeenCalledWith({
      type: 'plan-replace',
      query: 'Sign up',
      replacement: 'Get started',
      targets: [{ nodeId: '1:1', layerName: 'Hero' }],
      scope: 'selection',
      caseSensitive: false,
      wholeWord: false,

      regex: false,
    });
  });

  it('says it is searching while the search runs', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    act(() => {
      searchBtn().click();
    });
    expect(document.getElementById('status-host')?.textContent).toContain(
      'Searching text layers'
    );
  });

  it('takes the searching message down when results arrive', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    act(() => {
      searchBtn().click();
    });
    act(() => {
      showResults(matches);
    });
    // The results are the answer to it, and the banner sits outside
    // #main-content, so it would otherwise stay up beside the answer.
    expect(document.getElementById('status-host')?.innerHTML).toBe('');
  });

  it('says it is checking what would change while the replacement is planned', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    input('replace-input').value = 'Get started';
    act(() => {
      searchBtn().click();
    });
    act(() => {
      showResults(matches);
    });

    const replace = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Replace')
    )!;
    act(() => {
      replace.click();
    });

    expect(document.getElementById('status-host')?.textContent).toContain(
      'Checking what would change'
    );
  });

  it('does not inherit the previous selection when a second search comes back', () => {
    // #main-content stays visible until the first results arrive, so two
    // searches can be in flight: type `a`, Search, type `b`, Search. Without a
    // fresh mount the second list reconciles the first one's tree and the
    // useState initialiser never re-runs, so it arrives carrying the old
    // decisions. Mirrors review/index.test.ts's equivalent test.
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    input('replace-input').value = 'Get started';
    act(() => {
      searchBtn().click();
    });

    act(() => {
      showResults([
        { nodeId: '1:1', layerName: 'Hero', characters: 'Sign up', matchCount: 1 },
        { nodeId: '1:2', layerName: 'Footer', characters: 'Sign up', matchCount: 1 },
      ]);
    });
    const boxes = () =>
      document.querySelectorAll<HTMLInputElement>('#results-host [data-match]');
    act(() => {
      boxes()[0].click();
    });
    expect(boxes()[0].checked).toBe(false);

    act(() => {
      showResults([
        { nodeId: '9:1', layerName: 'Card', characters: 'Sign up', matchCount: 1 },
        { nodeId: '9:2', layerName: 'Modal', characters: 'Sign up', matchCount: 1 },
      ]);
    });
    expect(Array.from(boxes()).every((b) => b.checked)).toBe(true);
  });

  it('returns to the main screen when a second search comes back with nothing', () => {
    // Two searches can be in flight (see the test above): rows from search 1
    // hide #main-content, then search 2 comes back empty. Without restoring
    // visibility here, the user is stranded on a hidden main screen with only
    // a status banner and no way back short of reopening the plugin.
    act(() => {
      showResults(matches);
    });
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(true);

    act(() => {
      showResults([]);
    });
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('results-host')?.innerHTML).toBe('');
  });

  it('offers no replace action when the replacement was left empty', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    searchBtn().click();
    showResults(matches);
    expect(
      Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.includes('Replace'))
    ).toBe(false);
  });
});
