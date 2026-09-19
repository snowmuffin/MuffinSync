import { describe, it, expect } from 'vitest';
import { isExportFormat } from './types';

describe('isExportFormat', () => {
  it('accepts the two supported formats', () => {
    expect(isExportFormat('csv')).toBe(true);
    expect(isExportFormat('json')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isExportFormat('xlsx')).toBe(false);
    expect(isExportFormat('')).toBe(false);
  });
});
