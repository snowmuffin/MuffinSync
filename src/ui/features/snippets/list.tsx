import { useState } from 'preact/hooks';
import type { Snippet } from '../../../shared/generate';

export interface SnippetListProps {
  snippets: Snippet[];
  onSave(name: string, text: string): void;
  onDelete(id: string): void;
  onApply(snippet: Snippet): void;
  onAddLayer(snippet: Snippet): void;
}

/**
 * Pure: the snippet library's form and list. Reports decisions and sends
 * nothing; `index.ts` turns them into messages. Saved snippets live in
 * figma.clientStorage, per user on this device (local features spec §5).
 */
export function SnippetList({ snippets, onSave, onDelete, onApply, onAddLayer }: SnippetListProps) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  const save = (event: Event) => {
    event.preventDefault();
    if (text === '') return;
    onSave(name.trim() || text.slice(0, 30), text);
    setName('');
    setText('');
  };

  return (
    <div>
      <form class="section" onSubmit={save} data-snippet-form="">
        <div class="section-title">New snippet</div>
        <label class="field-label" for="snippet-name">Name</label>
        <input
          id="snippet-name"
          class="text-input"
          type="text"
          placeholder="e.g. Legal footer"
          value={name}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
        <label class="field-label" for="snippet-text">Text</label>
        <textarea
          id="snippet-text"
          class="text-input snippet-text"
          rows={3}
          value={text}
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
        />
        <button class="button primary" type="submit" disabled={text === ''}>
          Save snippet
        </button>
      </form>

      <div class="section">
        <div class="section-title">Saved ({snippets.length})</div>
        {snippets.length === 0 && <div class="instruction">No snippets yet. They are saved on this device.</div>}
        {snippets.map((snippet) => (
          <div class="snippet-row" data-snippet={snippet.id} key={snippet.id}>
            <div class="snippet-name">{snippet.name}</div>
            <div class="snippet-preview">{snippet.text}</div>
            <div class="snippet-actions">
              <button type="button" class="results-row-navigate" data-snippet-apply="" onClick={() => onApply(snippet)}>
                Apply to selection
              </button>
              <button type="button" class="results-row-navigate" data-snippet-add="" onClick={() => onAddLayer(snippet)}>
                Add as layer
              </button>
              <button type="button" class="results-row-navigate" data-snippet-delete="" onClick={() => onDelete(snippet.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
