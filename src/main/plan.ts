import type { TextLayerData, ChangeSet, ProposedChange, BlockedChange } from '../shared/types';
import type { ApplicableNode } from './apply';

export interface PlanDeps {
  getNode(id: string): Promise<ApplicableNode | null>;
}

/**
 * Compare what a file says against what the document currently holds.
 *
 * The UI cannot read the document, so it cannot know the "before" text; this
 * runs in the sandbox and hands back a complete set. `now` is injectable so
 * the result is deterministic under test.
 */
export async function buildChangeSet(
  rows: TextLayerData[],
  deps: PlanDeps,
  now: number = Date.now()
): Promise<ChangeSet> {
  const changes: ProposedChange[] = [];
  const blocked: BlockedChange[] = [];
  let unchangedCount = 0;

  for (const row of rows) {
    const node = await deps.getNode(row.id);

    if (!node) {
      // The document has no node to ask, so the file's name is all we have.
      blocked.push({ nodeId: row.id, layerName: row.name, reason: 'missing' });
      continue;
    }
    if (node.type !== 'TEXT') {
      blocked.push({ nodeId: row.id, layerName: node.name, reason: 'not-text' });
      continue;
    }
    if (node.characters === row.characters) {
      unchangedCount++;
      continue;
    }

    changes.push({
      nodeId: row.id,
      // The document is the authority on what a layer is called; a file can
      // carry a name that was edited or has gone stale.
      layerName: node.name,
      before: node.characters,
      after: row.characters,
      source: 'import',
      // Checked by default: review is for vetoing, not for re-approving every
      // line of a file the user just edited on purpose.
      accepted: true,
    });
  }

  return { changes, blocked, unchangedCount, createdAt: now };
}
