import { describe, expect, it } from 'vitest';
import { assertUniqueIds } from './rows';
import { FormatError } from './csv';

const row = (id: string) => ({ id, name: 'Layer', characters: 'Text' });

describe('assertUniqueIds', () => {
  it('accepts rows whose ids are all different', () => {
    expect(() => assertUniqueIds([row('1:1'), row('1:2')])).not.toThrow();
  });

  it('accepts an empty file', () => {
    expect(() => assertUniqueIds([])).not.toThrow();
  });

  it('rejects a repeated id as a format error, naming it once', () => {
    const rows = [row('1:1'), row('1:2'), row('1:1'), row('1:1')];
    expect(() => assertUniqueIds(rows)).toThrow(FormatError);
    expect(() => assertUniqueIds(rows)).toThrow(
      'Each layer may appear only once, but these ids repeat: 1:1.'
    );
  });

  it('names every repeated id in first-repeat order', () => {
    const rows = [row('2:2'), row('1:1'), row('1:1'), row('2:2')];
    expect(() => assertUniqueIds(rows)).toThrow('these ids repeat: 1:1, 2:2.');
  });

  it('names five ids and counts the rest', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7'];
    const rows = [...ids, ...ids].map(row);
    expect(() => assertUniqueIds(rows)).toThrow(
      'these ids repeat: 1, 2, 3, 4, 5 and 2 more.'
    );
  });

  it('compares ids exactly, so ids differing only in case are distinct', () => {
    expect(() => assertUniqueIds([row('a'), row('A')])).not.toThrow();
  });
});
