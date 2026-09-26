// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { initScope, getIncludeHidden, getScope, setSelectionPresent } from './scope';

const markup = `
  <div class="scope-selector">
    <div class="scope-option selected" data-scope="selection">Selection</div>
    <div class="scope-option" data-scope="page">Current page</div>
  </div>
`;

// Mirrors src/ui.html: the Extract panel and the Find & Replace panel each
// render their own copy of the scope control, sharing one scope per spec 3.1.
const twoPanelMarkup = `
  <div class="scope-selector" id="extract-scope">
    <div class="scope-option selected" data-scope="selection">Selection</div>
    <div class="scope-option" data-scope="page">Current page</div>
  </div>
  <div class="scope-selector" id="find-replace-scope">
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
    // Starts with Selection chosen (the default asserted above).
    setSelectionPresent(false);
    setSelectionPresent(true);

    expect(selectionOption()?.classList.contains('disabled')).toBe(false);

    // Re-enabling must not resurrect the old choice: the user's scope stayed
    // on 'page' when the selection vanished, and it stays there until they
    // pick something themselves.
    expect(getScope()).toBe('page');
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

describe('scope control with two panels sharing one scope', () => {
  beforeEach(() => {
    document.body.innerHTML = twoPanelMarkup;
    initScope(document);
  });

  it('disables the Selection option in every panel, not just the first', () => {
    setSelectionPresent(false);

    const disabled = document.querySelectorAll('[data-scope="selection"]');
    expect(disabled.length).toBe(2);
    disabled.forEach((option) => {
      expect(option.classList.contains('disabled')).toBe(true);
    });
  });

  it('shows the choice made in one panel in the other panel too', () => {
    // The user-visible half of sharing one scope (spec 3.1): picking a scope in
    // either panel changes what the other panel shows, because they are two
    // views of one choice rather than two settings.
    const secondPanelPage = document.querySelector('#find-replace-scope [data-scope="page"]');
    click(secondPanelPage);

    expect(getScope()).toBe('page');
    const first = document.querySelector('#extract-scope [data-scope="page"]');
    const firstSelection = document.querySelector('#extract-scope [data-scope="selection"]');
    expect(first?.classList.contains('selected')).toBe(true);
    expect(firstSelection?.classList.contains('selected')).toBe(false);
  });

  it('ignores a click on the second panel\'s disabled Selection option', () => {
    setSelectionPresent(false);

    const secondPanelSelection = document.querySelectorAll('[data-scope="selection"]')[1];
    click(secondPanelSelection);

    expect(getScope()).toBe('page');
  });
});

describe('re-initialising', () => {
  it('detaches the previous init\'s listeners', () => {
    // A second init against another document stands in for any re-init: the
    // controls from the first must stop driving the shared scope.
    const first = document;
    const second = document.implementation.createHTMLDocument();
    second.body.innerHTML = markup;
    initScope(second);

    click(first.querySelector('[data-scope="page"]'));
    expect(getScope()).toBe('selection');

    const secondPage = second.querySelector('[data-scope="page"]');
    if (secondPage instanceof HTMLElement) secondPage.click();
    expect(getScope()).toBe('page');
  });
});

describe('All pages and hidden layers', () => {
  const markupWithAll = `
    <div class="scope-selector">
      <div class="scope-option selected" data-scope="selection">Selection</div>
      <div class="scope-option" data-scope="page">Current page</div>
      <div class="scope-option" data-scope="document">All pages</div>
    </div>
    <input class="include-hidden" type="checkbox" checked />
    <input class="include-hidden" type="checkbox" checked />
  `;
  const hiddenBoxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('.include-hidden'));

  beforeEach(() => {
    document.body.innerHTML = markupWithAll;
    initScope(document);
  });

  it('can choose every page', () => {
    click(document.querySelector('[data-scope="document"]'));
    expect(getScope()).toBe('document');
  });

  it('keeps All pages chosen when the selection empties', () => {
    click(document.querySelector('[data-scope="document"]'));
    setSelectionPresent(false);
    expect(getScope()).toBe('document');
  });

  it('includes hidden layers by default', () => {
    expect(getIncludeHidden()).toBe(true);
  });

  it('keeps both panels\' hidden-layer boxes in step', () => {
    hiddenBoxes()[0].checked = false;
    hiddenBoxes()[0].dispatchEvent(new Event('change'));
    expect(getIncludeHidden()).toBe(false);
    expect(hiddenBoxes()[1].checked).toBe(false);
  });

  it('resets to including hidden layers on re-init', () => {
    hiddenBoxes()[0].checked = false;
    hiddenBoxes()[0].dispatchEvent(new Event('change'));
    initScope(document);
    expect(getIncludeHidden()).toBe(true);
    expect(hiddenBoxes().every((box) => box.checked)).toBe(true);
  });
});
