import { describe, it, expect, vi } from 'vitest';
import { applyTextChanges, type ApplicableNode } from './apply';

const node = (id: string, name: string): ApplicableNode => ({
  id,
  name,
  type: 'TEXT',
  characters: '',
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

  it('writes the after text, not the before text', async () => {
    const target = node('1:1', 'Title');
    await applyTextChanges(
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
  });

  it('loads fonts before writing', async () => {
    const order: string[] = [];
    const target = node('1:1', 'Title');
    Object.defineProperty(target, 'characters', {
      set: () => order.push('write'),
      get: () => '',
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
