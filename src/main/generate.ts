import { runChunked, type TaskControl } from './chunked';
import { COPY_GAP, fillTags, gridPosition, type Box, type Translations } from '../shared/generate';

/**
 * Data merge and localized copies: both clone frames and write text into the
 * clones. Creating frames is additive and Figma's undo covers it, so neither
 * goes through review. A stopped run removes what it had created, so Stop
 * means "nothing changed" here as everywhere else.
 * See docs/superpowers/specs/2026-09-26-local-features-design.md §6.
 *
 * Thin Figma wrappers: the rules they apply (`fillTags`, `gridPosition`) are
 * pure and tested in src/shared/generate.test.ts.
 */

/** Writes text into a node, loading its fonts first. Injected by the router. */
export type SetText = (node: TextNode, text: string) => Promise<void>;

export interface GenerateResult {
  outcome: 'done' | 'stopped';
  count: number;
  missingTags: string[];
  untranslated: number;
}

/** Every text layer in a node, itself included, in document order. */
function textNodesOf(node: SceneNode): TextNode[] {
  const found: TextNode[] = node.type === 'TEXT' ? [node] : [];
  if ('findAllWithCriteria' in node) {
    for (const text of node.findAllWithCriteria({ types: ['TEXT'] })) found.push(text);
  }
  return found;
}

function boxOf(node: SceneNode): Box {
  return node.absoluteBoundingBox ?? { x: node.x, y: node.y, width: node.width, height: node.height };
}

/** Clones onto the current page at page coordinates, whatever the original's parent. */
function place(original: SceneNode, x: number, y: number, name: string): SceneNode {
  const copy = original.clone();
  figma.currentPage.appendChild(copy);
  copy.x = x;
  copy.y = y;
  copy.name = name;
  return copy;
}

function rollback(created: SceneNode[]): void {
  for (const node of created) if (!node.removed) node.remove();
}

export async function mergeRows(
  template: SceneNode,
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
  control: TaskControl,
  setText: SetText
): Promise<GenerateResult> {
  const box = boxOf(template);
  const created: SceneNode[] = [];
  const missing = new Set<string>();

  const outcome = await runChunked(
    rows,
    async (row, index) => {
      // Named after the row's first column: usually its most identifying one.
      const first = Object.values(row)[0];
      const { x, y } = gridPosition(index, box);
      const copy = place(template, x, y, first ? first : `${template.name} ${index + 1}`);
      created.push(copy);
      for (const node of textNodesOf(copy)) {
        const filled = fillTags(node.characters, row);
        filled.missing.forEach((tag) => missing.add(tag));
        if (filled.text !== node.characters) await setText(node, filled.text);
      }
    },
    control
  );

  if (outcome === 'stopped') rollback(created);
  return { outcome, count: created.length, missingTags: Array.from(missing), untranslated: 0 };
}

export async function localizeFrames(
  frames: ReadonlyArray<SceneNode>,
  locales: ReadonlyArray<string>,
  translations: Translations,
  control: TaskControl,
  setText: SetText
): Promise<GenerateResult> {
  const jobs = frames.flatMap((frame) => locales.map((locale, index) => ({ frame, locale, index })));
  const created: SceneNode[] = [];
  let untranslated = 0;

  const outcome = await runChunked(
    jobs,
    async ({ frame, locale, index }) => {
      const box = boxOf(frame);
      const copy = place(frame, box.x + (box.width + COPY_GAP) * (index + 1), box.y, `${frame.name} — ${locale}`);
      created.push(copy);
      // A clone keeps the original's structure, so the two depth-first lists
      // of text layers pair up by position.
      const originals = textNodesOf(frame);
      const copies = textNodesOf(copy);
      const byId = translations[locale] ?? {};
      for (let i = 0; i < Math.min(originals.length, copies.length); i++) {
        const text = byId[originals[i].id];
        if (text === undefined) untranslated++;
        else if (text !== copies[i].characters) await setText(copies[i], text);
      }
    },
    control
  );

  if (outcome === 'stopped') rollback(created);
  return { outcome, count: created.length, missingTags: [], untranslated };
}
