import { describe, it, expect } from 'vitest';
import {
  collectTextLayers,
  isWithin,
  resolveRoots,
  type ParentedNode,
  type TraversableNode,
} from './traverse';
import type { TaskControl } from './chunked';

const text = (id: string, name: string, characters: string): TraversableNode =>
  ({ type: 'TEXT', id, name, characters });

/**
 * A container whose `findAllWithCriteria` behaves like Figma's: every
 * descendant of the requested type, depth first, excluding the node itself.
 */
interface FakeNode extends TraversableNode {
  children?: FakeNode[];
}

function descendants(node: FakeNode, into: FakeNode[]): FakeNode[] {
  for (const child of node.children ?? []) {
    into.push(child);
    descendants(child, into);
  }
  return into;
}

const frame = (id: string, children: FakeNode[]): FakeNode => {
  const node: FakeNode = {
    type: 'FRAME',
    id,
    name: `Frame ${id}`,
    children,
    findAllWithCriteria: ({ types }) =>
      descendants(node, []).filter((n) => types.includes(n.type as 'TEXT')),
  };
  return node;
};

/** Runs without yielding or stopping, and records nothing. */
const free: TaskControl = {
  onProgress: () => {},
  isStopped: () => false,
  yieldToHost: async () => {},
  now: () => 0,
};

const collect = (roots: TraversableNode[], control: TaskControl = free) =>
  collectTextLayers(roots, control);

describe('collectTextLayers', () => {
  it('returns an empty list for no roots', async () => {
    expect(await collect([])).toEqual([]);
  });

  it('collects a text node given directly as a root', async () => {
    expect(await collect([text('1:1', 'Title', 'Hello')])).toEqual([
      { id: '1:1', name: 'Title', characters: 'Hello' },
    ]);
  });

  it('descends into children', async () => {
    const tree = frame('1:0', [
      text('1:1', 'A', 'one'),
      frame('1:2', [text('1:3', 'B', 'two')]),
    ]);
    expect(await collect([tree])).toEqual([
      { id: '1:1', name: 'A', characters: 'one' },
      { id: '1:3', name: 'B', characters: 'two' },
    ]);
  });

  it('ignores non-text leaves', async () => {
    const tree = frame('1:0', [
      { type: 'RECTANGLE', id: '1:1', name: 'Box' },
      text('1:2', 'A', 'kept'),
    ]);
    expect(await collect([tree])).toEqual([{ id: '1:2', name: 'A', characters: 'kept' }]);
  });

  it('keeps empty text layers, which are real and editable', async () => {
    expect(await collect([text('1:1', 'Empty', '')])).toEqual([
      { id: '1:1', name: 'Empty', characters: '' },
    ]);
  });

  it('preserves document order across several roots', async () => {
    const result = await collect([
      text('1:1', 'A', 'one'),
      frame('1:2', [text('1:3', 'B', 'two')]),
      text('1:4', 'C', 'three'),
    ]);
    expect(result !== 'stopped' && result.map((r) => r.id)).toEqual(['1:1', '1:3', '1:4']);
  });

  it('skips a layer deleted between being found and being read', async () => {
    const gone: TraversableNode = { type: 'TEXT', id: '1:2', name: 'Gone', characters: 'x', removed: true };
    const tree = frame('1:0', [text('1:1', 'A', 'kept'), gone as FakeNode]);
    expect(await collect([tree])).toEqual([{ id: '1:1', name: 'A', characters: 'kept' }]);
  });

  it('returns stopped, not a partial list, when stopped mid-walk', async () => {
    let clock = 0;
    let yields = 0;
    const control: TaskControl = {
      onProgress: () => {},
      isStopped: () => yields > 0,
      yieldToHost: async () => {
        yields++;
      },
      // Every read costs a whole slice, so the first yield comes after one layer.
      now: () => (clock += 100),
    };
    const tree = frame('1:0', [text('1:1', 'A', 'a'), text('1:2', 'B', 'b'), text('1:3', 'C', 'c')]);
    expect(await collect([tree], control)).toBe('stopped');
  });

  it('reports how many layers it has read out of how many it found', async () => {
    const progress: Array<[number, number]> = [];
    const control: TaskControl = { ...free, onProgress: (done, total) => progress.push([done, total]) };
    await collect([frame('1:0', [text('1:1', 'A', 'a'), text('1:2', 'B', 'b')])], control);
    expect(progress[progress.length - 1]).toEqual([2, 2]);
  });
});

describe('resolveRoots', () => {
  const sel = ['s1', 's2'];
  const page = ['p1', 'p2', 'p3'];

  it('uses the selection when scope is selection and something is selected', () => {
    expect(resolveRoots('selection', sel, page)).toBe(sel);
  });

  it('falls back to the page when scope is selection but nothing is selected', () => {
    expect(resolveRoots('selection', [], page)).toBe(page);
  });

  it('uses the page when scope is page, even with a selection present', () => {
    expect(resolveRoots('page', sel, page)).toBe(page);
  });

  it('returns the page array itself when both are empty', () => {
    const empty: string[] = [];
    expect(resolveRoots('selection', [], empty)).toBe(empty);
  });
});

describe('isWithin', () => {
  // A file with two pages: page A holds frame > text, page B holds a text.
  const document: ParentedNode = { parent: null };
  const pageA: ParentedNode = { parent: document };
  const pageB: ParentedNode = { parent: document };
  const frame: ParentedNode = { parent: pageA };
  const nested: ParentedNode = { parent: frame };
  const elsewhere: ParentedNode = { parent: pageB };

  it('finds a page several levels up', () => {
    expect(isWithin(nested, pageA)).toBe(true);
  });

  it('finds a direct parent', () => {
    expect(isWithin(frame, pageA)).toBe(true);
  });

  it('counts the node itself', () => {
    expect(isWithin(pageA, pageA)).toBe(true);
  });

  it('rejects a node on another page', () => {
    expect(isWithin(elsewhere, pageA)).toBe(false);
  });

  it('rejects a node whose chain ends without meeting the ancestor', () => {
    const detached: ParentedNode = { parent: null };
    expect(isWithin(detached, pageA)).toBe(false);
  });
});
