// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { initScope, getScope, setSelectionPresent } from './scope';

const markup = `
  <div class="scope-selector">
    <div class="scope-option selected" data-scope="selection">Selection</div>
    <div class="scope-option" data-scope="page">Current page</div>
  </div>
`;

function selectionOption(): Element | null {
  return document.querySelector('[data-scope="selection"]');
}

function pageOption(): Element | null {
  return document.querySelector('[data-scope="page"]');
}

function click(element: Element | null): void {
  if (element instanceof HTMLElement) element.click();
}

beforeEach(() => {
  document.body.innerHTML = markup;
  initScope(document);
});

describe('scope control', () => {
  it('defaults to selection before anything is reported', () => {
    expect(getScope()).toBe('selection');
    expect(selectionOption()?.classList.contains('selected')).toBe(true);
  });

  it('disables the Selection option when nothing is selected', () => {
    setSelectionPresent(false);
    expect(selectionOption()?.classList.contains('disabled')).toBe(true);
  });

  it('moves the choice to page when Selection was chosen and the selection disappears', () => {
    setSelectionPresent(false);

    expect(getScope()).toBe('page');
    expect(pageOption()?.classList.contains('selected')).toBe(true);
    expect(selectionOption()?.classList.contains('selected')).toBe(false);
  });

  it('re-enables the Selection option when a selection returns', () => {
    setSelectionPresent(false);
    setSelectionPresent(true);

    expect(selectionOption()?.classList.contains('disabled')).toBe(false);
  });

  it('changes the choice when an option is clicked', () => {
    click(pageOption());
    expect(getScope()).toBe('page');

    click(selectionOption());
    expect(getScope()).toBe('selection');
  });

  it('ignores clicks on a disabled option', () => {
    setSelectionPresent(false);
    click(selectionOption());

    expect(getScope()).toBe('page');
  });
});
