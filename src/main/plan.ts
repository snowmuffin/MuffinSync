import type {
  ChangeSet,
  ProposedChange,
  BlockedChange,
  Scope,
} from '../shared/types';
import type { ApplicableNode } from './apply';

export interface PlanDeps {
  getNode(id: string): Promise<ApplicableNode | null>;
}

/**
 * One node a producer wants to write to, and what it wants written.
 *
 * `after` receives the node's current text so a producer can derive from it --
 * find & replace does; import ignores it and returns the file's text. That is
 * the whole difference between the producers, which is why there is one
 * builder rather than one per producer. See spec section 3.
 */
export interface ChangeTarget {
  id: string;
  /** Used only when the node is gone; a missing node cannot be asked its name. */
  fallbackName: string;
  after(current: string): string;
}

/**
 * Classify every target against what the document currently holds: the node is
 * gone, it is not text, its text already matches, or it differs.
 *
 * This runs in the sandbox because the UI cannot read the document and so
 * cannot know the "before" text. `now` is injectable so `createdAt` is
 * deterministic under test. `scope` is set only by producers that walked the
 * document -- import's targets come from a file, so it has none (spec 3.1).
 */
export async function buildChangeSet(
  targets: ReadonlyArray<ChangeTarget>,
  source: ProposedChange['source'],
  deps: PlanDeps,
  now: number = Date.now(),
  scope?: Scope
): Promise<ChangeSet> {
  const changes: ProposedChange[] = [];
  const blocked: BlockedChange[] = [];
  let unchangedCount = 0;

  for (const target of targets) {
    const node = await deps.getNode(target.id);

    if (!node) {
      blocked.push({ nodeId: target.id, layerName: target.fallbackName, reason: 'missing' });
      continue;
    }
    if (node.type !== 'TEXT') {
      blocked.push({ nodeId: target.id, layerName: node.name, reason: 'not-text' });
      continue;
    }

    const after = target.after(node.characters);
    if (node.characters === after) {
      unchangedCount++;
      continue;
    }

    changes.push({
      nodeId: target.id,
      // The document is the authority on what a layer is called; a file, or a
      // search result a moment stale, can carry a name since edited.
      layerName: node.name,
      before: node.characters,
      after,
      source,
      // Checked by default: review is for vetoing, not for re-approving every
      // row the user just asked for.
      accepted: true,
    });
  }

  return scope === undefined
    ? { changes, blocked, unchangedCount, createdAt: now }
    : { changes, blocked, unchangedCount, createdAt: now, scope };
}
