import { describe, it, expect, vi } from 'vitest';
import { applyTextChanges, type ApplicableNode } from './apply';

/**
 * Seeded with `'old'` because that is the `before` text every change below
 * claims to replace — apply refuses to write a layer that no longer holds it.
 * Pass something else to stand in for a layer edited since the review.
 */
const node = (id: string, name: string, characters = 'old'): ApplicableNode => ({
  id,
  name,
  type: 'TEXT',
  characters,
});

describe('applyTextChanges', () => {
  it('writes characters and counts the update', async () => {
    const target = node('1:1', 'Title');
    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Title',
          before: 'old',
          after: 'new',
          source: 'import',
          accepted: true,
        },
      ],
      { getNode: async () => target, loadFonts: async () => {} }
    );

    expect(target.characters).toBe('new');
    expect(result).toEqual({ updated: 1, failed: 0, errors: [] });
  });

  it('leaves a layer edited since the review alone and says so', async () => {
    const edited = node('1:1', 'Title', 'edited on the canvas');
    const untouched = node('1:2', 'Body');

    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Title',
          before: 'old',
          after: 'new',
          source: 'import',
          accepted: true,
        },
        {
          nodeId: '1:2',
          layerName: 'Body',
          before: 'old',
          after: 'b',
          source: 'import',
          accepted: true,
        },
      ],
      {
        getNode: async (id) => (id === '1:1' ? edited : untouched),
        loadFonts: async () => {},
      }
    );

    // The edit the user made during review survives.
    expect(edited.characters).toBe('edited on the canvas');
    // And the rest of the batch still applies.
    expect(untouched.characters).toBe('b');
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      'Layer Title (1:1) changed since review; it was not updated.',
    ]);
  });

  it('never writes a change the user did not accept', async () => {
    const target = node('1:1', 'Title');
    const getNode = vi.fn(async () => target);

    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Title',
          before: 'old',
          after: 'new',
          source: 'import',
          accepted: false,
        },
      ],
      { getNode, loadFonts: async () => {} }
    );

    expect(target.characters).toBe('old');
    // Not even looked up: an unaccepted row is not a failure, it is not work.
    expect(getNode).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, failed: 0, errors: [] });
  });

  it('applies the accepted rows of a partly accepted batch', async () => {
    const yes = node('1:1', 'Yes');
    const no = node('1:2', 'No');

    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Yes',
          before: 'old',
          after: 'written',
          source: 'import',
          accepted: true,
        },
        {
          nodeId: '1:2',
          layerName: 'No',
          before: 'old',
          after: 'skipped',
          source: 'import',
          accepted: false,
        },
      ],
      {
        getNode: async (id) => (id === '1:1' ? yes : no),
        loadFonts: async () => {},
      }
    );

    expect(yes.characters).toBe('written');
    expect(no.characters).toBe('old');
    expect(result).toEqual({ updated: 1, failed: 0, errors: [] });
  });

  it('loads fonts before writing', async () => {
    const order: string[] = [];
    const target = node('1:1', 'Title');
    Object.defineProperty(target, 'characters', {
      // Reads the change's `before` text, so the write is not skipped.
      get: () => 'old',
      set: () => order.push('write'),
    });

    await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'T',
          before: 'old',
          after: 'x',
          source: 'import',
          accepted: true,
        },
      ],
      {
        getNode: async () => target,
        loadFonts: async () => {
          // Yield first: a fire-and-forget implementation would write the text
          // during this gap, so 'write' would land before 'fonts'.
          await Promise.resolve();
          order.push('fonts');
        },
      }
    );

    expect(order).toEqual(['fonts', 'write']);
  });

  it('reports a missing node without aborting the batch', async () => {
    const target = node('1:2', 'Body');
    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Gone',
          before: 'old',
          after: 'a',
          source: 'import',
          accepted: true,
        },
        {
          nodeId: '1:2',
          layerName: 'Body',
          before: 'old',
          after: 'b',
          source: 'import',
          accepted: true,
        },
      ],
      {
        getNode: async (id) => (id === '1:2' ? target : null),
        loadFonts: async () => {},
      }
    );

    expect(target.characters).toBe('b');
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('1:1');
  });

  it('reports a node that is no longer a text layer', async () => {
    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Shape',
          before: 'old',
          after: 'a',
          source: 'import',
          accepted: true,
        },
      ],
      {
        getNode: async () => ({ ...node('1:1', 'Shape'), type: 'RECTANGLE' }),
        loadFonts: async () => {},
      }
    );

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('not a text');
  });

  it('survives a font that will not load', async () => {
    const result = await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'T',
          before: 'old',
          after: 'a',
          source: 'import',
          accepted: true,
        },
      ],
      {
        getNode: async () => node('1:1', 'T'),
        loadFonts: async () => {
          throw new Error('font unavailable');
        },
      }
    );

    expect(result).toEqual({
      updated: 0,
      failed: 1,
      errors: ['Failed to update T: font unavailable'],
    });
  });

  it('caps the error list at five but keeps counting', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      nodeId: `1:${i}`,
      layerName: `L${i}`,
      before: 'old',
      after: 'x',
      source: 'import' as const,
      accepted: true,
    }));
    const result = await applyTextChanges(rows, {
      getNode: async () => null,
      loadFonts: async () => {},
    });

    expect(result.failed).toBe(9);
    expect(result.errors).toHaveLength(5);
  });

  it('does nothing for an empty change list', async () => {
    const getNode = vi.fn();
    const result = await applyTextChanges([], { getNode, loadFonts: async () => {} });

    expect(getNode).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, failed: 0, errors: [] });
  });
});

describe('applyTextChanges under a task control', () => {
  const change = (id: string) => ({
    nodeId: id,
    layerName: id,
    before: 'old',
    after: 'new',
    source: 'import' as const,
    accepted: true,
  });

  it('reports progress over the accepted rows only', async () => {
    const nodes = [node('1:1', 'A'), node('1:2', 'B')];
    const progress: Array<[number, number]> = [];
    await applyTextChanges([change('1:1'), { ...change('1:2'), accepted: false }], {
      getNode: async (id) => nodes.find((n) => n.id === id) ?? null,
      loadFonts: async () => {},
      control: {
        onProgress: (done, total) => progress.push([done, total]),
        isStopped: () => false,
        yieldToHost: async () => {},
        now: () => 0,
      },
    });
    expect(progress[progress.length - 1]).toEqual([1, 1]);
  });

  it('yields between slices and still writes every row', async () => {
    const nodes = [node('1:1', 'A'), node('1:2', 'B'), node('1:3', 'C')];
    let clock = 0;
    let yields = 0;
    const result = await applyTextChanges([change('1:1'), change('1:2'), change('1:3')], {
      getNode: async (id) => nodes.find((n) => n.id === id) ?? null,
      loadFonts: async () => {},
      control: {
        onProgress: () => {},
        isStopped: () => false,
        yieldToHost: async () => {
          yields++;
        },
        now: () => (clock += 100),
      },
    });
    expect(yields).toBeGreaterThan(0);
    expect(result.updated).toBe(3);
    expect(nodes.every((n) => n.characters === 'new')).toBe(true);
  });
});
