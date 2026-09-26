// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../post', () => ({ post: vi.fn() }));

import { post } from '../post';
import { applySettings, currentSettings, initSettings, setCheckToggle } from './settings';
import { initTabs } from './tabs';
import { getIncludeHidden, getScope, initScope, setSelectionPresent } from './scope';
import { DEFAULT_SETTINGS } from '../../shared/settings';

function markup(): void {
  document.body.innerHTML = `
    <div class="tab-bar">
      <button class="tab" data-tab="extract"></button>
      <button class="tab" data-tab="find-replace"></button>
      <button class="tab" data-tab="generate"></button>
    </div>
    <div id="extract-panel"></div><div id="find-replace-panel"></div><div id="generate-panel"></div>
    <div class="scope-selector">
      <div class="scope-option" data-scope="selection"></div>
      <div class="scope-option" data-scope="page"></div>
      <div class="scope-option" data-scope="document"></div>
    </div>
    <input class="include-hidden" type="checkbox" checked />
    <input id="case-sensitive" type="checkbox" />
    <input id="whole-word" type="checkbox" />
    <input id="use-regex" type="checkbox" />
    <input id="context-columns" type="checkbox" />
  `;
}

const saved = { ...DEFAULT_SETTINGS, tab: 'generate' as const, scope: 'document' as const, includeHidden: false,
  match: { caseSensitive: true, wholeWord: false, regex: true }, contextColumns: true, checks: { quotes: true } };

describe('remembered settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(post).mockClear();
    markup();
    initTabs(document);
    initScope(document);
    initSettings(document);
  });
  afterEach(() => vi.useRealTimers());

  it('applies every remembered setting to the panel', () => {
    applySettings(saved);
    expect(document.getElementById('generate-panel')?.classList.contains('hidden')).toBe(false);
    expect(getScope()).toBe('document');
    expect(getIncludeHidden()).toBe(false);
    expect((document.getElementById('use-regex') as HTMLInputElement).checked).toBe(true);
    expect(currentSettings()).toEqual(saved);
  });

  it('does not restore Selection when nothing is selected', () => {
    setSelectionPresent(false);
    applySettings({ ...saved, scope: 'selection' });
    expect(getScope()).toBe('page');
  });

  it('saves a change once, after a short pause', () => {
    applySettings(saved);
    const box = document.getElementById('whole-word') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(post).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({
      type: 'save-settings',
      settings: { ...saved, match: { ...saved.match, wholeWord: true } },
    });
  });

  it('saves a tab change and a scope change', () => {
    applySettings(saved);
    document.querySelector<HTMLElement>('.tab[data-tab="find-replace"]')!.click();
    document.querySelector<HTMLElement>('[data-scope="page"]')!.click();
    vi.advanceTimersByTime(300);
    expect(post).toHaveBeenCalledWith({
      type: 'save-settings',
      settings: expect.objectContaining({ tab: 'find-replace', scope: 'page' }),
    });
  });

  it('saves nothing before the stored settings have arrived', () => {
    document.querySelector<HTMLElement>('.tab[data-tab="find-replace"]')!.click();
    vi.advanceTimersByTime(1000);
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps check toggles and saves them', () => {
    applySettings(saved);
    setCheckToggle('double-space', false);
    vi.advanceTimersByTime(300);
    expect(currentSettings().checks).toEqual({ quotes: true, 'double-space': false });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ignores a remembered tab this markup does not have', () => {
    applySettings({ ...saved, tab: 'snippets' });
    expect(document.getElementById('extract-panel')?.classList.contains('hidden')).toBe(false);
  });
});
