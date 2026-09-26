/**
 * Long document work runs in time slices. After each slice the sandbox hands
 * control back to Figma so the canvas and the panel can repaint and messages
 * can arrive, reports how far it has got, and checks whether the user asked
 * it to stop. See docs/superpowers/specs/2026-09-26-large-documents-design.md §4.
 *
 * A slice is bounded by time, not by a count of items: the cost of one item
 * varies by file and machine, and a time budget needs no tuning to hold.
 */

/** Roughly two frames: long enough to get work done, short enough not to stall. */
export const SLICE_BUDGET_MS = 25;

export interface TaskControl {
  /** Called at the end of every slice, and once when the work completes. */
  onProgress(done: number, total: number): void;
  /** True once the user has asked to stop. Checked only between slices. */
  isStopped(): boolean;
  /** Hands control back to Figma. Injected so tests run instantly. */
  yieldToHost(): Promise<void>;
  /** Milliseconds, monotonic enough to measure a slice. */
  now(): number;
}

export type ChunkedOutcome = 'done' | 'stopped';

/**
 * Run `work` over every item in order, slicing by `SLICE_BUDGET_MS`.
 *
 * Stopping takes effect at the next slice boundary; an item already started is
 * finished. `work` may be synchronous -- a returned promise is awaited, a plain
 * return is not, so a cheap synchronous loop does not pay a microtask per item.
 */
export async function runChunked<T>(
  items: ReadonlyArray<T>,
  work: (item: T, index: number) => void | Promise<void>,
  control: TaskControl,
  budgetMs: number = SLICE_BUDGET_MS
): Promise<ChunkedOutcome> {
  const total = items.length;
  if (control.isStopped()) return 'stopped';

  let sliceStart = control.now();
  for (let index = 0; index < total; index++) {
    const result = work(items[index], index);
    // A `then` check rather than `instanceof Promise`, which fails for a
    // promise made in another realm (a test harness running the bundle in a vm).
    if (result && typeof (result as Promise<void>).then === 'function') await result;

    const done = index + 1;
    if (done < total && control.now() - sliceStart >= budgetMs) {
      control.onProgress(done, total);
      await control.yieldToHost();
      if (control.isStopped()) return 'stopped';
      sliceStart = control.now();
    }
  }
  control.onProgress(total, total);
  return 'done';
}

/** A control for work that must not be interrupted and reports to no one. */
export const UNSTOPPABLE_SILENT: TaskControl = {
  onProgress: () => {},
  isStopped: () => false,
  yieldToHost: () => Promise.resolve(),
  now: () => 0,
};
