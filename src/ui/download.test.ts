import { describe, it, expect } from 'vitest';
import { filenameFor, mimeTypeFor } from './download';

describe('filenameFor', () => {
  it('names CSV exports with the epoch timestamp', () => {
    expect(filenameFor('csv', new Date(1700000000000))).toBe(
      'figma-text-layers-1700000000000.csv'
    );
  });

  it('names JSON exports the same way', () => {
    expect(filenameFor('json', new Date(1700000000000))).toBe(
      'figma-text-layers-1700000000000.json'
    );
  });

  it('takes the timestamp from the date it is given, not from now', () => {
    expect(filenameFor('csv', new Date(1))).toBe('figma-text-layers-1.csv');
  });
});

describe('mimeTypeFor', () => {
  it('maps each format', () => {
    expect(mimeTypeFor('csv')).toBe('text/csv');
    expect(mimeTypeFor('json')).toBe('application/json');
  });
});
