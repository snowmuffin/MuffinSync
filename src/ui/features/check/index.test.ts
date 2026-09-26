// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';

vi.mock('../../post', () => ({ post: vi.fn() }));

import { post } from '../../post';
import { mountStatus } from '../../status';
import { initCheck, showCheckResults, showGlossary } from './index';
import { initScope } from '../scope';
import { applySettings, initSettings } from '../settings';
import { initTabs } from '../tabs';
import { endTask, isBusy } from '../task';
import { DEFAULT_SETTINGS } from '../../../shared/settings';

describe('check wiring', () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    document.body.innerHTML = `
      <div id="main-content">
        <div class="scope-selector"><div class="scope-option" data-scope="page"></div></div>
        <input class="include-hidden" type="checkbox" checked />
        <button id="check-btn"></button>
        <div id="check-options-host"></div>
        <input type="file" id="glossary-file" />
      </div>
      <div id="check-results-host"></div>
      <div id="status-host"></div>`;
    act(() => mountStatus(document.getElementById('status-host')!));
    endTask();
    initTabs(document);
    initScope(document);
    initSettings(document);
    act(() => initCheck(document));
    act(() => applySettings({ ...DEFAULT_SETTINGS, scope: 'page' }));
  });

  it('runs the enabled rules with the file glossary', () => {
    const glossary = [{ avoid: 'e-mail', use: 'email', caseSensitive: false, wholeWord: true }];
    act(() => showGlossary(glossary));
    act(() => document.getElementById('check-btn')!.click());
    expect(post).toHaveBeenCalledWith({
      type: 'check',
      scope: 'page',
      includeHidden: true,
      rules: ['double-space', 'edge-space', 'space-before-punct', 'repeated-word', 'placeholder', 'empty', 'glossary'],
      glossary,
    });
    expect(isBusy()).toBe(true);
  });

  it('says there is nothing to fix when no layer has an issue', () => {
    act(() => showCheckResults([], 'page'));
    expect(document.getElementById('status-host')!.textContent).toBe('No issues found.');
  });

  it('covers the panel with results, and fixes through a plan', () => {
    act(() =>
      showCheckResults(
        [{ nodeId: '1:1', layerName: 'A', characters: 'a  b', findings: [{ rule: 'double-space', start: 1, end: 3, replacement: ' ' }] }],
        'page'
      )
    );
    expect(document.getElementById('main-content')!.classList.contains('hidden')).toBe(true);
    act(() => document.querySelector<HTMLElement>('[data-action="fix"]')!.click());
    expect(post).toHaveBeenCalledWith({
      type: 'plan-check',
      targets: [{ nodeId: '1:1', layerName: 'A', rules: ['double-space'] }],
      glossary: [],
      scope: 'page',
    });
    expect(document.getElementById('main-content')!.classList.contains('hidden')).toBe(false);
  });

  it('saves a glossary edit as the whole new list', () => {
    act(() => showGlossary([{ avoid: 'a', use: 'b', caseSensitive: false, wholeWord: true }]));
    act(() => document.querySelector<HTMLElement>('[data-glossary-delete]')!.click());
    expect(post).toHaveBeenCalledWith({ type: 'save-glossary', entries: [] });
  });
});
