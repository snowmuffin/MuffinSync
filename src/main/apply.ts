import type { ProposedChange } from '../shared/types';

/** The part of a Figma node this module writes to. */
export interface ApplicableNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  characters: string;
}

export interface ApplyDeps {
  getNode(id: string): Promise<ApplicableNode | null>;
  loadFonts(node: ApplicableNode): Promise<void>;
}

export interface ApplyResult {
  updated: number;
  failed: number;
  errors: string[];
}

/** How many failures are worth showing before the list stops being useful. */
const MAX_REPORTED_ERRORS = 5;

/**
 * One bad layer must not cost the user the rest of the batch, so every failure
 * is caught per row and collected rather than thrown.
 *
 * Only accepted changes are written. Spec 3.2 puts that filter on the apply
 * path; keeping it here rather than trusting the sender means an unaccepted
 * row that somehow crosses the boundary still is not applied.
 */
export async function applyTextChanges(
  changes: ProposedChange[],
  deps: ApplyDeps
): Promise<ApplyResult> {
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  const fail = (message: string) => {
    failed++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
  };

  for (const change of changes) {
    if (!change.accepted) continue;

    try {
      const node = await deps.getNode(change.nodeId);
      if (!node) {
        fail(`No layer found with id ${change.nodeId} (${change.layerName}).`);
        continue;
      }
      if (node.type !== 'TEXT') {
        fail(`Layer ${change.layerName} (${change.nodeId}) is not a text layer.`);
        continue;
      }
      // The canvas stays live while the review panel is open. If the layer no
      // longer holds the text this change was diffed against, the user has
      // edited it since, and `after` would silently discard that edit. Beyond
      // the two re-checks in spec 3.2, by ruling.
      if (node.characters !== change.before) {
        fail(
          `Layer ${change.layerName} (${change.nodeId}) changed since review; ` +
            `it was not updated.`
        );
        continue;
      }

      // Every font the layer uses must be loaded before its text is replaced.
      await deps.loadFonts(node);
      node.characters = change.after;
      updated++;
    } catch (error) {
      fail(
        `Failed to update ${change.layerName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { updated, failed, errors };
}
