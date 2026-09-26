import { describe, expect, it } from 'vitest';
import { groupByFrame, NO_FRAME, toDOCX, toEPUB, toMarkdown, toXLSX, xml } from './documents';
import { readStoredZip } from './read-zip';

const decoder = new TextDecoder();
const rows = [
  { id: '1:1', name: 'Title', characters: 'Hello & <world>', frame: 'Home' },
  { id: '2:1', name: 'Loose', characters: 'on the page' },
  { id: '1:2', name: 'Body', characters: 'line one\nline two', frame: 'Home' },
];
const text = (zip: Uint8Array, name: string) => decoder.decode(readStoredZip(zip).get(name));

describe('groupByFrame', () => {
  it('groups by frame in first-appearance order, loose layers under their own heading', () => {
    expect(groupByFrame(rows).map((g) => [g.frame, g.rows.map((r) => r.id)])).toEqual([
      ['Home', ['1:1', '1:2']],
      [NO_FRAME, ['2:1']],
    ]);
  });
});

describe('xml', () => {
  it('escapes the five XML specials', () => {
    expect(xml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  it('drops control characters XML cannot carry, keeping tabs and newlines', () => {
    expect(xml('a\u0001b\tc\nd')).toBe('ab\tc\nd');
  });
});

describe('toMarkdown', () => {
  it('writes a heading per frame and keeps line breaks inside a layer', () => {
    expect(toMarkdown(rows)).toBe(
      ['# Text layers', '', '## Home', '', 'Hello & <world>', '', 'line one  \nline two', '', `## ${NO_FRAME}`, '', 'on the page', ''].join('\n')
    );
  });
});

describe('toXLSX', () => {
  it('writes one row per layer under a header, escaped', () => {
    const sheet = text(toXLSX(rows), 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Frame</t>');
    expect(sheet).toContain('Hello &amp; &lt;world&gt;');
    expect(sheet.match(/<row /g)).toHaveLength(4);
  });

  it('includes the parts Excel needs to open it', () => {
    const files = readStoredZip(toXLSX(rows));
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels']) {
      expect(files.has(part)).toBe(true);
    }
  });
});

describe('toDOCX', () => {
  it('writes frame headings and one paragraph per layer, with breaks for newlines', () => {
    const doc = text(toDOCX(rows), 'word/document.xml');
    expect(doc).toContain('<w:b/>');
    expect(doc).toContain('line one</w:t><w:br/><w:t xml:space="preserve">line two');
    expect(doc.match(/<w:p>/g)).toHaveLength(5);
  });
});

describe('toEPUB', () => {
  const epub = toEPUB(rows, { title: 'Test', id: 'fixed', now: new Date('2026-09-26T01:02:03.456Z') });

  it('puts mimetype first, as readers require', () => {
    const names = Array.from(readStoredZip(epub).keys());
    expect(names[0]).toBe('mimetype');
    expect(text(epub, 'mimetype')).toBe('application/epub+zip');
  });

  it('writes one chapter per frame, listed in the table of contents', () => {
    const nav = text(epub, 'OEBPS/nav.xhtml');
    expect(nav).toContain('<a href="chapter-1.xhtml">Home</a>');
    expect(nav).toContain(`<a href="chapter-2.xhtml">${NO_FRAME}</a>`);
    expect(text(epub, 'OEBPS/chapter-1.xhtml')).toContain('<p>line one<br/>line two</p>');
  });

  it('records the id and a modified time without milliseconds', () => {
    const opf = text(epub, 'OEBPS/content.opf');
    expect(opf).toContain('urn:uuid:fixed');
    expect(opf).toContain('<meta property="dcterms:modified">2026-09-26T01:02:03Z</meta>');
  });
});
