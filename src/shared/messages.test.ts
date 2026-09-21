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

  it('rejects import without rows', () => {
    expect(unwrapUiMessage({ type: 'import' })).toBeNull();
  });

  it('rejects import whose rows are not layer records', () => {
    expect(unwrapUiMessage({ type: 'import', rows: [{ id: 1 }] })).toBeNull();
  });

  it('accepts import with well-formed rows', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'import', rows })).toEqual({ type: 'import', rows });
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
});
