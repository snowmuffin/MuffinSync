// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';

vi.mock('../post', () => ({ post: vi.fn() }));

import { post } from '../post';
import { mountStatus } from '../status';
import { initImport, parseImportText } from './import';
import { endTask } from './task';

describe('parseImportText', () => {
  it('reads JSON when the text starts with a bracket', () => {
    expect(parseImportText('  [{"id":"1:1","name":"A","characters":"x"}]')).toEqual([
      { id: '1:1', name: 'A', characters: 'x' },
    ]);
  });

  it('reads CSV otherwise', () => {
    expect(parseImportText('id,name,characters\n1:1,A,x')).toEqual([{ id: '1:1', name: 'A', characters: 'x' }]);
  });

  it('asks for something when the box is empty', () => {
    expect(() => parseImportText('  ')).toThrow('Paste the JSON or CSV to import first.');
  });
});

describe('paste to import', () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    document.body.innerHTML = `
      <input type="file" id="file-input" /><button id="import-btn"></button>
      <button id="paste-toggle-btn"></button>
      <div id="paste-area" class="hidden"><textarea id="paste-input"></textarea><button id="paste-import-btn"></button></div>
      <div id="status-host"></div>`;
    act(() => mountStatus(document.getElementById('status-host')!));
    endTask();
    initImport(document);
  });

  const paste = (text: string) => {
    (document.getElementById('paste-input') as HTMLTextAreaElement).value = text;
    act(() => document.getElementById('paste-import-btn')!.click());
  };

  it('shows the paste box on demand', () => {
    document.getElementById('paste-toggle-btn')!.click();
    expect(document.getElementById('paste-area')!.classList.contains('hidden')).toBe(false);
  });

  it('plans pasted rows exactly as a chosen file would be', () => {
    paste('[{"id":"1:1","name":"A","characters":"x"}]');
    expect(post).toHaveBeenCalledWith({ type: 'plan-import', rows: [{ id: '1:1', name: 'A', characters: 'x' }] });
  });

  it('refuses pasted rows that name a layer twice', () => {
    paste('id,name,characters\n1:1,A,x\n1:1,A,y');
    expect(post).not.toHaveBeenCalled();
    expect(document.getElementById('status-host')!.textContent).toContain('these ids repeat: 1:1');
  });

  it('says what is wrong with unreadable text', () => {
    paste('[not json');
    expect(document.getElementById('status-host')!.textContent).toContain('Paste reading error: The file is not valid JSON.');
  });
});
