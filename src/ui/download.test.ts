import { describe, it, expect } from 'vitest';
import { filenameFor, mimeTypeFor } from './download';

describe('filenameFor', () => {
  const when = new Date('2026-09-19T14:30:00Z');

  it('names CSV exports with a sortable timestamp', () => {
    expect(filenameFor('csv', when)).toBe('figma-text-layers-2026-09-19.csv');
  });

  it('names JSON exports the same way', () => {
    expect(filenameFor('json', when)).toBe('figma-text-layers-2026-09-19.json');
  });
});

describe('mimeTypeFor', () => {
  it('maps each format', () => {
    expect(mimeTypeFor('csv')).toBe('text/csv');
    expect(mimeTypeFor('json')).toBe('application/json');
  });
});
