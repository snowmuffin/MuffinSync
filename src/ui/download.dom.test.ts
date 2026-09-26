// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { displayDownloadContent } from './download';

describe('the manual download fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="export-section"></div>';
  });

  it('shows layer text as text, never as markup', () => {
    const hostile = 'Hi</textarea><img id="injected" src=x onerror="alert(1)">';
    displayDownloadContent(hostile, 'name<b id="bold">.csv', 'csv');
    const textarea = document.getElementById('manual-content') as HTMLTextAreaElement;
    expect(textarea.value).toBe(hostile);
    expect(document.getElementById('injected')).toBeNull();
    expect(document.getElementById('bold')).toBeNull();
    expect(document.querySelector('#manual-download code')?.textContent).toBe('name<b id="bold">.csv');
  });

  it('replaces an earlier fallback rather than stacking another', () => {
    displayDownloadContent('one', 'a.csv', 'csv');
    displayDownloadContent('two', 'b.csv', 'csv');
    expect(document.querySelectorAll('#manual-download')).toHaveLength(1);
  });
});
