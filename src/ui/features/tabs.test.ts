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

  it('re-initialising resets to Extract rather than trusting leftover markup', () => {
    showTab('find-replace');
    initTabs(document);
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(panel('find-replace').classList.contains('hidden')).toBe(true);
  });
});
