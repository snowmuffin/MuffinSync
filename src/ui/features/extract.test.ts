import { describe, expect, it } from 'vitest';
import { exportContent } from './extract';
import { readStoredZip } from '../format/read-zip';

const rows = [{ id: '1:1', name: 'Title', characters: 'Hello', frame: 'Home' }];

describe('exportContent', () => {
  it('writes CSV and JSON as text, without the frame column', () => {
    expect(exportContent(rows, 'csv')).toBe('id,name,characters\n1:1,Title,Hello');
    expect(JSON.parse(exportContent(rows, 'json') as string)).toEqual([
      { id: '1:1', name: 'Title', characters: 'Hello' },
    ]);
  });

  it('writes Markdown as text', () => {
    expect(exportContent(rows, 'md')).toContain('## Home');
  });

  it('writes XLSX, DOCX and EPUB as ZIP bytes', () => {
    for (const format of ['xlsx', 'docx', 'epub'] as const) {
      const content = exportContent(rows, format);
      expect(content).toBeInstanceOf(Uint8Array);
      expect(readStoredZip(content as Uint8Array).size).toBeGreaterThan(0);
    }
  });
});
