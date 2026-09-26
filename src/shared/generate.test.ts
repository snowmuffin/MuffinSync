import { describe, expect, it } from 'vitest';
import {
  buildTranslations,
  fillTags,
  gridPosition,
  hasTags,
  isSnippets,
  isStringRecord,
  localesOf,
} from './generate';

describe('fillTags', () => {
  it('replaces each tag with the row value, ignoring spaces inside the braces', () => {
    expect(fillTags('Hi {{Name}}, {{ Plan }} plan', { Name: 'Ana', Plan: 'Pro' })).toEqual({
      text: 'Hi Ana, Pro plan',
      missing: [],
    });
  });

  it('replaces a repeated tag everywhere', () => {
    expect(fillTags('{{a}}-{{a}}', { a: 'x' }).text).toBe('x-x');
  });

  it('leaves a tag naming no column as written, and reports it once', () => {
    expect(fillTags('{{Nmae}} and {{Nmae}}', { Name: 'Ana' })).toEqual({
      text: '{{Nmae}} and {{Nmae}}',
      missing: ['Nmae'],
    });
  });

  it('does not treat inherited object keys as columns', () => {
    expect(fillTags('{{constructor}}', {}).missing).toEqual(['constructor']);
  });

  it('fills an empty value as empty', () => {
    expect(fillTags('[{{a}}]', { a: '' }).text).toBe('[]');
  });

  it('leaves text without tags alone', () => {
    expect(fillTags('no tags {here}', {})).toEqual({ text: 'no tags {here}', missing: [] });
  });
});

describe('hasTags', () => {
  it('finds a tag, and can be asked twice', () => {
    expect(hasTags('a {{b}}')).toBe(true);
    expect(hasTags('a {{b}}')).toBe(true);
    expect(hasTags('a {b}')).toBe(false);
  });
});

describe('localesOf', () => {
  it('treats every column but the extract columns as a locale', () => {
    expect(localesOf(['id', 'name', 'characters', 'ko', 'ja', 'Frame', 'path', 'length', ''])).toEqual(['ko', 'ja']);
  });
});

describe('buildTranslations', () => {
  it('maps layer ids to text per locale, leaving out empty cells', () => {
    const rows: Array<Record<string, string>> = [
      { id: '1:1', ko: '안녕', ja: '' },
      { id: '1:2', ko: '', ja: 'こんにちは' },
      { id: '', ko: 'no id' },
    ];
    expect(buildTranslations(rows, ['ko', 'ja'])).toEqual({
      ko: { '1:1': '안녕' },
      ja: { '1:2': 'こんにちは' },
    });
  });
});

describe('gridPosition', () => {
  const box = { x: 100, y: 50, width: 200, height: 100 };

  it('starts one step to the right of the original', () => {
    expect(gridPosition(0, box, 3, 20)).toEqual({ x: 320, y: 50 });
  });

  it('wraps to a new row after perRow copies', () => {
    expect(gridPosition(3, box, 3, 20)).toEqual({ x: 320, y: 170 });
  });
});

describe('isSnippets', () => {
  it('accepts a list of id, name and text', () => {
    expect(isSnippets([{ id: 'a', name: 'Footer', text: '© 2026' }])).toBe(true);
    expect(isSnippets([])).toBe(true);
  });

  it('rejects anything else, including what storage returns when empty', () => {
    expect(isSnippets(undefined)).toBe(false);
    expect(isSnippets([{ id: 'a', name: 'x' }])).toBe(false);
    expect(isSnippets([{ id: 1, name: 'x', text: 'y' }])).toBe(false);
  });
});

describe('isStringRecord', () => {
  it('accepts an object of strings only', () => {
    expect(isStringRecord({ a: 'x' })).toBe(true);
    expect(isStringRecord({ a: 1 })).toBe(false);
    expect(isStringRecord(['x'])).toBe(false);
    expect(isStringRecord(null)).toBe(false);
  });
});
