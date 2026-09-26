import type { TextLayerData } from '../../shared/types';
import { FormatError } from './csv';

/** How many repeated ids the error names before summarising the rest. */
const NAMED = 5;

/**
 * Reject a file that names the same layer twice.
 *
 * Changes apply by layer id, so two rows for one id would become two review
 * entries sharing one node: they could not be accepted independently, and
 * whichever was applied last would silently win. There is no right row to
 * keep, so the file is refused and the ids named, the same treatment as a
 * missing column.
 */
export function assertUniqueIds(rows: readonly TextLayerData[]): void {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) repeated.add(row.id);
    seen.add(row.id);
  }
  if (repeated.size === 0) return;

  const ids = Array.from(repeated);
  const named = ids.slice(0, NAMED).join(', ');
  const rest = ids.length > NAMED ? ` and ${ids.length - NAMED} more` : '';
  throw new FormatError(
    `Each layer may appear only once, but these ids repeat: ${named}${rest}.`
  );
}
