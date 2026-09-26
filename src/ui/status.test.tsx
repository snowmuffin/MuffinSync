// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('renders an action as a button that calls back when pressed', () => {
    let pressed = 0;
    act(() => {
      showStatus('Searching...', 'progress', [], { label: 'Stop', onClick: () => pressed++ });
    });
    const button = host.querySelector<HTMLButtonElement>('button.status-action');
    expect(button?.textContent).toBe('Stop');
    act(() => button!.click());
    expect(pressed).toBe(1);
  });

  describe('lifetime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('takes an info message down after a few seconds', () => {
      act(() => {
        showStatus('Review cancelled.', 'info');
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(host.innerHTML).toBe('');
    });

    it('keeps a progress message up however long the work takes', () => {
      act(() => {
        showStatus('Searching text layers...', 'progress');
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(host.innerHTML).toBe('<div class="status info">Searching text layers...</div>');
    });

    it('lets the answer replace a progress message', () => {
      act(() => {
        showStatus('Searching text layers...', 'progress');
      });
      act(() => {
        showStatus('No layers matched your search.', 'info');
      });
      expect(host.textContent).toBe('No layers matched your search.');
    });

    it('does not let an earlier info timer take down a later progress message', () => {
      act(() => {
        showStatus('Review cancelled.', 'info');
      });
      act(() => {
        vi.advanceTimersByTime(2000);
        showStatus('Applying changes...', 'progress');
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(host.textContent).toBe('Applying changes...');
    });
  });
});
