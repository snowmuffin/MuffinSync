// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ReviewScreen } from './screen';
import type { ChangeSet, ProposedChange } from '../../../shared/types';

const change = (nodeId: string, after: string): ProposedChange => ({
  nodeId,
  layerName: `Layer ${nodeId}`,
  before: 'before',
  after,
  source: 'import',
  accepted: true,
});

const setOf = (partial: Partial<ChangeSet>): ChangeSet => ({
  changes: [],
  blocked: [],
  unchangedCount: 0,
  createdAt: 0,
  ...partial,
});

let host: HTMLElement;
const draw = (
  changeSet: ChangeSet,
  onApply = vi.fn(),
  onCancel = vi.fn(),
  onNavigate = vi.fn()
) => {
  act(() => {
    render(
      <ReviewScreen
        changeSet={changeSet}
        onApply={onApply}
        onCancel={onCancel}
        onNavigate={onNavigate}
      />,
      host
    );
  });
  return { onApply, onCancel, onNavigate };
};

// Ruling: `data-change` sits on the checkbox only, `data-change-row` on the
// row. `[data-change]` alone would match both the row and its checkbox.
const rows = () => Array.from(host.querySelectorAll('[data-change-row]'));
const boxes = () =>
  Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-change]'));
const applyButton = () =>
  host.querySelector<HTMLButtonElement>('[data-action=apply]');
const selectAllBox = () =>
  host.querySelector<HTMLInputElement>('.review-select-all input[type=checkbox]');

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('ReviewScreen', () => {
  it('lists one row per change and none for unchanged rows', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')], unchangedCount: 197 }));
    expect(rows()).toHaveLength(2);
  });

  it('says how many changed out of how many were seen', () => {
    draw(setOf({ changes: [change('1:1', 'a')], unchangedCount: 199 }));
    expect(host.textContent).toContain('1 of 200 layers changed');
  });

  it('shows the before and after text of each change', () => {
    draw(setOf({ changes: [change('1:1', 'the new text')] }));
    expect(host.textContent).toContain('before');
    expect(host.textContent).toContain('the new text');
  });

  it('starts with every change selected', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));
    expect(boxes().every((b) => b.checked)).toBe(true);
  });

  it('applies only the changes still selected', () => {
    const { onApply } = draw(
      setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] })
    );

    act(() => {
      boxes()[0].click();
    });
    act(() => {
      applyButton()?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    const accepted = onApply.mock.calls[0][0] as ProposedChange[];
    expect(accepted.map((c) => c.nodeId)).toEqual(['1:2']);
  });

  it('marks what it sends with the user decision, not the planned one', () => {
    // A change that arrived unaccepted starts unticked; ticking it is the
    // user's decision, and that is what has to travel with the change.
    const planned = { ...change('1:1', 'a'), accepted: false };
    const { onApply } = draw(setOf({ changes: [planned] }));
    expect(boxes()[0].checked).toBe(false);

    act(() => {
      boxes()[0].click();
    });
    act(() => {
      applyButton()?.click();
    });

    const sent = onApply.mock.calls[0][0] as ProposedChange[];
    expect(sent).toEqual([{ ...planned, accepted: true }]);
  });

  it('counts the selection in the apply button', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));
    expect(applyButton()?.textContent).toBe('Apply 2 changes');
    // The action-bar spacing in src/ui.html keys off this class; a producer
    // that forgets it gets no spacing and nothing in CI notices otherwise.
    expect(applyButton()?.classList.contains('action')).toBe(true);

    act(() => {
      boxes()[0].click();
    });
    // One change is not "1 changes".
    expect(applyButton()?.textContent).toBe('Apply 1 change');
  });

  it('disables applying when nothing is selected', () => {
    draw(setOf({ changes: [change('1:1', 'a')] }));
    act(() => {
      boxes()[0].click();
    });
    expect(applyButton()?.disabled).toBe(true);
  });

  it('clicking select-all when everything is selected clears the selection', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));
    expect(selectAllBox()?.checked).toBe(true);

    act(() => {
      selectAllBox()?.click();
    });

    expect(boxes().every((b) => !b.checked)).toBe(true);
    expect(applyButton()?.disabled).toBe(true);
  });

  it('clicking select-all again re-selects everything', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));

    act(() => {
      selectAllBox()?.click();
    });
    act(() => {
      selectAllBox()?.click();
    });

    expect(boxes().every((b) => b.checked)).toBe(true);
    expect(applyButton()?.textContent).toContain('2');
  });

  it('clicking select-all with a mixed selection selects everything', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));

    // Untick one row, leaving a mixed selection.
    act(() => {
      boxes()[0].click();
    });
    expect(selectAllBox()?.checked).toBe(false);

    act(() => {
      selectAllBox()?.click();
    });

    // The control read as unchecked (not all were selected), so the click
    // native-toggles it to checked -- which the handler reads as "select
    // all", not "clear".
    expect(boxes().every((b) => b.checked)).toBe(true);
    expect(applyButton()?.textContent).toContain('2');
  });

  it('lists blocked rows with a reason and no checkbox', () => {
    draw(
      setOf({
        changes: [change('1:1', 'a')],
        blocked: [{ nodeId: '1:9', layerName: 'Old CTA', reason: 'missing' }],
      })
    );

    expect(host.textContent).toContain('Old CTA');
    expect(host.textContent).toContain('Cannot apply');
    // one checkbox for the change, none for the blocked row
    expect(boxes()).toHaveLength(1);
  });

  it('still allows applying when some rows are blocked', () => {
    draw(
      setOf({
        changes: [change('1:1', 'a')],
        blocked: [{ nodeId: '1:9', layerName: 'Old CTA', reason: 'not-text' }],
      })
    );
    expect(applyButton()?.disabled).toBe(false);
  });

  it('reports a cancel without applying anything', () => {
    const { onApply, onCancel } = draw(setOf({ changes: [change('1:1', 'a')] }));
    const cancelButton = host.querySelector<HTMLButtonElement>('[data-action=cancel]');
    expect(cancelButton?.classList.contains('action')).toBe(true);
    act(() => {
      cancelButton?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says so when a file changes nothing', () => {
    draw(setOf({ unchangedCount: 12 }));
    expect(host.textContent).toContain('No changes');
    expect(applyButton()?.disabled).toBe(true);
  });

  it('reports which layer to centre when a row asks', () => {
    const { onNavigate } = draw(setOf({ changes: [change('1:1', 'a')] }));
    act(() => {
      host.querySelectorAll<HTMLElement>('[data-navigate]')[0].click();
    });
    expect(onNavigate).toHaveBeenCalledWith('1:1');
  });

  it('offers the action on a not-text blocked row, which still names a node', () => {
    // A blocked row names a node the document could not take. 'not-text' is
    // still in the document and the user needs to find it.
    const { onNavigate } = draw(
      setOf({
        changes: [],
        blocked: [{ nodeId: '2:2', layerName: 'Shape', reason: 'not-text' }],
      })
    );
    act(() => {
      host.querySelectorAll<HTMLElement>('[data-navigate]')[0].click();
    });
    expect(onNavigate).toHaveBeenCalledWith('2:2');
  });

  it('offers no action on a missing blocked row, where it could only fail', () => {
    // 'missing' means the node is gone, so Show would always come back with
    // "That layer no longer exists."
    draw(
      setOf({
        changes: [],
        blocked: [
          { nodeId: '2:1', layerName: 'Gone', reason: 'missing' },
          { nodeId: '2:2', layerName: 'Shape', reason: 'not-text' },
        ],
      })
    );

    const blockedRows = Array.from(host.querySelectorAll('.review-blocked-row'));
    expect(blockedRows).toHaveLength(2);
    expect(blockedRows[0].querySelector('[data-navigate]')).toBeNull();
    expect(blockedRows[1].querySelector('[data-navigate]')).not.toBeNull();
  });
});

describe('ReviewScreen with a long list', () => {
  const manyChanges = (n: number) => Array.from({ length: n }, (_, i) => change(`9:${i}`, 'after'));
  const showMoreButtons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[data-show-more]'));

  it('renders the first 200 changes and offers the rest', () => {
    draw(setOf({ changes: manyChanges(300) }));
    expect(rows()).toHaveLength(200);
    expect(showMoreButtons()[0]?.textContent).toBe('Show 100 more (100 not shown)');
    act(() => showMoreButtons()[0].click());
    expect(rows()).toHaveLength(300);
    expect(showMoreButtons()).toHaveLength(0);
  });

  it('applies every accepted change, rendered or not', () => {
    const { onApply } = draw(setOf({ changes: manyChanges(300) }));
    expect(applyButton()?.textContent).toBe('Apply 300 changes');
    act(() => applyButton()!.click());
    expect(onApply.mock.calls[0][0]).toHaveLength(300);
  });

  it('lets Select all clear rows that are not rendered too', () => {
    draw(setOf({ changes: manyChanges(300) }));
    act(() => selectAllBox()!.click());
    expect(applyButton()?.textContent).toBe('Apply 0 changes');
    expect(applyButton()?.disabled).toBe(true);
  });

  it('pages the Cannot apply list on its own', () => {
    const blocked = Array.from({ length: 250 }, (_, i) => ({
      nodeId: `8:${i}`,
      layerName: `Gone ${i}`,
      reason: 'missing' as const,
    }));
    draw(setOf({ changes: manyChanges(10), blocked }));
    expect(host.querySelectorAll('.review-blocked-row')).toHaveLength(200);
    expect(showMoreButtons()).toHaveLength(1);
    expect(showMoreButtons()[0].textContent).toBe('Show 50 more (50 not shown)');
  });
});

describe('ReviewScreen and path matching', () => {
  it('tags a change found by path', () => {
    draw(setOf({ changes: [{ ...change('9:1', 'after'), matchedBy: 'path' }] }));
    expect(host.querySelector('.review-row-tag')?.textContent).toContain('matched by path');
  });

  it('explains an ambiguous row and offers no Show for it', () => {
    draw(setOf({ blocked: [{ nodeId: '1:1', layerName: 'Text', reason: 'ambiguous' }] }));
    const row = host.querySelector('.review-blocked-row')!;
    expect(row.textContent).toContain('several layers share its path');
    expect(row.querySelector('[data-navigate]')).toBeNull();
  });
});
