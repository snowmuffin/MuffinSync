import { useState } from 'preact/hooks';
import type { BlockedChange, ChangeSet, ProposedChange } from '../../../shared/types';

export interface ReviewProps {
  changeSet: ChangeSet;
  onApply(accepted: ProposedChange[]): void;
  onCancel(): void;
  onNavigate(nodeId: string): void;
}

/** Blocked rows never carry a checkbox; this is the only place their reason becomes words. */
const BLOCKED_REASON: Record<BlockedChange['reason'], string> = {
  missing: 'layer no longer exists',
  'not-text': 'layer is no longer a text layer',
};

/**
 * Pure: reports a decision through `onApply`/`onCancel` and touches nothing
 * else. Wiring it to the message bus is a later task.
 *
 * Before/after are stacked, not side by side. The panel is 400px wide, so two
 * columns leave roughly 170px each -- not enough room for ordinary UI copy.
 */
export function ReviewScreen({ changeSet, onApply, onCancel, onNavigate }: ReviewProps) {
  const { changes, blocked, unchangedCount } = changeSet;
  const total = changes.length + unchangedCount + blocked.length;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(changes.filter((change) => change.accepted).map((change) => change.nodeId))
  );

  const selectedCount = changes.filter((change) => selected.has(change.nodeId)).length;
  const allSelected = changes.length > 0 && selectedCount === changes.length;

  const toggleChange = (nodeId: string) => (event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (target.checked) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  };

  const toggleAll = (event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    setSelected(
      target.checked ? new Set(changes.map((change) => change.nodeId)) : new Set()
    );
  };

  const handleApply = () => {
    // `accepted` arrives here as `true` on every change, because planning has
    // no user to ask. Overwrite it with what the user actually decided: it is
    // the field spec 3.2's apply path filters on, so it has to mean something.
    const decided = changes.map((change) => ({
      ...change,
      accepted: selected.has(change.nodeId),
    }));
    onApply(decided.filter((change) => change.accepted));
  };

  return (
    <div class="section">
      <div class="section-title">Review changes</div>
      <div class="instruction">
        {changes.length > 0
          ? `${changes.length} of ${total} layers changed`
          : `No changes to apply (${unchangedCount} unchanged)`}
      </div>

      {changes.length > 0 && (
        <div class="review-toolbar">
          <label class="review-select-all">
            <input type="checkbox" checked={allSelected} onClick={toggleAll} />
            Select all
          </label>
          <span class="review-unchanged">{unchangedCount} unchanged</span>
        </div>
      )}

      {changes.map((change) => (
        <div class="review-row" data-change-row="" key={change.nodeId}>
          <div class="review-row-top">
            <label class="review-row-header">
              <input
                type="checkbox"
                data-change=""
                checked={selected.has(change.nodeId)}
                onClick={toggleChange(change.nodeId)}
              />
              <span class="review-row-name">{change.layerName}</span>
            </label>
            <button
              type="button"
              class="results-row-navigate"
              data-navigate=""
              onClick={() => onNavigate(change.nodeId)}
            >
              Show
            </button>
          </div>
          <div class="review-row-diff">
            <div class="review-row-before">− {change.before}</div>
            <div class="review-row-after">+ {change.after}</div>
          </div>
        </div>
      ))}

      {blocked.length > 0 && (
        <div class="review-blocked">
          <div class="review-blocked-title">Cannot apply ({blocked.length})</div>
          {blocked.map((change) => (
            <div class="review-blocked-row" key={change.nodeId}>
              <span class="review-blocked-row-text">
                {change.layerName} — {BLOCKED_REASON[change.reason]}
              </span>
              <button
                type="button"
                class="results-row-navigate"
                data-navigate=""
                onClick={() => onNavigate(change.nodeId)}
              >
                Show
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        class="button primary"
        data-action="apply"
        disabled={selectedCount === 0}
        onClick={handleApply}
      >
        Apply {selectedCount} {selectedCount === 1 ? 'change' : 'changes'}
      </button>
      <button class="button secondary" data-action="cancel" onClick={() => onCancel()}>
        Cancel
      </button>
    </div>
  );
}
