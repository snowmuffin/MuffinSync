import { describe, expect, it } from 'vitest';
import { buildPathIndex, matchPath, resolveRows } from './pathmatch';

const layer = (id: string, path: string) => ({ id, name: path.split(' / ').pop() ?? '', characters: '', path });

describe('buildPathIndex and matchPath', () => {
  const index = buildPathIndex([
    layer('9:1', 'Home / Title'),
    layer('9:2', 'Home / Text'),
    layer('9:3', 'Home / Text'),
    { id: '9:4', name: 'no path', characters: '' },
  ]);

  it('finds a path shared by exactly one layer', () => {
    expect(matchPath('Home / Title', index)).toEqual({ kind: 'unique', id: '9:1' });
  });

  it('reports how many layers share an ambiguous path', () => {
    expect(matchPath('Home / Text', index)).toEqual({ kind: 'ambiguous', count: 2 });
  });

  it('finds nothing for an unknown path', () => {
    expect(matchPath('Away / Title', index)).toEqual({ kind: 'none' });
  });
});

describe('resolveRows', () => {
  const page = buildPathIndex([layer('9:1', 'Home / Title'), layer('9:5', 'Home / Body')]);
  const elsewhere = buildPathIndex([layer('8:1', 'Pricing / Title')]);

  it('only looks up rows whose id missed', () => {
    const rows = [
      { ...layer('1:1', 'Home / Title'), characters: 'x' },
      { ...layer('1:2', 'Home / Body'), characters: 'y' },
    ];
    const result = resolveRows(rows, new Set(['1:2']), [page]);
    expect(result.has('1:1')).toBe(false);
    expect(result.get('1:2')).toEqual({ kind: 'unique', id: '9:5' });
  });

  it('tries the next index only when the first finds nothing', () => {
    const rows = [layer('1:1', 'Pricing / Title')];
    expect(resolveRows(rows, new Set(['1:1']), [page, elsewhere]).get('1:1')).toEqual({ kind: 'unique', id: '8:1' });
  });

  it('never lets two rows claim one layer', () => {
    const rows = [layer('1:1', 'Home / Title'), layer('1:2', 'Home / Title')];
    const result = resolveRows(rows, new Set(['1:1', '1:2']), [page]);
    expect(result.get('1:1')).toEqual({ kind: 'unique', id: '9:1' });
    expect(result.get('1:2')).toEqual({ kind: 'ambiguous', count: 2 });
  });

  it('treats a layer a row names by id as already claimed', () => {
    const rows = [layer('9:1', 'Home / Title'), layer('1:2', 'Home / Title')];
    expect(resolveRows(rows, new Set(['1:2']), [page]).get('1:2')).toEqual({ kind: 'ambiguous', count: 2 });
  });

  it('skips rows without a path', () => {
    const rows = [{ id: '1:1', name: 'A', characters: '' }];
    expect(resolveRows(rows, new Set(['1:1']), [page]).size).toBe(0);
  });
});
