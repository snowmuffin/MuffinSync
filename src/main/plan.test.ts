import { describe, expect, it } from 'vitest';
import { buildChangeSet, type ChangeTarget } from './plan';
import type { ApplicableNode } from './apply';

const node = (id: string, name: string, characters = '', type = 'TEXT'): ApplicableNode =>
  ({ id, name, characters, type }) as ApplicableNode;

const deps = (nodes: ApplicableNode[]) => ({
  getNode: async (id: string) => nodes.find((n) => n.id === id) ?? null,
});

/** The import producer: the file's text wins, whatever the node holds. */
const fromFile = (id: string, name: string, characters: string): ChangeTarget => ({
  id,
  fallbackName: name,
  after: () => characters,
});

describe('buildChangeSet', () => {
  it('proposes a change when the text differs', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Title', 'new')],
      'import',
      deps([node('1:1', 'Title', 'old')]),
      42
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
    expect(set.createdAt).toBe(42);
  });

  it('counts a row whose text already matches instead of listing it', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Title', 'same')],
      'import',
      deps([node('1:1', 'Title', 'same')])
    );
    expect(set.changes).toEqual([]);
    expect(set.unchangedCount).toBe(1);
  });

  it('blocks a target the document no longer has, naming it from fallbackName', async () => {
    const set = await buildChangeSet(
      [fromFile('9:9', 'Gone from the file', 'new')],
      'import',
      deps([])
    );
    expect(set.blocked).toEqual([
      { nodeId: '9:9', layerName: 'Gone from the file', reason: 'missing' },
    ]);
    expect(set.changes).toEqual([]);
  });

  it('blocks a node that is no longer text, naming it from the document', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Name in the file', 'new')],
      'import',
      deps([node('1:1', 'Name in the document', '', 'RECTANGLE')])
    );
    expect(set.blocked).toEqual([
      { nodeId: '1:1', layerName: 'Name in the document', reason: 'not-text' },
    ]);
  });

  it('prefers the document name over fallbackName when the node exists', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Stale name', 'new')],
      'import',
      deps([node('1:1', 'Current name', 'old')])
    );
    expect(set.changes[0].layerName).toBe('Current name');
  });

  it('passes the node current text to after, so a producer can derive from it', async () => {
    const seen: string[] = [];
    const target: ChangeTarget = {
      id: '1:1',
      fallbackName: 'unused',
      after: (current) => {
        seen.push(current);
        return current.toUpperCase();
      },
    };
    const set = await buildChangeSet([target], 'find-replace', deps([node('1:1', 'T', 'quiet')]));
    expect(seen).toEqual(['quiet']);
    expect(set.changes[0].after).toBe('QUIET');
  });

  it('stamps the source it was given', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', fallbackName: 'f', after: () => 'new' }],
      'find-replace',
      deps([node('1:1', 'T', 'old')])
    );
    expect(set.changes[0].source).toBe('find-replace');
  });

  it('records the scope when one is given, and omits it otherwise', async () => {
    const targets = [fromFile('1:1', 'T', 'new')];
    const withScope = await buildChangeSet(targets, 'find-replace', deps([node('1:1', 'T', 'old')]), 1, 'page');
    expect(withScope.scope).toBe('page');

    const without = await buildChangeSet(targets, 'import', deps([node('1:1', 'T', 'old')]), 1);
    expect(without.scope).toBeUndefined();
  });

  it('keeps going after a blocked target', async () => {
    const set = await buildChangeSet(
      [fromFile('9:9', 'Gone', 'x'), fromFile('1:1', 'Here', 'new')],
      'import',
      deps([node('1:1', 'Here', 'old')])
    );
    expect(set.blocked).toHaveLength(1);
    expect(set.changes).toHaveLength(1);
  });

  it('treats a whitespace-only difference as a real change', async () => {
    // The comparison is strict equality on purpose. Phase 0 fixed CSV
    // round-tripping to preserve leading and trailing whitespace; if anything
    // normalised here, a user who edited only whitespace would have that edit
    // counted as unchanged and silently never written.
    const set = await buildChangeSet(
      [fromFile('1:1', 'Title', '  spaced  ')],
      'import',
      deps([node('1:1', 'Title', 'spaced')])
    );
    expect(set.changes).toHaveLength(1);
    expect(set.changes[0].after).toBe('  spaced  ');
    expect(set.unchangedCount).toBe(0);
  });

  it('returns an empty set for no targets', async () => {
    const set = await buildChangeSet([], 'import', deps([]), 7);
    expect(set).toEqual({
      changes: [],
      blocked: [],
      unchangedCount: 0,
      createdAt: 7,
    });
  });

  it('fills all three buckets from one pass', async () => {
    const set = await buildChangeSet(
      [
        fromFile('1:1', 'Changed', 'new'),
        fromFile('1:2', 'Same', 'same'),
        fromFile('9:9', 'Gone', 'x'),
      ],
      'import',
      deps([node('1:1', 'Changed', 'old'), node('1:2', 'Same', 'same')])
    );
    expect(set.changes.map((c) => c.nodeId)).toEqual(['1:1']);
    expect(set.unchangedCount).toBe(1);
    expect(set.blocked.map((b) => b.nodeId)).toEqual(['9:9']);
  });
});
