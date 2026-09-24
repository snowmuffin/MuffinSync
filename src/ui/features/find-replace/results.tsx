import { useState } from 'preact/hooks';
import type { ReplaceTarget, SearchMatch } from '../../../shared/types';

export interface ResultListProps {
  matches: SearchMatch[];
  canReplace: boolean;
  onReplace(targets: ReplaceTarget[]): void;
  onCancel(): void;
  onNavigate(nodeId: string): void;
}

/**
 * Pure: reports a decision through `onReplace`/`onCancel`/`onNavigate` and
 * touches nothing else. Wiring it to the message bus is `index.ts`'s job.
 *
 * Searching without a replacement is a first-class use (spec 3.4): when
 * `canReplace` is false there is nothing to accept, so no checkbox and no
 * replace action are shown at all.
 */
export function ResultList({ matches, canReplace, onReplace, onCancel, onNavigate }: ResultListProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(matches.map((match) => match.nodeId))
  );

  const totalMatches = matches.reduce((sum, match) => sum + match.matchCount, 0);
  const selectedCount = matches.filter((match) => selected.has(match.nodeId)).length;

  const toggleMatch = (nodeId: string) => (event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (target.checked) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  };

  const handleReplace = () => {
    const targets: ReplaceTarget[] = matches
      .filter((match) => selected.has(match.nodeId))
      .map((match) => ({ nodeId: match.nodeId, layerName: match.layerName }));
    onReplace(targets);
  };

  return (
    <div class="section">
      <div class="section-title">Search results</div>
      <div class="results-summary">
        {totalMatches} {totalMatches === 1 ? 'match' : 'matches'} in {matches.length}{' '}
        {matches.length === 1 ? 'layer' : 'layers'}
      </div>

      {matches.map((match) => (
        <div class="results-row" data-match-row="" key={match.nodeId}>
          {canReplace && (
            <input
              type="checkbox"
              data-match=""
              checked={selected.has(match.nodeId)}
              onClick={toggleMatch(match.nodeId)}
            />
          )}
          <div class="results-row-body">
            <div class="results-row-name">
              <span>
                {match.layerName} ({match.matchCount})
              </span>
              <button
                type="button"
                class="results-row-navigate"
                data-navigate=""
                onClick={() => onNavigate(match.nodeId)}
              >
                Show
              </button>
            </div>
            <div class="results-row-text">{match.characters}</div>
          </div>
        </div>
      ))}

      {canReplace && (
        <button
          class="button primary"
          data-action="replace"
          disabled={selectedCount === 0}
          onClick={handleReplace}
        >
          Replace {selectedCount} {selectedCount === 1 ? 'layer' : 'layers'}
        </button>
      )}
      <button class="button secondary" data-action="cancel" onClick={() => onCancel()}>
        Close
      </button>
    </div>
  );
}
