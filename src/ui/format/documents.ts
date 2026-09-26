import type { TextLayerData } from '../../shared/types';
import { writeZip } from './zip';

/**
 * Text exports for reading and sharing rather than round-tripping: XLSX, DOCX,
 * Markdown and EPUB. Each groups layers under their top-level frame. CSV and
 * JSON stay the round-trip formats; nothing here is read back by import.
 * See docs/superpowers/specs/2026-09-26-local-features-design.md §4.
 */

export interface FrameGroup {
  frame: string;
  rows: TextLayerData[];
}

/** Used for layers that sit directly on the page, outside any frame. */
export const NO_FRAME = 'Loose layers';

/** Groups rows by frame, in the order each frame first appears. */
export function groupByFrame(rows: ReadonlyArray<TextLayerData>): FrameGroup[] {
  const groups = new Map<string, TextLayerData[]>();
  for (const row of rows) {
    const frame = row.frame || NO_FRAME;
    const group = groups.get(frame);
    if (group) group.push(row);
    else groups.set(frame, [row]);
  }
  return Array.from(groups, ([frame, grouped]) => ({ frame, rows: grouped }));
}

/**
 * Escapes text for XML, and drops the control characters XML 1.0 cannot carry
 * at all -- a stray one would make Word or Excel refuse the whole file.
 */
export function xml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// --- Markdown ---------------------------------------------------------------

export function toMarkdown(rows: ReadonlyArray<TextLayerData>, title = 'Text layers'): string {
  const out = [`# ${title}`, ''];
  for (const group of groupByFrame(rows)) {
    out.push(`## ${group.frame}`, '');
    for (const row of group.rows) {
      // A single newline inside a paragraph is not a break in Markdown; two
      // trailing spaces make it one, so multi-line layers keep their lines.
      out.push(row.characters.split(/\r\n|\r|\n/).join('  \n'), '');
    }
  }
  return out.join('\n');
}

// --- XLSX -------------------------------------------------------------------

function column(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function cell(ref: string, value: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

export function toXLSX(rows: ReadonlyArray<TextLayerData>, now?: Date): Uint8Array {
  const table = [
    ['Frame', 'Layer', 'Text', 'ID'],
    ...rows.map((row) => [row.frame || NO_FRAME, row.name, row.characters, row.id]),
  ];
  const sheetRows = table
    .map(
      (values, r) =>
        `<row r="${r + 1}">${values.map((value, c) => cell(`${column(c)}${r + 1}`, value)).join('')}</row>`
    )
    .join('');

  return writeZip(
    [
      {
        name: '[Content_Types].xml',
        data:
          XML_HEAD +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
      },
      {
        name: '_rels/.rels',
        data:
          XML_HEAD +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      },
      {
        name: 'xl/workbook.xml',
        data:
          XML_HEAD +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="Text layers" sheetId="1" r:id="rId1"/></sheets></workbook>',
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data:
          XML_HEAD +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
      },
      {
        name: 'xl/worksheets/sheet1.xml',
        data:
          XML_HEAD +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          `<sheetData>${sheetRows}</sheetData></worksheet>`,
      },
    ],
    now
  );
}

// --- DOCX -------------------------------------------------------------------

/** A run of text, with line breaks inside a layer kept as breaks. */
function runs(text: string, props = ''): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line, i) => `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t>`)
    .reduce((acc, part) => acc + part, `<w:r>${props}`) + '</w:r>';
}

export function toDOCX(rows: ReadonlyArray<TextLayerData>, now?: Date): Uint8Array {
  const heading = '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>';
  const body = groupByFrame(rows)
    .map(
      (group) =>
        `<w:p>${runs(group.frame, heading)}</w:p>` +
        group.rows.map((row) => `<w:p>${runs(row.characters)}</w:p>`).join('')
    )
    .join('');

  return writeZip(
    [
      {
        name: '[Content_Types].xml',
        data:
          XML_HEAD +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>',
      },
      {
        name: '_rels/.rels',
        data:
          XML_HEAD +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>',
      },
      {
        name: 'word/document.xml',
        data:
          XML_HEAD +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          `<w:body>${body}<w:sectPr/></w:body></w:document>`,
      },
    ],
    now
  );
}

// --- EPUB -------------------------------------------------------------------

function xhtml(title: string, body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    `<head><meta charset="UTF-8"/><title>${xml(title)}</title></head><body>${body}</body></html>`
  );
}

function paragraph(text: string): string {
  return `<p>${text.split(/\r\n|\r|\n/).map(xml).join('<br/>')}</p>`;
}

export interface EpubOptions {
  title?: string;
  /** A stable id for the book; random when omitted. */
  id?: string;
  now?: Date;
}

function randomId(): string {
  // crypto.randomUUID needs a secure context, which the plugin's null-origin
  // iframe may not be; uniqueness is all an EPUB identifier needs.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toEPUB(rows: ReadonlyArray<TextLayerData>, options: EpubOptions = {}): Uint8Array {
  const title = options.title ?? 'Text layers';
  const now = options.now ?? new Date();
  const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const groups = groupByFrame(rows);
  const chapters = groups.map((group, i) => ({
    file: `chapter-${i + 1}.xhtml`,
    group,
  }));

  const manifest = chapters
    .map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`)
    .join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  const toc = chapters
    .map((c) => `<li><a href="${c.file}">${xml(c.group.frame)}</a></li>`)
    .join('');

  return writeZip(
    [
      // Must be first and uncompressed: readers identify the file by it.
      { name: 'mimetype', data: 'application/epub+zip' },
      {
        name: 'META-INF/container.xml',
        data:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
          '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
          '</container>',
      },
      {
        name: 'OEBPS/content.opf',
        data:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">' +
          '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
          `<dc:identifier id="book-id">urn:uuid:${options.id ?? randomId()}</dc:identifier>` +
          `<dc:title>${xml(title)}</dc:title>` +
          '<dc:language>und</dc:language>' +
          `<meta property="dcterms:modified">${modified}</meta>` +
          '</metadata>' +
          `<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest>` +
          `<spine>${spine}</spine></package>`,
      },
      {
        name: 'OEBPS/nav.xhtml',
        data: xhtml(title, `<nav epub:type="toc"><h1>${xml(title)}</h1><ol>${toc}</ol></nav>`),
      },
      ...chapters.map((c) => ({
        name: `OEBPS/${c.file}`,
        data: xhtml(
          c.group.frame,
          `<h1>${xml(c.group.frame)}</h1>${c.group.rows.map((row) => paragraph(row.characters)).join('')}`
        ),
      })),
    ],
    now
  );
}
