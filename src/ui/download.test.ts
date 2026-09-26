import { describe, it, expect } from 'vitest';
import { filenameFor, mimeTypeFor, safeFileName } from './download';

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

describe('mimeTypeFor, every kind', () => {
  it('names the Office, EPUB, Markdown, PDF and ZIP types', () => {
    expect(mimeTypeFor('xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(mimeTypeFor('docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(mimeTypeFor('epub')).toBe('application/epub+zip');
    expect(mimeTypeFor('md')).toBe('text/markdown');
    expect(mimeTypeFor('pdf')).toBe('application/pdf');
    expect(mimeTypeFor('zip')).toBe('application/zip');
  });
});

describe('safeFileName', () => {
  it('replaces characters file systems reject', () => {
    expect(safeFileName('Home / Hero: v2?')).toBe('Home - Hero- v2-');
  });

  it('keeps non-ASCII names', () => {
    expect(safeFileName('홈 화면')).toBe('홈 화면');
  });

  it('falls back to untitled for an empty name', () => {
    expect(safeFileName('   ')).toBe('untitled');
  });
});
