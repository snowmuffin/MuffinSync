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
});

describe('unwrapMainMessage', () => {
  it('reads a typed main message', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'no-text-found' } }))
      .toEqual({ type: 'no-text-found' });
  });

  it('returns null for a UI-bound type', () => {
    expect(unwrapMainMessage({ type: 'cancel' })).toBeNull();
  });
});
