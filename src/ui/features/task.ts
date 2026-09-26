import type { TaskKind } from '../../shared/types';
import { post } from '../post';
import { showStatus } from '../status';

/**
 * The UI's view of the one long task the sandbox runs at a time: what it is,
 * how far along, and whether the user asked it to stop. See
 * docs/superpowers/specs/2026-09-26-large-documents-design.md §5.
 *
 * While a task runs, the buttons that would start another are marked busy
 * (`data-busy` on <body>, styled in ui.html) and their handlers refuse. The
 * sandbox refuses a second task too; this keeps the user from reaching that.
 */

const LABELS: Record<TaskKind, string> = {
  extract: 'Extracting text layers...',
  search: 'Searching text layers...',
  plan: 'Checking what would change...',
  apply: 'Applying changes...',
  export: 'Exporting frames...',
  generate: 'Generating frames...',
};

let current: TaskKind | null = null;
let stopping = false;

function setBusyMarker(busy: boolean): void {
  document.body.toggleAttribute('data-busy', busy);
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function show(task: TaskKind, done?: number, total?: number): void {
  const progress =
    done !== undefined && total !== undefined && total > 0
      ? ` ${count(done)} of ${count(total)}`
      : '';
  // Apply is never stopped halfway (large-documents spec §6), so it offers no Stop.
  const action = task === 'apply' ? undefined : { label: 'Stop', onClick: requestStop };
  showStatus(LABELS[task] + progress, 'progress', [], action);
}

export function isBusy(): boolean {
  return current !== null;
}

export function beginTask(task: TaskKind): void {
  current = task;
  stopping = false;
  setBusyMarker(true);
  show(task);
}

export function reportProgress(task: TaskKind, done: number, total: number): void {
  // Late reports from a task already answered, or one being stopped, would
  // overwrite the answer or the "Stopping..." the user just asked for.
  if (current !== task || stopping) return;
  show(task, done, total);
}

export function requestStop(): void {
  if (current === null || current === 'apply' || stopping) return;
  stopping = true;
  post({ type: 'stop-task' });
  showStatus('Stopping...', 'progress');
}

/** The task's answer arrived, whatever it was. Leaves the status to the answer. */
export function endTask(): void {
  current = null;
  stopping = false;
  setBusyMarker(false);
}

export function taskStopped(): void {
  endTask();
  showStatus('Stopped. Nothing was changed.', 'info');
}
