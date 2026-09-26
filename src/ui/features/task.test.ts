// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';

vi.mock('../post', () => ({ post: vi.fn() }));

import { post } from '../post';
import { mountStatus } from '../status';
import { beginTask, endTask, isBusy, reportProgress, requestStop, taskStopped } from './task';

const status = () => document.getElementById('status-host')!;
const stopButton = () => status().querySelector<HTMLButtonElement>('.status-action');

describe('task tracking', () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    document.body.innerHTML = '<div id="status-host"></div>';
    act(() => {
      mountStatus(status());
      endTask();
    });
  });

  it('marks the panel busy while a task runs, and idle once it is answered', () => {
    act(() => beginTask('search'));
    expect(isBusy()).toBe(true);
    expect(document.body.hasAttribute('data-busy')).toBe(true);

    act(() => endTask());
    expect(isBusy()).toBe(false);
    expect(document.body.hasAttribute('data-busy')).toBe(false);
  });

  it('says what is running before any progress arrives', () => {
    act(() => beginTask('extract'));
    expect(status().textContent).toContain('Extracting text layers...');
  });

  it('shows how far along the task is, with thousands separated', () => {
    act(() => beginTask('search'));
    act(() => reportProgress('search', 4200, 20000));
    expect(status().textContent).toContain('Searching text layers... 4,200 of 20,000');
  });

  it('ignores progress for a task that is not the one running', () => {
    act(() => beginTask('search'));
    act(() => reportProgress('extract', 1, 2));
    expect(status().textContent).not.toContain('1 of 2');
  });

  it('offers Stop on extract, search and plan', () => {
    for (const task of ['extract', 'search', 'plan'] as const) {
      act(() => beginTask(task));
      expect(stopButton()?.textContent).toBe('Stop');
      act(() => endTask());
    }
  });

  it('offers no Stop on apply, which always runs to the end', () => {
    act(() => beginTask('apply'));
    act(() => reportProgress('apply', 10, 100));
    expect(stopButton()).toBeNull();
  });

  it('asks the sandbox to stop and says it is stopping', () => {
    act(() => beginTask('search'));
    act(() => stopButton()!.click());
    expect(post).toHaveBeenCalledWith({ type: 'stop-task' });
    expect(status().textContent).toBe('Stopping...');
  });

  it('does not let a late progress report overwrite "Stopping..."', () => {
    act(() => beginTask('search'));
    act(() => requestStop());
    act(() => reportProgress('search', 5, 10));
    expect(status().textContent).toBe('Stopping...');
  });

  it('asks only once however often Stop is pressed', () => {
    act(() => beginTask('search'));
    act(() => {
      requestStop();
      requestStop();
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('never asks to stop an apply', () => {
    act(() => beginTask('apply'));
    act(() => requestStop());
    expect(post).not.toHaveBeenCalled();
  });

  it('reports a stopped task as having changed nothing, and goes idle', () => {
    act(() => beginTask('plan'));
    act(() => taskStopped());
    expect(isBusy()).toBe(false);
    expect(status().textContent).toBe('Stopped. Nothing was changed.');
  });
});
