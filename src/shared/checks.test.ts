import { describe, expect, it } from 'vitest';
import {
  applyFixes,
  enabledRules,
  findIssues,
  fixText,
  glossaryFromRows,
  glossaryToRows,
  isFindings,
  isGlossary,
  RULES,
  type GlossaryEntry,
  type RuleId,
} from './checks';

const fix = (text: string, rule: RuleId, glossary: GlossaryEntry[] = []) => fixText(text, [rule], glossary);
const found = (text: string, rule: RuleId, glossary: GlossaryEntry[] = []) =>
  findIssues(text, [rule], glossary).map((f) => text.slice(f.start, f.end));

describe('double-space', () => {
  it('collapses runs of spaces between words', () => {
    expect(fix('Sign  up   now', 'double-space')).toBe('Sign up now');
  });

  it('leaves indentation, edges and non-breaking spaces alone', () => {
    expect(found('  indented', 'double-space')).toEqual([]);
    expect(found('a  b', 'double-space')).toEqual([]);
  });
});

describe('edge-space', () => {
  it('trims leading and trailing whitespace, line breaks included', () => {
    expect(fix(' \nHello \n', 'edge-space')).toBe('Hello');
  });

  it('leaves an all-space layer to the empty rule', () => {
    expect(found('   ', 'edge-space')).toEqual([]);
  });
});

describe('space-before-punct', () => {
  it('removes an ordinary space before punctuation', () => {
    expect(fix('Hello , world !', 'space-before-punct')).toBe('Hello, world!');
  });

  it('leaves a French non-breaking space and a leading ellipsis alone', () => {
    expect(found('Bonjour !', 'space-before-punct')).toEqual([]);
    expect(found('Wait .net', 'space-before-punct')).toEqual([]);
  });
});

describe('repeated-word', () => {
  it('removes the repeat and keeps the first spelling', () => {
    expect(fix('The the plan', 'repeated-word')).toBe('The plan');
  });

  it('works for Korean and ignores partial words', () => {
    expect(fix('지금 지금 시작', 'repeated-word')).toBe('지금 시작');
    expect(found('the theme', 'repeated-word')).toEqual([]);
  });
});

describe('ellipsis', () => {
  it('turns exactly three dots into …', () => {
    expect(fix('Loading...', 'ellipsis')).toBe('Loading…');
    expect(found('Wait....', 'ellipsis')).toEqual([]);
  });
});

describe('quotes', () => {
  it('curls double and single quotes by position, and apostrophes as closing', () => {
    expect(fix(`He said "don't" and 'yes'`, 'quotes')).toBe('He said “don’t” and ‘yes’');
  });
});

describe('placeholder', () => {
  it('reports placeholder words and default layer texts, without a fix', () => {
    expect(found('Lorem ipsum dolor', 'placeholder')).toEqual(['Lorem ipsum']);
    expect(found('Pricing TBD', 'placeholder')).toEqual(['TBD']);
    expect(found('  Text ', 'placeholder')).toEqual(['  Text ']);
    expect(findIssues('TODO', ['placeholder'])[0].replacement).toBeUndefined();
  });

  it('does not flag words that merely contain a marker', () => {
    expect(found('Todoist and textbook', 'placeholder')).toEqual([]);
  });
});

describe('empty', () => {
  it('reports empty and space-only layers', () => {
    expect(findIssues('', ['empty'])).toHaveLength(1);
    expect(findIssues(' \n', ['empty'])).toHaveLength(1);
    expect(findIssues('x', ['empty'])).toHaveLength(0);
  });
});

describe('glossary', () => {
  const glossary: GlossaryEntry[] = [
    { avoid: 'log in', use: 'sign in', caseSensitive: false, wholeWord: true },
    { avoid: 'e-mail', use: 'email', caseSensitive: false, wholeWord: true },
    { avoid: 'Log', use: 'Log in', caseSensitive: true, wholeWord: true },
  ];

  it('replaces avoided terms, keeping a capital first letter', () => {
    expect(fix('Log in with your e-mail. Then log in again.', 'glossary', glossary.slice(0, 2))).toBe(
      'Sign in with your email. Then sign in again.'
    );
  });

  it('does not flag text that already uses the preferred term', () => {
    expect(found('Log in', 'glossary', [glossary[2]])).toEqual([]);
  });

  it('respects whole word', () => {
    expect(found('Blog in style', 'glossary', glossary)).toEqual([]);
  });
});

describe('several rules on one layer', () => {
  it('orders findings by position and applies every fix that does not overlap', () => {
    const text = ' Log in  now ... ';
    const rules: RuleId[] = ['edge-space', 'double-space', 'space-before-punct', 'ellipsis', 'glossary'];
    const glossary: GlossaryEntry[] = [{ avoid: 'log in', use: 'sign in', caseSensitive: false, wholeWord: true }];
    expect(fixText(text, rules, glossary)).toBe('Sign in now…');
  });

  it('skips a fix overlapping one already applied', () => {
    expect(
      applyFixes('abcdef', [
        { rule: 'double-space', start: 1, end: 3, replacement: 'X' },
        { rule: 'ellipsis', start: 2, end: 4, replacement: 'Y' },
      ])
    ).toBe('aXdef');
  });
});

describe('enabledRules', () => {
  it('uses each rule default unless a toggle says otherwise', () => {
    const on = enabledRules({ quotes: true, 'double-space': false });
    expect(on).toContain('quotes');
    expect(on).not.toContain('double-space');
    expect(on).not.toContain('ellipsis');
    expect(on).toContain('empty');
  });

  it('turns ellipsis and quotes off by default', () => {
    expect(RULES.filter((r) => !r.defaultOn).map((r) => r.id)).toEqual(['ellipsis', 'quotes']);
  });
});

describe('glossary tables', () => {
  it('round-trips through rows, defaulting the options', () => {
    const entries: GlossaryEntry[] = [{ avoid: 'e-mail', use: 'email', caseSensitive: true, wholeWord: false }];
    const [header, ...body] = glossaryToRows(entries);
    const rows = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
    expect(glossaryFromRows(rows)).toEqual(entries);
    expect(glossaryFromRows([{ avoid: 'x', use: 'y' }, { avoid: '', use: 'z' }])).toEqual([
      { avoid: 'x', use: 'y', caseSensitive: false, wholeWord: true },
    ]);
  });
});

describe('validators', () => {
  it('accepts well-formed glossaries and findings only', () => {
    expect(isGlossary([{ avoid: 'a', use: 'b', caseSensitive: false, wholeWord: true }])).toBe(true);
    expect(isGlossary([{ avoid: '', use: 'b', caseSensitive: false, wholeWord: true }])).toBe(false);
    expect(isFindings([{ rule: 'empty', start: 0, end: 0 }])).toBe(true);
    expect(isFindings([{ rule: 'nope', start: 0, end: 1 }])).toBe(false);
    expect(isFindings([{ rule: 'empty', start: 2, end: 1 }])).toBe(false);
  });
});
