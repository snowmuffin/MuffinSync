import { describe, expect, it } from 'vitest';
import { parseTable } from './table';
import { FormatError } from './csv';

describe('parseTable', () => {
  it('reads CSV columns by their header names', () => {
    expect(parseTable('Name,Plan\nAna,Pro\n"Bo, Jr",Free\n', 'data.csv')).toEqual({
      headers: ['Name', 'Plan'],
      rows: [
        { Name: 'Ana', Plan: 'Pro' },
        { Name: 'Bo, Jr', Plan: 'Free' },
      ],
    });
  });

  it('ignores a byte-order mark and blank lines', () => {
    expect(parseTable('﻿a\nx\n\n', 'd.csv')).toEqual({ headers: ['a'], rows: [{ a: 'x' }] });
  });

  it('fills a short CSV row with empty cells', () => {
    expect(parseTable('a,b\nx\n', 'd.csv').rows).toEqual([{ a: 'x', b: '' }]);
  });

  it('reads a JSON array of objects, collecting every key as a column', () => {
    expect(parseTable('[{"id":"1:1","ko":"안녕"},{"id":"1:2","ja":"やあ","n":3}]', 'd.json')).toEqual({
      headers: ['id', 'ko', 'ja', 'n'],
      rows: [
        { id: '1:1', ko: '안녕' },
        { id: '1:2', ja: 'やあ', n: '3' },
      ],
    });
  });

  it('rejects nested JSON values, naming the column', () => {
    expect(() => parseTable('[{"a":{"b":1}}]', 'd.json')).toThrow('Column "a" holds a nested value');
  });

  it('rejects JSON that is not an array of objects', () => {
    expect(() => parseTable('{"a":1}', 'd.json')).toThrow(FormatError);
    expect(() => parseTable('[1]', 'd.json')).toThrow(FormatError);
  });

  it('rejects an empty CSV and other file types', () => {
    expect(() => parseTable('', 'd.csv')).toThrow('The file is empty.');
    expect(() => parseTable('a', 'd.txt')).toThrow('Choose a CSV or JSON file.');
  });
});
