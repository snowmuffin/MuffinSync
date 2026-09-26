import { describe, it, expect } from 'vitest';
import { toJSON, fromJSON } from './json';
import { FormatError } from './csv';
import type { TextLayerData } from '../../shared/types';

const rows: TextLayerData[] = [
  { id: '1:1', name: 'Title', characters: '  spaced  ' },
  { id: '1:2', name: 'Body', characters: 'line1\nline2' },
];

describe('JSON round-trip', () => {
  it('returns exactly what went in', () => {
    expect(fromJSON(toJSON(rows))).toEqual(rows);
  });

  it('formats readably for hand editing', () => {
    expect(toJSON(rows)).toContain('\n  {');
  });
});

describe('fromJSON', () => {
  it('rejects malformed JSON', () => {
    expect(() => fromJSON('{not json')).toThrow(FormatError);
  });

  it('rejects a top-level object', () => {
    expect(() => fromJSON('{"id":"1"}')).toThrow(FormatError);
  });

  it('rejects entries missing required fields', () => {
    expect(() => fromJSON('[{"id":"1:1","name":"A"}]')).toThrow(FormatError);
  });

  it('coerces nothing — a numeric id is a malformed entry', () => {
    expect(() => fromJSON('[{"id":1,"name":"A","characters":"x"}]')).toThrow(
      FormatError
    );
  });
});

describe('JSON context columns', () => {
  const rows = [{ id: '1:1', name: 'A', characters: 'xy', path: 'Home / A', frame: 'Home' }];

  it('adds path and length when asked, and never the frame', () => {
    expect(JSON.parse(toJSON(rows, true))).toEqual([
      { id: '1:1', name: 'A', characters: 'xy', path: 'Home / A', length: 2 },
    ]);
  });

  it('reads path back and drops keys import does not use', () => {
    expect(fromJSON('[{"id":"1","name":"A","characters":"x","path":"P","length":1,"note":"n"}]')).toEqual([
      { id: '1', name: 'A', characters: 'x', path: 'P' },
    ]);
  });
});
