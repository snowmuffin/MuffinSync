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
const draw = (changeSet: ChangeSet, onApply = vi.fn(), onCancel = vi.fn()) => {
  act(() => {
    render(
      <ReviewScreen changeSet={changeSet} onApply={onApply} onCancel={onCancel} />,
      host
    );
  });
  return { onApply, onCancel };
};

// Ruling: `data-change` sits on the checkbox only, `data-change-row` on the
// row. `[data-change]` alone would match both the row and its checkbox.
const rows = () => Array.from(host.querySelectorAll('[data-change-row]'));
const boxes = () =>
  Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-change]'));
const applyButton = () =>
  host.querySelector<HTMLButtonElement>('[data-action=apply]');

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

  it('counts the selection in the apply button', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));
    expect(applyButton()?.textContent).toContain('2');

    act(() => {
      boxes()[0].click();
    });
    expect(applyButton()?.textContent).toContain('1');
  });

  it('disables applying when nothing is selected', () => {
    draw(setOf({ changes: [change('1:1', 'a')] }));
    act(() => {
      boxes()[0].click();
    });
    expect(applyButton()?.disabled).toBe(true);
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
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-action=cancel]')?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says so when a file changes nothing', () => {
    draw(setOf({ unchangedCount: 12 }));
    expect(host.textContent).toContain('No changes');
    expect(applyButton()?.disabled).toBe(true);
  });
});
