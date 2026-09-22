import { describe, it, expect } from 'vitest';
import { buildChangeSet } from './plan';
import type { ApplicableNode } from './apply';

const node = (
  id: string,
  name: string,
  characters: string,
  type = 'TEXT'
): ApplicableNode => ({ id, name, type, characters });

/** A document as a lookup table, so no Figma runtime is needed. */
const documentOf = (nodes: ApplicableNode[]) => ({
  getNode: async (id: string) => nodes.find((n) => n.id === id) ?? null,
});

describe('buildChangeSet', () => {
  it('proposes a change when the text differs', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Title', characters: 'new' }],
      documentOf([node('1:1', 'Title', 'old')]),
      1700000000000
    );

    expect(set.changes).toEqual([
      {
        nodeId: '1:1',
        layerName: 'Title',
        before: 'old',
        after: 'new',
        source: 'import',
        accepted: true,
      },
    ]);
    expect(set.blocked).toEqual([]);
    expect(set.unchangedCount).toBe(0);
    expect(set.createdAt).toBe(1700000000000);
  });

  it('counts rows that match without listing them', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Title', characters: 'same' }],
      documentOf([node('1:1', 'Title', 'same')])
    );

    expect(set.changes).toEqual([]);
    expect(set.unchangedCount).toBe(1);
  });

  it('treats a whitespace-only difference as a real change', async () => {
    // The CSV round-trip fix exists so this difference survives a file. It must
    // not be swallowed here.
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Title', characters: '  spaced  ' }],
      documentOf([node('1:1', 'Title', 'spaced')])
    );

    expect(set.changes).toHaveLength(1);
    expect(set.changes[0].after).toBe('  spaced  ');
  });

  it('blocks a row whose layer is gone, naming it from the file', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Old CTA', characters: 'x' }],
      documentOf([])
    );

    expect(set.changes).toEqual([]);
    expect(set.blocked).toEqual([
      { nodeId: '1:1', layerName: 'Old CTA', reason: 'missing' },
    ]);
  });

  it('blocks a row whose node is no longer text, naming it from the document', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'stale name', characters: 'x' }],
      documentOf([node('1:1', 'Now a rectangle', '', 'RECTANGLE')])
    );

    expect(set.blocked).toEqual([
      { nodeId: '1:1', layerName: 'Now a rectangle', reason: 'not-text' },
    ]);
  });

  it('uses the document layer name, not the one in the file', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'renamed in the file', characters: 'new' }],
      documentOf([node('1:1', 'Actual name', 'old')])
    );

    expect(set.changes[0].layerName).toBe('Actual name');
  });

  it('keeps every category in one pass', async () => {
    const set = await buildChangeSet(
      [
        { id: '1:1', name: 'A', characters: 'changed' },
        { id: '1:2', name: 'B', characters: 'same' },
        { id: '1:3', name: 'C', characters: 'x' },
      ],
      documentOf([node('1:1', 'A', 'original'), node('1:2', 'B', 'same')])
    );

    expect(set.changes).toHaveLength(1);
    expect(set.unchangedCount).toBe(1);
    expect(set.blocked).toHaveLength(1);
  });

  it('returns an empty set for no rows', async () => {
    const set = await buildChangeSet([], documentOf([]));
    expect(set).toMatchObject({ changes: [], blocked: [], unchangedCount: 0 });
  });
});
