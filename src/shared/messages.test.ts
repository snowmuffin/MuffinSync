import { describe, it, expect } from 'vitest';
import { unwrapUiMessage, unwrapMainMessage } from './messages';

describe('unwrapUiMessage', () => {
  it('reads a bare message object', () => {
    expect(unwrapUiMessage({ type: 'cancel' })).toEqual({ type: 'cancel' });
  });

  it('reads a pluginMessage envelope', () => {
    expect(unwrapUiMessage({ pluginMessage: { type: 'cancel' } })).toEqual({
      type: 'cancel',
    });
  });

  it('reads a data.pluginMessage envelope', () => {
    expect(
      unwrapUiMessage({ data: { pluginMessage: { type: 'cancel' } } })
    ).toEqual({ type: 'cancel' });
  });

  it('keeps the payload of a typed message', () => {
    expect(unwrapUiMessage({ pluginMessage: { type: 'extract', scope: 'page' } }))
      .toEqual({ type: 'extract', scope: 'page' });
  });

  it('returns null for an unknown type', () => {
    expect(unwrapUiMessage({ type: 'nonsense' })).toBeNull();
  });

  it('returns null for junk', () => {
    expect(unwrapUiMessage(null)).toBeNull();
    expect(unwrapUiMessage('cancel')).toBeNull();
    expect(unwrapUiMessage({})).toBeNull();
  });

  it('rejects extract without a scope', () => {
    expect(unwrapUiMessage({ type: 'extract' })).toBeNull();
  });

  it('rejects extract with an unknown scope', () => {
    expect(unwrapUiMessage({ type: 'extract', scope: 'document' })).toBeNull();
  });

  const change = {
    nodeId: '1:1',
    layerName: 'Title',
    before: 'old',
    after: 'new',
    source: 'import',
    accepted: true,
  };

  it('accepts plan-import with well-formed rows', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'plan-import', rows })).toEqual({
      type: 'plan-import',
      rows,
    });
  });

  it('rejects plan-import without rows', () => {
    expect(unwrapUiMessage({ type: 'plan-import' })).toBeNull();
  });

  it('rejects plan-import whose rows are not layer records', () => {
    expect(unwrapUiMessage({ type: 'plan-import', rows: [{ id: 1 }] })).toBeNull();
    expect(unwrapUiMessage({ type: 'plan-import', rows: [{ id: '1:1', name: 'A' }] })).toBeNull();
    expect(unwrapUiMessage({ type: 'plan-import', rows: 'not an array' })).toBeNull();
  });

  it('accepts apply with well-formed changes', () => {
    expect(unwrapUiMessage({ type: 'apply', changes: [change] })).toEqual({
      type: 'apply',
      changes: [change],
    });
  });

  it('rejects apply whose changes are not proposals', () => {
    expect(unwrapUiMessage({ type: 'apply', changes: [{ nodeId: 1 }] })).toBeNull();
  });

  it('rejects apply without changes', () => {
    expect(unwrapUiMessage({ type: 'apply' })).toBeNull();
  });

  it('no longer recognises the old import message', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'import', rows })).toBeNull();
  });
});

describe('unwrapMainMessage', () => {
  it('reads a typed main message', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'no-text-found' } }))
      .toEqual({ type: 'no-text-found' });
  });

  it('returns null for a UI-bound type', () => {
    expect(unwrapMainMessage({ type: 'cancel' })).toBeNull();
  });

  it('rejects import-complete with missing counts', () => {
    expect(unwrapMainMessage({ type: 'import-complete', updated: 1 })).toBeNull();
  });

  it('rejects error without a message string', () => {
    expect(unwrapMainMessage({ type: 'error' })).toBeNull();
  });

  it('accepts an extracted message and keeps its rows', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapMainMessage({ pluginMessage: { type: 'extracted', rows } })).toEqual({
      type: 'extracted',
      rows,
    });
  });

  it('rejects extracted whose rows are not layer records', () => {
    expect(
      unwrapMainMessage({ pluginMessage: { type: 'extracted', rows: [{ id: 1 }] } })
    ).toBeNull();
    expect(
      unwrapMainMessage({ pluginMessage: { type: 'extracted', rows: [{ characters: 'x' }] } })
    ).toBeNull();
  });

  it('accepts an import-complete message and keeps its counts', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'import-complete',
          updated: 3,
          failed: 1,
          errors: ['boom'],
        },
      })
    ).toEqual({ type: 'import-complete', updated: 3, failed: 1, errors: ['boom'] });
  });

  it('accepts an error message and keeps its text', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'error', message: 'nope' } })).toEqual(
      { type: 'error', message: 'nope' }
    );
  });

  it('reads the envelope the UI actually receives at runtime', () => {
    // figma.ui.postMessage arrives in the iframe as event.data.pluginMessage.
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(
      unwrapMainMessage({ data: { pluginMessage: { type: 'extracted', rows } } })
    ).toEqual({ type: 'extracted', rows });
  });

  const change = {
    nodeId: '1:1',
    layerName: 'Title',
    before: 'old',
    after: 'new',
    source: 'import',
    accepted: true,
  };

  it('accepts a change-set and keeps its contents', () => {
    const changeSet = {
      changes: [change],
      blocked: [{ nodeId: '1:2', layerName: 'Gone', reason: 'missing' }],
      unchangedCount: 7,
      createdAt: 1700000000000,
    };
    expect(unwrapMainMessage({ pluginMessage: { type: 'change-set', changeSet } })).toEqual(
      { type: 'change-set', changeSet }
    );
  });

  it('rejects a change-set missing its counts', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'change-set',
          changeSet: { changes: [], blocked: [] },
        },
      })
    ).toBeNull();
  });

  it('rejects a change-set whose blocked reason is unknown', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'change-set',
          changeSet: {
            changes: [],
            blocked: [{ nodeId: '1:1', layerName: 'x', reason: 'banana' }],
            unchangedCount: 0,
            createdAt: 1,
          },
        },
      })
    ).toBeNull();
  });

  it('accepts a selection message reporting a present selection', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'selection', present: true } })).toEqual(
      { type: 'selection', present: true }
    );
  });

  it('accepts a selection message reporting no selection', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'selection', present: false } })).toEqual(
      { type: 'selection', present: false }
    );
  });

  it('rejects a selection message missing present', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'selection' } })).toBeNull();
  });

  it('rejects a selection message whose present is not a boolean', () => {
    expect(
      unwrapMainMessage({ pluginMessage: { type: 'selection', present: 'yes' } })
    ).toBeNull();
  });
});
