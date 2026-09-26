import type { TextLayerData } from '../shared/types';
import { runChunked, type TaskControl } from './chunked';

/** The fields read off a text layer. Figma's TextNode satisfies it structurally. */
export interface TextNodeLike {
  readonly type: string;
  readonly id: string;
  readonly name: string;
  readonly characters?: string;
  /** True once the node has been deleted; the canvas stays live mid-walk. */
  readonly removed?: boolean;
}

/**
 * A root a walk starts from. Figma's SceneNode and PageNode satisfy it
 * structurally, and a plain object literal does too -- which is what lets this
 * be tested without a Figma runtime.
 */
export interface TraversableNode extends TextNodeLike {
  findAllWithCriteria?(criteria: { types: ['TEXT'] }): ReadonlyArray<TextNodeLike>;
}

/**
 * Every text layer under the roots, in document order: each root itself if it
 * is text, then the text layers inside it.
 *
 * Finding uses Figma's native `findAllWithCriteria`, one call per root, rather
 * than recursing over `children` in the sandbox -- every `children` access
 * crosses into Figma and allocates, once per node. Reading each layer's name
 * and text is still per-node work, so that part runs in time slices through
 * `runChunked`. Hidden layers and instance children are included, as they
 * always have been (spec 2026-09-26 §9.1).
 */
export async function collectTextLayers(
  roots: ReadonlyArray<TraversableNode>,
  control: TaskControl
): Promise<TextLayerData[] | 'stopped'> {
  const nodes: TextNodeLike[] = [];
  for (const root of roots) {
    if (root.type === 'TEXT') nodes.push(root);
    if (!root.findAllWithCriteria) continue;
    // A loop, not push(...found): spreading tens of thousands of arguments
    // can exceed the engine's argument limit.
    for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) nodes.push(node);
  }

  const found: TextLayerData[] = [];
  const outcome = await runChunked(
    nodes,
    (node) => {
      // Deleted on the canvas since it was found: there is nothing to read.
      if (node.removed) return;
      found.push({ id: node.id, name: node.name, characters: node.characters ?? '' });
    },
    control
  );
  return outcome === 'stopped' ? 'stopped' : found;
}

/**
 * Choose which roots a walk starts from. Kept separate from Figma itself so
 * the fallback rule is testable: an empty selection means the whole page.
 */
export function resolveRoots<T>(
  scope: 'selection' | 'page',
  selection: ReadonlyArray<T>,
  pageChildren: ReadonlyArray<T>
): ReadonlyArray<T> {
  return scope === 'selection' && selection.length > 0 ? selection : pageChildren;
}

/** The one field `isWithin` walks. Figma's BaseNode satisfies it structurally. */
export interface ParentedNode {
  readonly parent: ParentedNode | null;
}

/**
 * Whether `ancestor` is `node` or one of its ancestors. Navigation uses it to
 * tell a node on another page from one on the current page, by walking up to
 * the page rather than asking Figma to load every page.
 */
export function isWithin(node: ParentedNode, ancestor: ParentedNode): boolean {
  for (let current: ParentedNode | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}
