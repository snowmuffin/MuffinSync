import { describe, expect, it } from 'vitest';
import {
  checkQuery,
  countMatches,
  findMatches,
  matchingLayers,
  replaceAll,
  replaceMatches,
} from './match';
import type { MatchOptions } from './types';

const opts = (over: Partial<MatchOptions> = {}): MatchOptions => ({
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  ...over,
});

describe('countMatches', () => {
  it('counts every occurrence, not just the first', () => {
    expect(countMatches('Sign up to sign up', 'sign up', opts())).toBe(2);
  });

  it('ignores case when caseSensitive is off', () => {
    expect(countMatches('SIGN UP', 'sign up', opts())).toBe(1);
  });

  it('respects case when caseSensitive is on', () => {
    expect(countMatches('SIGN UP', 'sign up', opts({ caseSensitive: true }))).toBe(0);
    expect(countMatches('sign up', 'sign up', opts({ caseSensitive: true }))).toBe(1);
  });

  it('counts adjacent occurrences without overlapping them', () => {
    // 'aa' fits twice in 'aaaa' without reusing a character; a naive scan that
    // advanced by one would report three.
    expect(countMatches('aaaa', 'aa', opts())).toBe(2);
  });

  it('matches at the very start and the very end of the text', () => {
    expect(countMatches('go now', 'go', opts())).toBe(1);
    expect(countMatches('now go', 'go', opts())).toBe(1);
  });

  it('treats regular-expression metacharacters literally', () => {
    expect(countMatches('abc', 'a.c', opts())).toBe(0);
    expect(countMatches('a.c', 'a.c', opts())).toBe(1);
    expect(countMatches('price (net)', '(net)', opts())).toBe(1);
  });

  it('returns zero for an empty query rather than matching everywhere', () => {
    expect(countMatches('anything', '', opts())).toBe(0);
  });

  it('requires both sides to be non-word when wholeWord is on', () => {
    const w = opts({ wholeWord: true });
    expect(countMatches('Pro plan', 'Pro', w)).toBe(1);
    expect(countMatches('Product', 'Pro', w)).toBe(0);
    expect(countMatches('a Pro', 'Pro', w)).toBe(1);
    expect(countMatches('Pro.', 'Pro', w)).toBe(1);
    expect(countMatches('_Pro', 'Pro', w)).toBe(0);
    expect(countMatches('4Pro', 'Pro', w)).toBe(0);
  });

  it('treats letters outside Latin as word characters', () => {
    // Hangul has no spaces between words, so whole word cannot find a term
    // inside a compound. Spec 3.4 states this is the option's meaning, not a bug.
    expect(countMatches('회원가입', '회원', opts({ wholeWord: true }))).toBe(0);
    expect(countMatches('회원가입', '회원', opts())).toBe(1);
  });

  it('keeps positions in the original text when case folding changes length', () => {
    // 'İ'.toLowerCase() is two code units, so an index taken from a folded
    // copy of the text would not line up with the text itself.
    expect(countMatches('İ sign up', 'sign up', opts())).toBe(1);
  });

  it('does not treat a dotted capital I as ASCII i', () => {
    // Different letters; matching them would be the Turkish-i bug in reverse.
    expect(countMatches('İ', 'i', opts())).toBe(0);
  });

  it('finds nothing when the query is longer than the text', () => {
    expect(countMatches('ab', 'abcdef', opts())).toBe(0);
  });
});

describe('replaceAll', () => {
  it('replaces every occurrence', () => {
    expect(replaceAll('Sign up to sign up', 'sign up', 'Get started', opts())).toBe(
      'Get started to Get started'
    );
  });

  it('preserves the text around each occurrence exactly', () => {
    expect(replaceAll('  padded  ', 'padded', 'trimmed', opts())).toBe('  trimmed  ');
  });

  it('returns the text unchanged when nothing matches', () => {
    expect(replaceAll('Sign up', 'log in', 'Get started', opts())).toBe('Sign up');
  });

  it('returns identical text when the replacement reproduces the match', () => {
    expect(replaceAll('Sign up', 'Sign up', 'Sign up', opts())).toBe('Sign up');
  });

  it('does not rescan its own output', () => {
    // Replacing 'a' with 'aa' must terminate and double each character once.
    expect(replaceAll('aaa', 'a', 'aa', opts())).toBe('aaaaaa');
  });

  it('honours wholeWord', () => {
    expect(replaceAll('Pro and Product', 'Pro', 'Plus', opts({ wholeWord: true }))).toBe(
      'Plus and Product'
    );
  });

  it('replaces with an empty string when the replacement is empty', () => {
    expect(replaceAll('a-b-c', '-', '', opts())).toBe('abc');
  });

  it('returns the text unchanged for an empty query', () => {
    expect(replaceAll('anything', '', 'x', opts())).toBe('anything');
  });

  it('does not corrupt surrounding text when folding changes length', () => {
    expect(replaceAll('İ sign up', 'sign up', 'get started', opts())).toBe('İ get started');
  });

  it('finds nothing when the query is longer than the text', () => {
    expect(replaceAll('ab', 'abcdef', 'x', opts())).toBe('ab');
  });
});

describe('matchingLayers', () => {
  const rows = [
    { id: '1:1', name: 'Hero / CTA', characters: 'Sign up free' },
    { id: '1:2', name: 'Nav / Right', characters: 'Log in' },
    { id: '1:3', name: 'Pricing / Card', characters: 'Sign up or sign up' },
  ];

  it('keeps only the layers the query occurs in', () => {
    const found = matchingLayers(rows, 'sign up', opts());
    expect(found.map((m) => m.nodeId)).toEqual(['1:1', '1:3']);
  });

  it('carries the layer name, its current text, and the count', () => {
    const [first] = matchingLayers(rows, 'sign up', opts());
    expect(first).toEqual({
      nodeId: '1:1',
      layerName: 'Hero / CTA',
      characters: 'Sign up free',
      matchCount: 1,
    });
  });

  it('reports a per-layer count, not a total', () => {
    const found = matchingLayers(rows, 'sign up', opts());
    expect(found.map((m) => m.matchCount)).toEqual([1, 2]);
  });

  it('returns nothing for an empty query', () => {
    expect(matchingLayers(rows, '', opts())).toEqual([]);
  });
});

describe('findMatches', () => {
  it('gives each literal match its range', () => {
    expect(findMatches('a sign up, sign up', 'sign up', opts()).map((m) => [m.start, m.end])).toEqual([
      [2, 9],
      [11, 18],
    ]);
  });
});

describe('regular expressions', () => {
  const re = (over: Partial<MatchOptions> = {}) => opts({ regex: true, ...over });

  it('matches a pattern rather than the literal text', () => {
    expect(countMatches('Order 12 and 345', '\\d+', re())).toBe(2);
    expect(countMatches('Order 12', '\\d+', opts())).toBe(0);
  });

  it('ignores case unless caseSensitive is on', () => {
    expect(countMatches('SIGN up', 'sign', re())).toBe(1);
    expect(countMatches('SIGN up', 'sign', re({ caseSensitive: true }))).toBe(0);
  });

  it('applies whole word with the same Unicode rule as literal mode', () => {
    expect(countMatches('cat catalog café', 'ca\\w*', re({ wholeWord: true }))).toBe(2);
    expect(countMatches('안녕하세요 안녕', '안녕', re({ wholeWord: true }))).toBe(1);
  });

  it('skips empty matches instead of looping', () => {
    expect(countMatches('abc', 'x*', re())).toBe(0);
    expect(countMatches('aa b', 'a*', re())).toBe(1);
  });

  it('steps past an empty match on an astral character without splitting it', () => {
    expect(countMatches('😀a😀', 'a?', re())).toBe(1);
  });

  it('expands $1, $&, $<name> and $$ in the replacement', () => {
    expect(replaceAll('John Smith', '(\\w+) (\\w+)', '$2, $1', re())).toBe('Smith, John');
    expect(replaceAll('cost 5', '\\d', '[$&]', re())).toBe('cost [5]');
    expect(replaceAll('2026-09', '(?<y>\\d{4})-(?<m>\\d\\d)', '$<m>/$<y>', re())).toBe('09/2026');
    expect(replaceAll('5', '\\d', '$$$&', re())).toBe('$5');
  });

  it('reads two digits after $ only when that names a group', () => {
    expect(replaceAll('ab', '(a)(b)', '$12', re())).toBe('a2');
  });

  it('leaves $ sequences that name nothing as they are', () => {
    expect(replaceAll('ab', '(a)b', '$2 $<x> $z', re())).toBe('$2 $<x> $z');
  });

  it('never expands $ in literal mode', () => {
    expect(replaceAll('price', 'price', '$1 $&', opts())).toBe('$1 $&');
  });

  it('keeps indices in the same UTF-16 space as literal mode', () => {
    const text = '😀 sign';
    expect(findMatches(text, 'sign', re())[0].start).toBe(findMatches(text, 'sign', opts())[0].start);
  });
});

describe('checkQuery', () => {
  it('asks for something to find when the query is empty', () => {
    expect(checkQuery('', opts())).toBe('Type something to find.');
  });

  it('accepts any literal text, brackets included', () => {
    expect(checkQuery('(net', opts())).toBeNull();
  });

  it('reports an invalid pattern in regex mode', () => {
    expect(checkQuery('(net', opts({ regex: true }))).toMatch(/^Invalid regular expression/);
  });

  it('accepts a valid pattern', () => {
    expect(checkQuery('\\d+', opts({ regex: true }))).toBeNull();
  });
});

describe('replaceMatches with chosen occurrences', () => {
  it('replaces only the chosen matches, by index', () => {
    expect(replaceMatches('a b a b a', 'a', 'X', opts(), new Set([0, 2]))).toBe('X b a b X');
  });

  it('changes nothing when nothing is chosen', () => {
    expect(replaceMatches('a b a', 'a', 'X', opts(), new Set())).toBe('a b a');
  });

  it('works with regex groups too', () => {
    expect(replaceMatches('1 2 3', '(\\d)', '<$1>', opts({ regex: true }), new Set([1]))).toBe('1 <2> 3');
  });
});
