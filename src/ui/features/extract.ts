import type { ExportFormat, TextLayerData } from '../../shared/types';
import { toCSV } from '../format/csv';
import { toJSON } from '../format/json';
import { toDOCX, toEPUB, toMarkdown, toXLSX } from '../format/documents';
import { writeZip } from '../format/zip';
import { byId, debugLog, messageOf } from '../dom';
import { showStatus } from '../status';
import { attemptDownload, filenameFor, mimeTypeFor, safeFileName } from '../download';
import { post } from '../post';
import { getIncludeHidden, getScope } from './scope';
import { beginTask, isBusy } from './task';

/**
 * There is no format choice before extracting: the format is picked by which
 * download button is pressed afterwards. A CSV/JSON selector used to sit above
 * the Extract button, but nothing read it -- the user chose twice and only the
 * second choice counted.
 */
export function initExtract(root: Document): void {
  byId('extract-btn', root)?.addEventListener('click', () => {
    if (isBusy()) return;
    debugLog('Text extraction started');
    beginTask('extract');
    post({ type: 'extract', scope: getScope(), includeHidden: getIncludeHidden() });
  });

  // Frames to PDF: the selected frames, or every top-level frame on the page.
  byId('export-pdf-btn', root)?.addEventListener('click', () => {
    if (isBusy()) return;
    beginTask('export');
    post({ type: 'export-pdf' });
  });
}

export function showExportedData(data: TextLayerData[]): void {
  const exportSection = byId('export-section');
  if (!exportSection) return;

  // Show the export section
  exportSection.classList.remove('hidden');

  // One button per format; each reads its format from `data-download`.
  exportSection.querySelectorAll<HTMLElement>('[data-download]').forEach((button) => {
    const format = button.dataset.download;
    if (format && isExportFormat(format)) button.onclick = () => downloadFile(data, format);
  });
}

const EXPORT_FORMATS: readonly string[] = ['csv', 'json', 'xlsx', 'docx', 'md', 'epub'];

function isExportFormat(value: string): value is ExportFormat {
  return EXPORT_FORMATS.includes(value);
}

/** The file for a format. CSV and JSON are text; the rest are built as bytes. */
export function exportContent(data: TextLayerData[], format: ExportFormat): string | Uint8Array {
  switch (format) {
    case 'csv':
      return toCSV(data);
    case 'json':
      return toJSON(data);
    case 'md':
      return toMarkdown(data);
    case 'xlsx':
      return toXLSX(data);
    case 'docx':
      return toDOCX(data);
    case 'epub':
      return toEPUB(data);
  }
}

function downloadFile(data: TextLayerData[], format: ExportFormat): void {
  debugLog(`Download started: ${format} format, ${data.length} items`);

  try {
    const content = exportContent(data, format);
    const filename = filenameFor(format);
    const mimeType = mimeTypeFor(format);

    debugLog(`Filename: ${filename}`);
    debugLog(`MIME type: ${mimeType}`);
    debugLog(`Content size: ${content.length}`);

    // Try multiple download methods
    attemptDownload(content, filename, mimeType, format);
  } catch (error) {
    debugLog(`❌ Download error: ${messageOf(error)}`, 'error');
    debugLog(
      `❌ Error stack: ${error instanceof Error ? error.stack : undefined}`,
      'error'
    );

    showStatus('❌ An error occurred. Please check the debug log.', 'error');
  }
}

/** A name not yet in `used`: "Home", then "Home (2)", "Home (3)"... */
function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  for (let n = 2; used.has(candidate); n++) candidate = `${name} (${n})`;
  used.add(candidate);
  return candidate;
}

/** Saves exported frames: one PDF as is, several as a ZIP of PDFs. */
export function savePdfs(files: ReadonlyArray<{ name: string; data: Uint8Array }>): void {
  if (files.length === 0) return;
  if (files.length === 1) {
    const [file] = files;
    attemptDownload(file.data, `${safeFileName(file.name)}.pdf`, mimeTypeFor('pdf'), 'pdf');
    return;
  }
  const used = new Set<string>();
  const zip = writeZip(
    files.map((file) => ({ name: `${uniqueName(safeFileName(file.name), used)}.pdf`, data: file.data }))
  );
  attemptDownload(zip, `figma-frames-${Date.now()}.zip`, mimeTypeFor('zip'), 'zip');
}
