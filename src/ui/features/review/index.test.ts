// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { ChangeSet, ProposedChange } from '../../../shared/types';

// The only thing this module does that reaches outside the document.
vi.mock('../../post', () => ({ post: vi.fn() }));

import { post } from '../../post';
import { mountStatus, showStatus } from '../../status';
import { openReview, closeReview, invalidateOnSelectionChange } from './index';

const posted = vi.mocked(post);

const change = (nodeId: string): ProposedChange => ({
  nodeId,
  layerName: `Layer ${nodeId}`,
  before: 'old',
  after: 'new',
  source: 'import',
  accepted: true,
});

const setOf = (changes: ProposedChange[]): ChangeSet => ({
  changes,
  blocked: [],
  unchangedCount: 0,
  createdAt: 0,
});

// The three hosts ui.html gives this module.
const markup = `
  <div id="main-content">main</div>
  <div id="review-host"></div>
  <div id="status-host"></div>
`;

const main = () => document.getElementById('main-content');
const reviewHost = () => document.getElementById('review-host');
const statusHost = () => document.getElementById('status-host');

const click = (selector: string) =>
  act(() => {
    reviewHost()?.querySelector<HTMLButtonElement>(selector)?.click();
  });

beforeEach(() => {
  posted.mockClear();
  document.body.innerHTML = markup;
  act(() => {
    const host = statusHost();
    if (host) mountStatus(host);
  });
});

describe('review mounting', () => {
  it('hides the main screen and renders the review', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });

    expect(main()?.classList.contains('hidden')).toBe(true);
    expect(reviewHost()?.textContent).toContain('Review changes');
  });

  it('brings the main screen back when the review closes', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });
    act(() => {
      closeReview();
    });

    expect(main()?.classList.contains('hidden')).toBe(false);
    expect(reviewHost()?.innerHTML).toBe('');
  });

  it('takes down the status the review is the answer to', () => {
    act(() => {
      showStatus('Checking what would change...', 'info');
    });
    expect(statusHost()?.textContent).toContain('Checking what would change');

    act(() => {
      openReview(setOf([change('1:1')]));
    });

    expect(statusHost()?.innerHTML).toBe('');
  });
});

describe('review decisions', () => {
  it('posts the accepted changes and closes the review', () => {
    act(() => {
      openReview(setOf([change('1:1'), change('1:2')]));
    });
    click('[data-action=apply]');

    expect(posted).toHaveBeenCalledTimes(1);
    expect(posted.mock.calls[0][0]).toEqual({
      type: 'apply',
      changes: [change('1:1'), change('1:2')],
    });
    expect(main()?.classList.contains('hidden')).toBe(false);
  });

  it('says it is applying while the write runs', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });
    click('[data-action=apply]');

    // The review is already gone, so without this the stale "Checking what
    // would change..." banner would be the only thing on screen.
    expect(statusHost()?.textContent).toContain('Applying changes');
  });

  it('posts nothing when the review is cancelled', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });
    click('[data-action=cancel]');

    expect(posted).not.toHaveBeenCalled();
    expect(main()?.classList.contains('hidden')).toBe(false);
  });

  it('says nothing was changed when the review is cancelled', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });
    click('[data-action=cancel]');

    // Parity check 3 asserts against this sentence. It names the screen, not
    // the producer: find & replace cancels here too.
    expect(statusHost()?.textContent).toContain(
      'Review cancelled. Nothing was changed.'
    );
  });

  it('posts a navigate when a review row asks to be centred', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });
    act(() => {
      reviewHost()?.querySelector<HTMLElement>('[data-navigate]')?.click();
    });
    expect(posted).toHaveBeenCalledWith({ type: 'navigate', nodeId: '1:1' });
  });

  it('does not inherit the previous selection when a second set opens', () => {
    // Two producers exist now, so a set can follow a set. Without a remount the
    // component keeps the state it initialised with and the new rows arrive
    // carrying the old decisions.
    act(() => {
      openReview({
        changes: [change('1:1'), change('1:2')],
        blocked: [],
        unchangedCount: 0,
        createdAt: 1,
      });
    });
    const boxes = () =>
      reviewHost()!.querySelectorAll<HTMLInputElement>('[data-change]');
    act(() => {
      boxes()[0].click();
    });
    expect(boxes()[0].checked).toBe(false);

    act(() => {
      openReview({
        changes: [change('9:1'), change('9:2')],
        blocked: [],
        unchangedCount: 0,
        createdAt: 2,
      });
    });
    expect(Array.from(boxes()).every((b) => b.checked)).toBe(true);
  });

  it('closes a selection-scoped review when the selection changes, and says why', () => {
    act(() => {
      openReview({
        changes: [change('1:1')],
        blocked: [],
        unchangedCount: 0,
        createdAt: 1,
        scope: 'selection',
      });
    });
    act(() => {
      invalidateOnSelectionChange();
    });
    expect(reviewHost()?.innerHTML).toBe('');
    expect(main()?.classList.contains('hidden')).toBe(false);
    expect(statusHost()?.textContent).toContain('selection changed');
  });

  it('leaves a page-scoped review alone when the selection changes', () => {
    act(() => {
      openReview({
        changes: [change('1:1')],
        blocked: [],
        unchangedCount: 0,
        createdAt: 1,
        scope: 'page',
      });
    });
    act(() => {
      invalidateOnSelectionChange();
    });
    expect(reviewHost()?.innerHTML).not.toBe('');
  });

  it('leaves an import review alone, which has no scope at all', () => {
    act(() => {
      openReview(setOf([change('1:1')]));
    });
    act(() => {
      invalidateOnSelectionChange();
    });
    expect(reviewHost()?.innerHTML).not.toBe('');
  });

  it('is safe to call with no review open', () => {
    expect(() => invalidateOnSelectionChange()).not.toThrow();
  });
});
