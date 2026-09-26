import { describe, expect, it } from 'vitest';
import { describeMerge, generatedMessage, planLocalize } from './generate';

describe('describeMerge', () => {
  it('counts rows and names the columns', () => {
    expect(describeMerge({ headers: ['Name', 'Plan'], rows: [{}, {}] })).toBe('2 rows · columns: Name, Plan');
    expect(describeMerge({ headers: ['a'], rows: [{}] })).toBe('1 row · columns: a');
  });
});

describe('planLocalize', () => {
  it('needs an id column', () => {
    expect(planLocalize({ headers: ['name', 'ko'], rows: [] })).toMatch(/needs an "id" column/);
  });

  it('needs at least one language column', () => {
    expect(planLocalize({ headers: ['id', 'name', 'characters'], rows: [] })).toMatch(/Add a column per language/);
  });

  it('finds the languages and counts translated layers per language', () => {
    const plan = planLocalize({
      headers: ['id', 'name', 'characters', 'ko', 'ja'],
      rows: [
        { id: '1:1', ko: '안녕', ja: '' },
        { id: '1:2', ko: '잘가', ja: 'またね' },
      ],
    });
    expect(typeof plan).toBe('object');
    if (typeof plan === 'string') return;
    expect(plan.locales).toEqual(['ko', 'ja']);
    expect(plan.summary).toBe('Languages: ko, ja\nTranslated layers — ko: 2, ja: 1');
  });
});

describe('generatedMessage', () => {
  it('reports copies made', () => {
    expect(generatedMessage('merge', 1, [], 0)).toBe('Created 1 copy.');
    expect(generatedMessage('localize', 4, [], 0)).toBe('Created 4 localized copies.');
  });

  it('lists tags that matched no column', () => {
    expect(generatedMessage('merge', 3, ['Nmae', 'x'], 0)).toBe(
      'Created 3 copies. These tags matched no column and were left as is: {{Nmae}}, {{x}}.'
    );
  });

  it('counts layers left untranslated', () => {
    expect(generatedMessage('localize', 2, [], 1)).toBe(
      'Created 2 localized copies. 1 layer has no translation and kept the source text.'
    );
  });
});
