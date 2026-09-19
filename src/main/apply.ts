import type { TextLayerData } from '../shared/types';

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
 */
export async function applyTextChanges(
  rows: TextLayerData[],
  deps: ApplyDeps
): Promise<ApplyResult> {
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  const fail = (message: string) => {
    failed++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
  };

  for (const row of rows) {
    try {
      const node = await deps.getNode(row.id);
      if (!node) {
        fail(`No layer found with id ${row.id} (${row.name}).`);
        continue;
      }
      if (node.type !== 'TEXT') {
        fail(`Layer ${row.name} (${row.id}) is not a text layer.`);
        continue;
      }

      // Every font the layer uses must be loaded before its text is replaced.
      await deps.loadFonts(node);
      node.characters = row.characters;
      updated++;
    } catch (error) {
      fail(
        `Failed to update ${row.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { updated, failed, errors };
}
