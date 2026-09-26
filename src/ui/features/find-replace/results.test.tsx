// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ResultList } from './results';
import type { SearchMatch } from '../../../shared/types';

const matches: SearchMatch[] = [
  { nodeId: '1:1', layerName: 'Hero / CTA', characters: 'Sign up free', matchCount: 1 },
  { nodeId: '1:2', layerName: 'Pricing / Card', characters: 'Sign up or sign up', matchCount: 2 },
];

let host: HTMLDivElement;

function mount(props: Partial<Parameters<typeof ResultList>[0]> = {}) {
  const onReplace = props.onReplace ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  const onNavigate = props.onNavigate ?? vi.fn();
  act(() => {
    render(
      <ResultList
        matches={props.matches ?? matches}
        canReplace={props.canReplace ?? true}
        onReplace={onReplace}
        onCancel={onCancel}
        onNavigate={onNavigate}
      />,
      host
    );
  });
  return { onReplace, onCancel, onNavigate };
}

const rows = () => host.querySelectorAll('[data-match-row]');
const boxes = () => host.querySelectorAll<HTMLInputElement>('[data-match]');
const button = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

describe('ResultList', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('lists one row per matching layer', () => {
    mount();
    expect(rows()).toHaveLength(2);
  });

  it('shows the layer name, its text, and the match count', () => {
    mount();
    const first = rows()[0].textContent ?? '';
    expect(first).toContain('Hero / CTA');
    expect(first).toContain('Sign up free');
    expect(first).toContain('1');
  });

  it('summarises totals as matches across layers', () => {
    mount();
    expect(host.textContent).toContain('3 matches in 2 layers');
  });

  it('starts with every row selected', () => {
    mount();
    expect(Array.from(boxes()).every((b) => b.checked)).toBe(true);
    expect(button('Replace').textContent).toContain('2');
    // The action-bar spacing in src/ui.html keys off this class; a producer
    // that forgets it gets no spacing and nothing in CI notices otherwise.
    expect(button('Replace').classList.contains('action')).toBe(true);
  });

  it('reports only the selected rows', () => {
    const { onReplace } = mount();
    act(() => boxes()[0].click());
    act(() => button('Replace').click());
    expect(onReplace).toHaveBeenCalledWith([
      { nodeId: '1:2', layerName: 'Pricing / Card' },
    ]);
  });

  it('pluralises the replace button for one row', () => {
    mount({ matches: [matches[0]] });
    expect(button('Replace').textContent).toBe('Replace 1 layer');
  });

  it('disables replace when nothing is selected', () => {
    mount();
    act(() => boxes()[0].click());
    act(() => boxes()[1].click());
    expect(button('Replace').disabled).toBe(true);
  });

  it('hides the replace action entirely when there is no replacement', () => {
    mount({ canReplace: false });
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.includes('Replace'))).toBe(false);
    expect(boxes()).toHaveLength(0);
  });

  it('reports which layer to centre when a row asks', () => {
    const { onNavigate } = mount();
    act(() => host.querySelectorAll<HTMLElement>('[data-navigate]')[1].click());
    expect(onNavigate).toHaveBeenCalledWith('1:2');
  });

  it('reports a cancel without a payload', () => {
    const { onCancel } = mount();
    expect(button('Close').classList.contains('action')).toBe(true);
    act(() => button('Close').click());
    expect(onCancel).toHaveBeenCalledWith();
  });

  it('never mutates the matches it was given', () => {
    const given = structuredClone(matches);
    mount({ matches: given });
    act(() => boxes()[0].click());
    expect(given).toEqual(matches);
  });
});

describe('ResultList with a long list', () => {
  const many = (n: number): SearchMatch[] =>
    Array.from({ length: n }, (_, i) => ({
      nodeId: `9:${i}`,
      layerName: `Layer ${i}`,
      characters: 'Sign up',
      matchCount: 1,
    }));
  const showMore = () => host.querySelector<HTMLButtonElement>('[data-show-more]');

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('renders the first 200 rows and says how many are not shown', () => {
    mount({ matches: many(450) });
    expect(rows()).toHaveLength(200);
    expect(showMore()?.textContent).toBe('Show 200 more (250 not shown)');
  });

  it('renders the next page each time Show more is pressed, then hides the button', () => {
    mount({ matches: many(450) });
    act(() => showMore()!.click());
    expect(rows()).toHaveLength(400);
    expect(showMore()?.textContent).toBe('Show 50 more (50 not shown)');
    act(() => showMore()!.click());
    expect(rows()).toHaveLength(450);
    expect(showMore()).toBeNull();
  });

  it('counts and replaces every row, rendered or not', () => {
    const { onReplace } = mount({ matches: many(450) });
    expect(button('Replace').textContent).toContain('Replace 450 layers');
    act(() => button('Replace').click());
    expect(vi.mocked(onReplace).mock.calls[0][0]).toHaveLength(450);
  });

  it('summarises the whole list, not the rendered page', () => {
    mount({ matches: many(450) });
    expect(host.querySelector('.results-summary')?.textContent).toContain('450 matches in 450 layers');
  });

  it('shows no Show more button for a short list', () => {
    mount({ matches: many(200) });
    expect(showMore()).toBeNull();
  });
});
