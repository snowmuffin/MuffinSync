// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'preact/test-utils';
import { mountStatus, showStatus } from './status';

describe('status banner', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    // Preact batches updates, so every render must be flushed before asserting.
    act(() => {
      mountStatus(host);
    });
  });

  it('renders nothing before any status', () => {
    expect(host.innerHTML).toBe('');
  });

  it('renders the message with its kind as a class', () => {
    act(() => {
      showStatus('hello', 'success');
    });
    expect(host.innerHTML).toBe('<div class="status success">hello</div>');
  });

  it('separates detail lines from the message and from each other', () => {
    act(() => {
      showStatus('Updated 0 text layers. (2 errors)', 'error', ['one', 'two']);
    });
    expect(host.innerHTML).toBe(
      '<div class="status error">Updated 0 text layers. (2 errors)' +
        '<br><small>one<br>two</small></div>'
    );
  });

  it('renders no separator when there are no details', () => {
    act(() => {
      showStatus('plain', 'info');
    });
    expect(host.innerHTML).toBe('<div class="status info">plain</div>');
  });
});
