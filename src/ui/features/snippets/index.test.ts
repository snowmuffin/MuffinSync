// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';

vi.mock('../../post', () => ({ post: vi.fn() }));

import { post } from '../../post';
import { initSnippets, showSnippets } from './index';
import { endTask, isBusy } from '../task';

const snippets = [{ id: 'a', name: 'Footer', text: '© 2026' }];

describe('snippet wiring', () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    document.body.innerHTML = '<div id="snippets-host"></div><div id="status-host"></div>';
    endTask();
    act(() => initSnippets());
  });

  it('asks the sandbox for the stored list on start', () => {
    expect(post).toHaveBeenCalledWith({ type: 'get-snippets' });
  });

  it('renders the list the sandbox sends', () => {
    act(() => showSnippets(snippets));
    expect(document.querySelectorAll('[data-snippet]')).toHaveLength(1);
  });

  it('deletes by sending the list without that snippet', () => {
    act(() => showSnippets(snippets));
    act(() => document.querySelector<HTMLElement>('[data-snippet-delete]')!.click());
    expect(post).toHaveBeenCalledWith({ type: 'save-snippets', snippets: [] });
  });

  it('applies a snippet as a planned change that goes through review', () => {
    act(() => showSnippets(snippets));
    act(() => document.querySelector<HTMLElement>('[data-snippet-apply]')!.click());
    expect(post).toHaveBeenCalledWith({ type: 'plan-snippet', text: '© 2026' });
    expect(isBusy()).toBe(true);
  });

  it('adds a snippet as a new layer', () => {
    act(() => showSnippets(snippets));
    act(() => document.querySelector<HTMLElement>('[data-snippet-add]')!.click());
    expect(post).toHaveBeenCalledWith({ type: 'add-snippet-layer', name: 'Footer', text: '© 2026' });
  });
});
