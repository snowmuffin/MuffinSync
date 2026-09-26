// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { initTabs, showTab } from './tabs';

function markup(): void {
  document.body.innerHTML = `
    <div id="main-content">
      <div class="tab-bar">
        <button class="tab selected" data-tab="extract" type="button">Extract</button>
        <button class="tab" data-tab="find-replace" type="button">Find &amp; Replace</button>
      </div>
      <div id="extract-panel" class="tab-panel"></div>
      <div id="find-replace-panel" class="tab-panel hidden"></div>
    </div>
  `;
}

const panel = (name: string) => document.getElementById(`${name}-panel`)!;
const tab = (name: string) =>
  document.querySelector<HTMLElement>(`.tab[data-tab="${name}"]`)!;

function press(element: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe('tabs', () => {
  beforeEach(() => {
    markup();
    initTabs(document);
  });

  it('shows Extract and hides Find & Replace on init', () => {
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(panel('find-replace').classList.contains('hidden')).toBe(true);
    expect(tab('extract').classList.contains('selected')).toBe(true);
  });

  it('swaps which panel is visible when a tab is clicked', () => {
    tab('find-replace').click();
    expect(panel('extract').classList.contains('hidden')).toBe(true);
    expect(panel('find-replace').classList.contains('hidden')).toBe(false);
  });

  it('moves the selected class to the clicked tab', () => {
    tab('find-replace').click();
    expect(tab('find-replace').classList.contains('selected')).toBe(true);
    expect(tab('extract').classList.contains('selected')).toBe(false);
  });

  it('is idempotent: clicking the open tab leaves it open', () => {
    tab('extract').click();
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(tab('extract').classList.contains('selected')).toBe(true);
  });

  it('switches on demand without a click', () => {
    showTab('find-replace');
    expect(panel('find-replace').classList.contains('hidden')).toBe(false);
  });

  it('marks the selected tab for assistive technology, not only by colour', () => {
    expect(tab('extract').getAttribute('aria-selected')).toBe('true');
    expect(tab('find-replace').getAttribute('aria-selected')).toBe('false');
    tab('find-replace').click();
    expect(tab('extract').getAttribute('aria-selected')).toBe('false');
    expect(tab('find-replace').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps only the selected tab in the Tab order', () => {
    expect(tab('extract').tabIndex).toBe(0);
    expect(tab('find-replace').tabIndex).toBe(-1);
    showTab('find-replace');
    expect(tab('extract').tabIndex).toBe(-1);
    expect(tab('find-replace').tabIndex).toBe(0);
  });

  it('moves to the next tab and focuses it on ArrowRight', () => {
    press(tab('extract'), 'ArrowRight');
    expect(panel('find-replace').classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(tab('find-replace'));
  });

  it('wraps around on ArrowRight from the last tab and ArrowLeft from the first', () => {
    press(tab('extract'), 'ArrowLeft');
    expect(tab('find-replace').getAttribute('aria-selected')).toBe('true');
    press(tab('find-replace'), 'ArrowRight');
    expect(tab('extract').getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the first and last tab on Home and End', () => {
    press(tab('extract'), 'End');
    expect(tab('find-replace').getAttribute('aria-selected')).toBe('true');
    press(tab('find-replace'), 'Home');
    expect(tab('extract').getAttribute('aria-selected')).toBe('true');
  });

  it('ignores other keys, leaving them to the browser', () => {
    const event = press(tab('extract'), 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(tab('extract').getAttribute('aria-selected')).toBe('true');
  });

  it('detaches the previous init\'s listeners on re-init', () => {
    const second = document.implementation.createHTMLDocument();
    second.body.innerHTML = document.body.innerHTML;
    initTabs(second);

    tab('find-replace').click();
    const secondPanel = (name: string) => second.getElementById(`${name}-panel`)!;
    expect(secondPanel('find-replace').classList.contains('hidden')).toBe(true);
  });

  it('re-initialising resets to Extract rather than trusting leftover markup', () => {
    showTab('find-replace');
    initTabs(document);
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(panel('find-replace').classList.contains('hidden')).toBe(true);
  });
});
