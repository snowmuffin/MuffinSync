import { describe, it, expect } from 'vitest';
import { toCSV, fromCSV, FormatError } from './csv';
import type { TextLayerData } from '../../shared/types';

const row = (characters: string): TextLayerData => ({
  id: '1:1',
  name: 'Layer',
  characters,
});

describe('CSV round-trip', () => {
  // Each of these is content a Figma text layer can legitimately hold.
  const cases: [string, string][] = [
    ['leading and trailing spaces', '  hello  '],
    ['tab indent', '\tindented'],
    ['carriage return', 'a\rb'],
    ['multi-line', 'line1\nline2'],
    ['CRLF inside a field', 'x\r\ny'],
    ['embedded comma and quote', 'a, "b"'],
    ['only quote characters', '"""'],
    ['empty string', ''],
    ['single space', ' '],
    ['comma only', ','],
    ['unicode and emoji', '한글 🧁 ok'],
    ['trailing newline', 'trail\n'],
  ];

  for (const [label, characters] of cases) {
    it(`preserves ${label}`, () => {
      expect(fromCSV(toCSV([row(characters)]))).toEqual([row(characters)]);
    });
  }

  it('preserves several rows at once', () => {
    const rows: TextLayerData[] = [
      { id: '1', name: 'a', characters: 'x' },
      { id: '2', name: 'b', characters: 'y\nz' },
      { id: '3', name: 'c', characters: '' },
    ];
    expect(fromCSV(toCSV(rows))).toEqual(rows);
  });
});

describe('fromCSV', () => {
  it('trims unquoted fields so hand-edited spacing is tolerated', () => {
    const text = 'id,name,characters\n1:1, Layer , hello ';
    expect(fromCSV(text)).toEqual([
      { id: '1:1', name: 'Layer', characters: 'hello' },
    ]);
  });

  it('ignores blank lines', () => {
    const text = 'id,name,characters\n1:1,A,x\n\n';
    expect(fromCSV(text)).toEqual([
      { id: '1:1', name: 'A', characters: 'x' },
    ]);
  });

  it('rejects a file missing required columns', () => {
    expect(() => fromCSV('id,name\n1:1,A')).toThrow(FormatError);
  });

  it('rejects an empty file', () => {
    expect(() => fromCSV('')).toThrow(FormatError);
  });
});

describe('context columns', () => {
  const rows = [{ id: '1:1', name: 'Total', characters: 'Total 👋', path: 'Checkout / Summary / Total' }];

  it('adds path and length to CSV when asked', () => {
    expect(toCSV(rows, true)).toBe('id,name,characters,path,length\n1:1,Total,Total 👋,Checkout / Summary / Total,7');
  });

  it('leaves the round-trip columns alone by default', () => {
    expect(toCSV(rows)).toBe('id,name,characters\n1:1,Total,Total 👋');
  });

  it('reads path back and ignores length', () => {
    expect(fromCSV('id,name,characters,path,length\n1:1,A,x,Home / A,1')).toEqual([
      { id: '1:1', name: 'A', characters: 'x', path: 'Home / A' },
    ]);
  });

  it('leaves path out when the column is empty or missing', () => {
    expect(fromCSV('id,name,characters,path\n1:1,A,x,')).toEqual([{ id: '1:1', name: 'A', characters: 'x' }]);
  });
});
