/**
 * Long lists render in pages. Rendering every row of a 20,000-row result list
 * took seconds (docs/status.md, Stage C0), so each list shows `LIST_PAGE` rows
 * and a button for the next page. Selection and counts are kept in component
 * state over the whole list, never read from the DOM, so rows not yet rendered
 * are still counted and still acted on.
 */
export const LIST_PAGE = 200;

export interface ShowMoreProps {
  hidden: number;
  onClick(): void;
}

export function ShowMore({ hidden, onClick }: ShowMoreProps) {
  if (hidden <= 0) return null;
  const next = Math.min(hidden, LIST_PAGE);
  return (
    <button type="button" class="list-more" data-show-more="" onClick={onClick}>
      Show {next.toLocaleString('en-US')} more ({hidden.toLocaleString('en-US')} not shown)
    </button>
  );
}
