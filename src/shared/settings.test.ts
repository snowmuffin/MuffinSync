import { describe, expect, it } from 'vitest';
import { COMMAND_TABS, DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('returns the defaults for nothing stored', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps every valid field', () => {
    const stored = {
      tab: 'generate',
      scope: 'document',
      includeHidden: false,
      match: { caseSensitive: true, wholeWord: true, regex: true },
      contextColumns: true,
      checks: { 'double-space': false, quotes: true },
    };
    expect(parseSettings(stored)).toEqual(stored);
  });

  it('falls back field by field, so one bad field costs only itself', () => {
    const parsed = parseSettings({
      tab: 'nonsense',
      scope: 'page',
      includeHidden: 'yes',
      match: { caseSensitive: true, wholeWord: 1 },
      checks: { quotes: true, broken: 'on' },
    });
    expect(parsed.tab).toBe('extract');
    expect(parsed.scope).toBe('page');
    expect(parsed.includeHidden).toBe(true);
    expect(parsed.match).toEqual({ caseSensitive: true, wholeWord: false, regex: false });
    expect(parsed.checks).toEqual({ quotes: true });
  });

  it('never shares the default objects with what it returns', () => {
    const parsed = parseSettings(undefined);
    parsed.match.regex = true;
    parsed.checks.x = true;
    expect(DEFAULT_SETTINGS.match.regex).toBe(false);
    expect(DEFAULT_SETTINGS.checks).toEqual({});
  });
});

describe('COMMAND_TABS', () => {
  it('maps each menu command to a tab and leaves the plain open command out', () => {
    expect(COMMAND_TABS.find).toBe('find-replace');
    expect(COMMAND_TABS.check).toBe('check');
    expect(COMMAND_TABS['open-plugin']).toBeUndefined();
  });
});
