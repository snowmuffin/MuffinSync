import { describe, expect, it } from 'vitest';
import { countWords, textStats } from './stats';
import { textLength } from './csv';
import { NO_FRAME } from './documents';

describe('countWords', () => {
  it('counts English words, not punctuation', () => {
    expect(countWords('Sign up — it’s free!')).toBe(4);
  });

  it('counts Korean words by spacing unit and Japanese by segmentation', () => {
    expect(countWords('지금 바로 시작하세요')).toBe(3);
    expect(countWords('今すぐ始めましょう')).toBeGreaterThan(1);
  });

  it('falls back to whitespace splitting without Intl.Segmenter', () => {
    expect(countWords('one two  three —', null)).toBe(3);
  });

  it('counts nothing in empty or symbol-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('— …')).toBe(0);
  });
});

describe('textLength', () => {
  it('counts an emoji as one character', () => {
    expect(textLength('Hi 👋')).toBe(4);
  });
});

describe('textStats', () => {
  it('totals layers, words and characters, and breaks them down by frame', () => {
    const stats = textStats([
      { id: '1', name: 'a', characters: 'Hello world', frame: 'Home' },
      { id: '2', name: 'b', characters: 'Hi', frame: 'Home' },
      { id: '3', name: 'c', characters: 'Loose' },
    ]);
    expect(stats.total).toEqual({ layers: 3, words: 4, characters: 18 });
    expect(stats.byFrame).toEqual([
      { frame: 'Home', layers: 2, words: 3, characters: 13 },
      { frame: NO_FRAME, layers: 1, words: 1, characters: 5 },
    ]);
  });
});
