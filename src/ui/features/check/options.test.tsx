// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { CheckOptions } from './options';

const glossary = [{ avoid: 'log in', use: 'sign in', caseSensitive: false, wholeWord: true }];
let host: HTMLElement;

function mount(toggles: Record<string, boolean> = {}) {
  const props = { onToggle: vi.fn(), onGlossaryChange: vi.fn(), onImportGlossary: vi.fn(), onExportGlossary: vi.fn() };
  act(() => render(<CheckOptions toggles={toggles} glossary={glossary} {...props} />, host));
  return props;
}
const type = (id: string, value: string) =>
  act(() => {
    const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  });

describe('CheckOptions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('shows each rule with its default, or the remembered toggle', () => {
    mount({ quotes: true, 'double-space': false });
    const box = (rule: string) => host.querySelector<HTMLInputElement>(`[data-rule="${rule}"]`)!;
    expect(box('quotes').checked).toBe(true);
    expect(box('double-space').checked).toBe(false);
    expect(box('ellipsis').checked).toBe(false);
    expect(box('empty').checked).toBe(true);
  });

  it('reports a rule toggle', () => {
    const { onToggle } = mount();
    act(() => host.querySelector<HTMLInputElement>('[data-rule="ellipsis"]')!.click());
    expect(onToggle).toHaveBeenCalledWith('ellipsis', true);
  });

  it('adds a glossary entry with its options, replacing one for the same term', () => {
    const { onGlossaryChange } = mount();
    type('glossary-avoid', ' Log In ');
    type('glossary-use', 'Sign in');
    act(() => void host.querySelector('[data-glossary-form]')!.dispatchEvent(new Event('submit', { cancelable: true })));
    expect(onGlossaryChange).toHaveBeenCalledWith([
      { avoid: 'Log In', use: 'Sign in', caseSensitive: false, wholeWord: true },
    ]);
  });

  it('deletes an entry, and hands import and export to the caller', () => {
    const { onGlossaryChange, onImportGlossary, onExportGlossary } = mount();
    act(() => host.querySelector<HTMLElement>('[data-glossary-delete]')!.click());
    act(() => host.querySelector<HTMLElement>('[data-glossary-import]')!.click());
    act(() => host.querySelector<HTMLElement>('[data-glossary-export]')!.click());
    expect(onGlossaryChange).toHaveBeenCalledWith([]);
    expect(onImportGlossary).toHaveBeenCalled();
    expect(onExportGlossary).toHaveBeenCalled();
  });
});
