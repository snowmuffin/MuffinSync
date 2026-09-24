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
