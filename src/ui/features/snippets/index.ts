import { h, render } from 'preact';
import type { Snippet } from '../../../shared/generate';
import { SnippetList } from './list';
import { post } from '../../post';
import { byId } from '../../dom';
import { beginTask, isBusy } from '../task';

/**
 * Wires the snippet library to the sandbox. The sandbox's stored list is the
 * source of truth: every save or delete sends the whole new list and the
 * sandbox answers with what it stored, which is what is rendered. No JSX here;
 * this file keeps the `.ts` extension.
 */

let current: Snippet[] = [];

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function draw(): void {
  const host = byId('snippets-host');
  if (!host) return;
  render(
    h(SnippetList, {
      snippets: current,
      onSave: (name, text) =>
        post({ type: 'save-snippets', snippets: [...current, { id: newId(), name, text }] }),
      onDelete: (id) => post({ type: 'save-snippets', snippets: current.filter((s) => s.id !== id) }),
      onApply: (snippet) => {
        if (isBusy()) return;
        beginTask('plan');
        post({ type: 'plan-snippet', text: snippet.text });
      },
      onAddLayer: (snippet) => post({ type: 'add-snippet-layer', name: snippet.name, text: snippet.text }),
    }),
    host
  );
}

export function showSnippets(snippets: Snippet[]): void {
  current = snippets;
  draw();
}

/** Renders the (empty) library and asks the sandbox for the stored one. */
export function initSnippets(): void {
  current = [];
  draw();
  post({ type: 'get-snippets' });
}
