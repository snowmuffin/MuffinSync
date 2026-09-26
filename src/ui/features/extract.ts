import type { ExportFormat, TextLayerData } from '../../shared/types';
import { toCSV } from '../format/csv';
import { toJSON } from '../format/json';
import { byId, debugLog, messageOf } from '../dom';
import { showStatus } from '../status';
import { attemptDownload, filenameFor, mimeTypeFor } from '../download';
import { post } from '../post';
import { getScope } from './scope';

/**
 * There is no format choice before extracting: the format is picked by which
 * download button is pressed afterwards. A CSV/JSON selector used to sit above
 * the Extract button, but nothing read it -- the user chose twice and only the
 * second choice counted.
 */
export function initExtract(root: Document): void {
  byId('extract-btn', root)?.addEventListener('click', () => {
    debugLog('Text extraction started');
    showStatus('Extracting text layers...', 'progress');
    post({ type: 'extract', scope: getScope() });
  });
}

export function showExportedData(data: TextLayerData[]): void {
  const exportSection = byId('export-section');
  if (!exportSection) return;

  // Show the export section
  exportSection.classList.remove('hidden');

  // Setup direct download buttons
  const csvButton = byId('download-csv-btn');
  if (csvButton) {
    csvButton.onclick = () => {
      downloadFile(data, 'csv');
    };
  }

  const jsonButton = byId('download-json-btn');
  if (jsonButton) {
    jsonButton.onclick = () => {
      downloadFile(data, 'json');
    };
  }
}

function downloadFile(data: TextLayerData[], format: ExportFormat): void {
  debugLog(`Download started: ${format} format, ${data.length} items`);

  try {
    const content = format === 'json' ? toJSON(data) : toCSV(data);
    const filename = filenameFor(format);
    const mimeType = mimeTypeFor(format);

    debugLog(`Filename: ${filename}`);
    debugLog(`MIME type: ${mimeType}`);
    debugLog(`Content size: ${content.length} characters`);

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
