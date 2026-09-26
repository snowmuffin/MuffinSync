import { describe, expect, it } from 'vitest';
import { runChunked, type TaskControl } from './chunked';

/**
 * A fake clock that advances `step` ms per item processed, so a budget of
 * `budget` gives slices of exactly `budget / step` items.
 */
function harness(opts: { step?: number; stopAfterYields?: number } = {}) {
  const step = opts.step ?? 10;
  let clock = 0;
  let yields = 0;
  const progress: Array<[number, number]> = [];
  const control: TaskControl = {
    onProgress: (done, total) => progress.push([done, total]),
    isStopped: () => opts.stopAfterYields !== undefined && yields >= opts.stopAfterYields,
    yieldToHost: async () => {
      yields++;
    },
    now: () => clock,
  };
  const tick = () => {
    clock += step;
  };
  return { control, progress, tick, yields: () => yields };
}

describe('runChunked', () => {
  it('processes every item once, in order', async () => {
    const { control, tick } = harness();
    const seen: number[] = [];
    const outcome = await runChunked([1, 2, 3, 4, 5], (item) => {
      seen.push(item);
      tick();
    }, control, 20);
    expect(outcome).toBe('done');
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('yields and reports progress each time a slice uses up its budget', async () => {
    const { control, progress, tick, yields } = harness({ step: 10 });
    await runChunked([1, 2, 3, 4, 5], () => tick(), control, 20);
    // Two items per 20 ms slice: yields after 2 and 4, then the final report.
    expect(yields()).toBe(2);
    expect(progress).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);
  });

  it('does not yield after the last item', async () => {
    const { control, tick, yields } = harness({ step: 10 });
    await runChunked([1, 2], () => tick(), control, 20);
    expect(yields()).toBe(0);
  });

  it('stops at the next slice boundary once stop is requested', async () => {
    const { control, tick } = harness({ step: 10, stopAfterYields: 1 });
    const seen: number[] = [];
    const outcome = await runChunked([1, 2, 3, 4, 5], (item) => {
      seen.push(item);
      tick();
    }, control, 20);
    expect(outcome).toBe('stopped');
    expect(seen).toEqual([1, 2]);
  });

  it('does nothing when stop was requested before it started', async () => {
    const { control } = harness({ stopAfterYields: 0 });
    const seen: number[] = [];
    expect(await runChunked([1, 2], (item) => void seen.push(item), control)).toBe('stopped');
    expect(seen).toEqual([]);
  });

  it('awaits asynchronous work before moving on', async () => {
    const { control } = harness();
    const order: string[] = [];
    await runChunked(['a', 'b'], async (item) => {
      await Promise.resolve();
      order.push(item);
    }, control);
    expect(order).toEqual(['a', 'b']);
  });

  it('reports completion for an empty list', async () => {
    const { control, progress } = harness();
    expect(await runChunked([], () => {}, control)).toBe('done');
    expect(progress).toEqual([[0, 0]]);
  });

  it('passes each item its index', async () => {
    const { control } = harness();
    const indexes: number[] = [];
    await runChunked(['x', 'y', 'z'], (_, index) => void indexes.push(index), control);
    expect(indexes).toEqual([0, 1, 2]);
  });
});
