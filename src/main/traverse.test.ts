import { describe, it, expect } from 'vitest';
import { collectTextLayers, resolveRoots, type TraversableNode } from './traverse';

const text = (id: string, name: string, characters: string): TraversableNode =>
  ({ type: 'TEXT', id, name, characters });

const frame = (
  id: string,
  children: TraversableNode[]
): TraversableNode => ({ type: 'FRAME', id, name: `Frame ${id}`, children });

describe('collectTextLayers', () => {
  it('returns an empty list for no roots', () => {
    expect(collectTextLayers([])).toEqual([]);
  });

  it('collects a text node given directly as a root', () => {
    expect(collectTextLayers([text('1:1', 'Title', 'Hello')])).toEqual([
      { id: '1:1', name: 'Title', characters: 'Hello' },
    ]);
  });

  it('descends into children', () => {
    const tree = frame('1:0', [
      text('1:1', 'A', 'one'),
      frame('1:2', [text('1:3', 'B', 'two')]),
    ]);
    expect(collectTextLayers([tree])).toEqual([
      { id: '1:1', name: 'A', characters: 'one' },
      { id: '1:3', name: 'B', characters: 'two' },
    ]);
  });

  it('ignores non-text leaves', () => {
    const tree = frame('1:0', [
      { type: 'RECTANGLE', id: '1:1', name: 'Box' },
      text('1:2', 'A', 'kept'),
    ]);
    expect(collectTextLayers([tree])).toEqual([
      { id: '1:2', name: 'A', characters: 'kept' },
    ]);
  });

  it('keeps empty text layers, which are real and editable', () => {
    expect(collectTextLayers([text('1:1', 'Empty', '')])).toEqual([
      { id: '1:1', name: 'Empty', characters: '' },
    ]);
  });

  it('preserves document order across several roots', () => {
    const result = collectTextLayers([
      text('1:1', 'A', 'one'),
      frame('1:2', [text('1:3', 'B', 'two')]),
      text('1:4', 'C', 'three'),
    ]);
    expect(result.map((r) => r.id)).toEqual(['1:1', '1:3', '1:4']);
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

  it('returns the page unchanged when both are empty', () => {
    expect(resolveRoots('selection', [], [])).toEqual([]);
  });
});
