// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { CheckResults } from './results';
import type { CheckResult } from '../../../shared/messages';

const results: CheckResult[] = [
  {
    nodeId: '1:1',
    layerName: 'Hero',
    characters: 'Sign  up ',
    findings: [
      { rule: 'double-space', start: 4, end: 6, replacement: ' ' },
      { rule: 'edge-space', start: 8, end: 9, replacement: '' },
    ],
  },
  { nodeId: '1:2', layerName: 'Card', characters: 'TODO', findings: [{ rule: 'placeholder', start: 0, end: 4 }] },
];
let host: HTMLElement;

function mount(list = results) {
  const props = { onFix: vi.fn(), onClose: vi.fn(), onNavigate: vi.fn() };
  act(() => render(<CheckResults results={list} {...props} />, host));
  return props;
}
const fixButton = () => host.querySelector<HTMLButtonElement>('[data-action="fix"]');

describe('CheckResults', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('summarises layers and findings per rule', () => {
    mount();
    expect(host.querySelector('.results-summary')?.textContent).toContain('2 layers with issues');
    expect(host.querySelector('.results-summary')?.textContent).toContain('Placeholder text 1');
  });

  it('highlights each finding, showing spaces as dots', () => {
    mount();
    const marks = Array.from(host.querySelectorAll('mark.issue')).map((m) => m.textContent);
    expect(marks).toEqual(['··', '·', 'TODO']);
  });

  it('ticks every fixable rule by default and counts layers to fix', () => {
    mount();
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('[data-fix]')).every((b) => b.checked)).toBe(true);
    expect(fixButton()?.textContent).toBe('Fix 1 layer');
  });

  it('shows report-only findings without a checkbox', () => {
    mount();
    const second = host.querySelectorAll('[data-check-row]')[1];
    expect(second.querySelector('[data-report="placeholder"]')).not.toBeNull();
    expect(second.querySelector('[data-fix]')).toBeNull();
  });

  it('sends only the rules still ticked', () => {
    const { onFix } = mount();
    act(() => host.querySelector<HTMLInputElement>('[data-fix="edge-space"]')!.click());
    act(() => fixButton()!.click());
    expect(onFix).toHaveBeenCalledWith([{ nodeId: '1:1', layerName: 'Hero', rules: ['double-space'] }]);
  });

  it('disables Fix when nothing is ticked', () => {
    mount();
    act(() => host.querySelector<HTMLInputElement>('[data-fix="edge-space"]')!.click());
    act(() => host.querySelector<HTMLInputElement>('[data-fix="double-space"]')!.click());
    expect(fixButton()?.disabled).toBe(true);
  });

  it('offers no Fix button when every finding is report-only', () => {
    mount([results[1]]);
    expect(fixButton()).toBeNull();
  });

  it('reports Show and Close', () => {
    const { onNavigate, onClose } = mount();
    act(() => host.querySelectorAll<HTMLElement>('[data-navigate]')[1].click());
    act(() => host.querySelector<HTMLElement>('[data-action="cancel"]')!.click());
    expect(onNavigate).toHaveBeenCalledWith('1:2');
    expect(onClose).toHaveBeenCalled();
  });
});
