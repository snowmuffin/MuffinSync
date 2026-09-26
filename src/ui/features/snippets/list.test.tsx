// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { SnippetList } from './list';

const snippets = [
  { id: 'a', name: 'Footer', text: '© 2026 Copydesk' },
  { id: 'b', name: 'CTA', text: 'Get started' },
];
let host: HTMLElement;

function mount(list = snippets) {
  const props = { onSave: vi.fn(), onDelete: vi.fn(), onApply: vi.fn(), onAddLayer: vi.fn() };
  act(() => render(<SnippetList snippets={list} {...props} />, host));
  return props;
}

const field = (id: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
const type = (id: string, value: string) =>
  act(() => {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
  });
const saveButton = () => host.querySelector<HTMLButtonElement>('[data-snippet-form] button[type=submit]')!;

describe('SnippetList', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('lists every snippet with its name and text', () => {
    mount();
    const rows = host.querySelectorAll('[data-snippet]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Footer');
    expect(rows[0].textContent).toContain('© 2026 Copydesk');
  });

  it('says there are none yet when the library is empty', () => {
    mount([]);
    expect(host.textContent).toContain('No snippets yet');
  });

  it('keeps Save disabled until there is text', () => {
    mount();
    expect(saveButton().disabled).toBe(true);
    type('snippet-text', 'Hello');
    expect(saveButton().disabled).toBe(false);
  });

  it('saves the name and text, then clears the form', () => {
    const { onSave } = mount();
    type('snippet-name', ' Greeting ');
    type('snippet-text', 'Hello\nthere');
    act(() => void host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })));
    expect(onSave).toHaveBeenCalledWith('Greeting', 'Hello\nthere');
    expect(field('snippet-text').value).toBe('');
  });

  it('names an unnamed snippet after the start of its text', () => {
    const { onSave } = mount();
    type('snippet-text', 'Terms and conditions apply to every order placed');
    act(() => void host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })));
    expect(onSave).toHaveBeenCalledWith('Terms and conditions apply to ', 'Terms and conditions apply to every order placed');
  });

  it('reports apply, add and delete for the snippet they belong to', () => {
    const { onApply, onAddLayer, onDelete } = mount();
    const second = host.querySelectorAll('[data-snippet]')[1];
    act(() => second.querySelector<HTMLElement>('[data-snippet-apply]')!.click());
    act(() => second.querySelector<HTMLElement>('[data-snippet-add]')!.click());
    act(() => second.querySelector<HTMLElement>('[data-snippet-delete]')!.click());
    expect(onApply).toHaveBeenCalledWith(snippets[1]);
    expect(onAddLayer).toHaveBeenCalledWith(snippets[1]);
    expect(onDelete).toHaveBeenCalledWith('b');
  });
});
