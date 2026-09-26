import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { MatchOptions, ReplaceTarget, SearchMatch } from '../../../shared/types';
import { findMatches } from '../../../shared/match';
import { LIST_PAGE, ShowMore } from '../show-more';

export interface ResultListProps {
  matches: SearchMatch[];
  /** What was searched for, so each row can highlight its own matches. */
  query: string;
  options: MatchOptions;
  canReplace: boolean;
  onReplace(targets: ReplaceTarget[]): void;
  onCancel(): void;
  onNavigate(nodeId: string): void;
}

/** Every occurrence index of a row: the default choice. */
function everyIndex(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, i) => i));
}

/**
 * Pure: reports a decision through `onReplace`/`onCancel`/`onNavigate` and
 * touches nothing else. Wiring it to the message bus is `index.ts`'s job.
 *
 * Searching without a replacement is a first-class use (spec 3.4): when
 * `canReplace` is false there is nothing to accept, so no checkbox and no
 * replace action are shown at all -- the highlights still show where each
 * match is.
 *
 * With a replacement, each highlighted match can be clicked to leave that one
 * occurrence alone (spec 2026-09-26 local features §2.2). The row checkbox
 * takes or leaves every occurrence at once, and shows indeterminate when only
 * some are chosen.
 */
export function ResultList({
  matches,
  query,
  options,
  canReplace,
  onReplace,
  onCancel,
  onNavigate,
}: ResultListProps) {
  const [chosen, setChosen] = useState<Map<string, Set<number>>>(
    () => new Map(matches.map((match) => [match.nodeId, everyIndex(match.matchCount)]))
  );
  const [shown, setShown] = useState(LIST_PAGE);

  const picked = (match: SearchMatch) => chosen.get(match.nodeId)?.size ?? 0;
  const totalMatches = matches.reduce((sum, match) => sum + match.matchCount, 0);
  const selectedCount = matches.filter((match) => picked(match) > 0).length;
  const allSelected = matches.every((match) => picked(match) === match.matchCount);

  const update = (nodeId: string, next: Set<number>) =>
    setChosen((prev) => new Map(prev).set(nodeId, next));

  const toggleRow = (match: SearchMatch) => (event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    update(match.nodeId, target.checked ? everyIndex(match.matchCount) : new Set());
  };

  const toggleOccurrence = (match: SearchMatch, index: number) => () => {
    const next = new Set(chosen.get(match.nodeId));
    if (next.has(index)) next.delete(index);
    else next.add(index);
    update(match.nodeId, next);
  };

  const toggleAll = (event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    setChosen(
      new Map(
        matches.map((match) => [
          match.nodeId,
          target.checked ? everyIndex(match.matchCount) : new Set<number>(),
        ])
      )
    );
  };

  const handleReplace = () => {
    const targets: ReplaceTarget[] = [];
    for (const match of matches) {
      const set = chosen.get(match.nodeId);
      if (!set || set.size === 0) continue;
      if (set.size === match.matchCount) {
        targets.push({ nodeId: match.nodeId, layerName: match.layerName });
      } else {
        targets.push({
          nodeId: match.nodeId,
          layerName: match.layerName,
          occurrences: Array.from(set).sort((a, b) => a - b),
          expected: match.characters,
        });
      }
    }
    onReplace(targets);
  };

  /** The row's text with each match marked; clickable when replacing. */
  const highlighted = (match: SearchMatch) => {
    const ranges = findMatches(match.characters, query, options);
    const set = chosen.get(match.nodeId);
    const parts: Array<string | JSX.Element> = [];
    let cursor = 0;
    ranges.forEach((range, index) => {
      parts.push(match.characters.slice(cursor, range.start));
      const on = !canReplace || (set?.has(index) ?? false);
      parts.push(
        <mark
          class={on ? 'match' : 'match skipped'}
          data-occurrence={String(index)}
          title={canReplace ? (on ? 'Click to leave this one' : 'Click to replace this one') : undefined}
          onClick={canReplace ? toggleOccurrence(match, index) : undefined}
        >
          {match.characters.slice(range.start, range.end)}
        </mark>
      );
      cursor = range.end;
    });
    parts.push(match.characters.slice(cursor));
    return parts;
  };

  return (
    <div class="section">
      <div class="section-title">Search results</div>
      <div class="results-summary">
        {totalMatches} {totalMatches === 1 ? 'match' : 'matches'} in {matches.length}{' '}
        {matches.length === 1 ? 'layer' : 'layers'}
      </div>

      {canReplace && matches.length > 1 && (
        <label class="review-select-all">
          <input
            type="checkbox"
            data-select-all=""
            checked={allSelected}
            indeterminate={!allSelected && selectedCount > 0}
            onClick={toggleAll}
          />
          Select all
        </label>
      )}

      {matches.slice(0, shown).map((match) => (
        <div class="results-row" data-match-row="" key={match.nodeId}>
          {canReplace && (
            <input
              type="checkbox"
              data-match=""
              checked={picked(match) > 0}
              indeterminate={picked(match) > 0 && picked(match) < match.matchCount}
              onClick={toggleRow(match)}
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
            <div class="results-row-text">{highlighted(match)}</div>
          </div>
        </div>
      ))}
      <ShowMore hidden={matches.length - shown} onClick={() => setShown((n) => n + LIST_PAGE)} />

      {canReplace && (
        <button
          class="button primary action"
          data-action="replace"
          disabled={selectedCount === 0}
          onClick={handleReplace}
        >
          Replace {selectedCount} {selectedCount === 1 ? 'layer' : 'layers'}
        </button>
      )}
      {/* `action` carries the spacing that sets the actions off from the last
          row -- on Close too, which is the only action in the search-only
          flow. */}
      <button class="button secondary action" data-action="cancel" onClick={() => onCancel()}>
        Close
      </button>
    </div>
  );
}
