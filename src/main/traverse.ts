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
  /** False when the layer itself is hidden. Pages have no such field. */
  readonly visible?: boolean;
  readonly parent?: VisibilityNode | null;
}

/**
 * The name of the node's top-level frame: the ancestor that sits directly on
 * the page. `''` for a layer that is itself directly on the page. Cached by
 * parent id across one walk, since siblings share the answer.
 */
export function topFrameName(node: VisibilityNode, cache: Map<string, string>): string {
  const parent = node.parent;
  if (!parent || parent.type === 'PAGE') return '';
  const known = cache.get(parent.id);
  if (known !== undefined) return known;
  let top = parent;
  while (top.parent && top.parent.type !== 'PAGE') top = top.parent;
  const name = top.name ?? '';
  cache.set(parent.id, name);
  return name;
}

/**
 * A container's path: its ancestors' names from the top-level frame down,
 * itself included, joined with ` / `. Pages are not part of a path. Cached by
 * node id across one walk.
 */
function containerPath(node: VisibilityNode | null | undefined, cache: Map<string, string>): string {
  if (!node || node.type === 'PAGE') return '';
  const known = cache.get(node.id);
  if (known !== undefined) return known;
  const above = containerPath(node.parent, cache);
  const path = above ? `${above} / ${node.name ?? ''}` : (node.name ?? '');
  cache.set(node.id, path);
  return path;
}

/** A layer's path: its containers' path, then its own name. */
export function layerPath(node: VisibilityNode, cache: Map<string, string>): string {
  const above = containerPath(node.parent, cache);
  return above ? `${above} / ${node.name ?? ''}` : (node.name ?? '');
}

/** What `isShown` walks: a node's own visibility and its ancestors'. */
export interface VisibilityNode {
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly visible?: boolean;
  readonly parent?: VisibilityNode | null;
}

/**
 * Whether a layer is actually visible: neither it nor any ancestor is hidden.
 * `cache` is shared across one walk, keyed by node id, so siblings pay for
 * their common ancestors once.
 */
export function isShown(node: VisibilityNode, cache: Map<string, boolean>): boolean {
  const chain: VisibilityNode[] = [];
  let current: VisibilityNode | null | undefined = node;
  let shown = true;
  while (current) {
    const known = cache.get(current.id);
    if (known !== undefined) {
      shown = known;
      break;
    }
    chain.push(current);
    if (current.visible === false) {
      shown = false;
      break;
    }
    current = current.parent;
  }
  for (const visited of chain) cache.set(visited.id, shown);
  return shown;
}

export interface CollectOptions {
  /** Include layers that are hidden or inside something hidden. Default true. */
  includeHidden?: boolean;
  /** Record each layer's top-level frame name, for document exports. */
  withFrames?: boolean;
  /** Record each layer's path, for context columns and path matching. */
  withPaths?: boolean;
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
  control: TaskControl,
  options: CollectOptions = {}
): Promise<TextLayerData[] | 'stopped'> {
  const includeHidden = options.includeHidden ?? true;
  const visibility = new Map<string, boolean>();
  const frames = new Map<string, string>();
  const paths = new Map<string, string>();
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
      if (!includeHidden && !isShown(node, visibility)) return;
      const row: TextLayerData = { id: node.id, name: node.name, characters: node.characters ?? '' };
      if (options.withFrames) row.frame = topFrameName(node, frames);
      if (options.withPaths) row.path = layerPath(node, paths);
      found.push(row);
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
  scope: 'selection' | 'page' | 'document',
  selection: ReadonlyArray<T>,
  pageChildren: ReadonlyArray<T>,
  pages: ReadonlyArray<T>
): ReadonlyArray<T> {
  if (scope === 'document') return pages;
  return scope === 'selection' && selection.length > 0 ? selection : pageChildren;
}

/** The one field `isWithin` walks. Figma's BaseNode satisfies it structurally. */
export interface ParentedNode {
  readonly parent: ParentedNode | null;
  readonly type?: string;
}

/** The page a node sits on, or null for a node outside any page. */
export function pageOf<T extends ParentedNode>(node: T): T | null {
  for (let current: ParentedNode | null = node; current; current = current.parent) {
    if (current.type === 'PAGE') return current as T;
  }
  return null;
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
