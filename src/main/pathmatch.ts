import type { TextLayerData } from '../shared/types';

/**
 * Matching import rows to layers by path when their ids no longer exist --
 * after a file is duplicated, frames are pasted, or a screen is rebuilt. Pure:
 * the router supplies which ids still resolve and the layers to index.
 * See docs/superpowers/specs/2026-09-26-copy-tools-design.md §4.
 */

/** path -> ids of the text layers at that path, in document order. */
export type PathIndex = Map<string, string[]>;

export function buildPathIndex(layers: ReadonlyArray<TextLayerData>): PathIndex {
  const index: PathIndex = new Map();
  for (const layer of layers) {
    if (!layer.path) continue;
    const ids = index.get(layer.path);
    if (ids) ids.push(layer.id);
    else index.set(layer.path, [layer.id]);
  }
  return index;
}

export type PathMatch =
  | { kind: 'unique'; id: string }
  | { kind: 'none' }
  | { kind: 'ambiguous'; count: number };

export function matchPath(path: string, index: PathIndex): PathMatch {
  const ids = index.get(path);
  if (!ids || ids.length === 0) return { kind: 'none' };
  if (ids.length > 1) return { kind: 'ambiguous', count: ids.length };
  return { kind: 'unique', id: ids[0] };
}

/**
 * Resolves the rows that need it against successive indexes -- the current
 * page, then every page -- stopping at the first index that says anything
 * other than "none". Rows whose id still works are never looked up, so this
 * cannot change a row that matches today.
 *
 * A layer is claimed once: by a row whose own id names it, or else by the
 * first row that finds it by path. A later row landing on a claimed layer is
 * ambiguous -- two rows cannot both write one layer.
 */
export function resolveRows(
  rows: ReadonlyArray<TextLayerData>,
  needsPath: ReadonlySet<string>,
  indexes: ReadonlyArray<PathIndex>
): Map<string, PathMatch> {
  const claimed = new Set(rows.filter((row) => !needsPath.has(row.id)).map((row) => row.id));
  const out = new Map<string, PathMatch>();
  for (const row of rows) {
    if (!needsPath.has(row.id) || !row.path) continue;
    let result: PathMatch = { kind: 'none' };
    for (const index of indexes) {
      result = matchPath(row.path, index);
      if (result.kind !== 'none') break;
    }
    if (result.kind === 'unique') {
      if (claimed.has(result.id)) result = { kind: 'ambiguous', count: 2 };
      else claimed.add(result.id);
    }
    out.set(row.id, result);
  }
  return out;
}
