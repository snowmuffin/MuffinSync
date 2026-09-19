import type { ExportFormat, TextLayerData } from '../../shared/types';
import { isExportFormat } from '../../shared/types';
import { toCSV } from '../format/csv';
import { toJSON } from '../format/json';
import { byId, debugLog, messageOf } from '../dom';
import { showStatus } from '../status';
import { attemptDownload, filenameFor, mimeTypeFor } from '../download';
import { post } from '../post';

let selectedFormat: ExportFormat = 'csv';

/** Read by index.ts's message listener when an 'extracted' message arrives. */
export function getSelectedFormat(): ExportFormat {
  return selectedFormat;
}

export function initExtract(root: Document): void {
  // Format selector
  root.querySelectorAll<HTMLElement>('.format-option').forEach((option) => {
    option.addEventListener('click', () => {
      root
        .querySelectorAll<HTMLElement>('.format-option')
        .forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
      const format = option.dataset.format;
      if (format !== undefined && isExportFormat(format)) {
        selectedFormat = format;
      }
      debugLog(`Format changed: ${selectedFormat}`);
    });
  });

  // Extract button
  byId('extract-btn', root)?.addEventListener('click', () => {
    debugLog('Text extraction started');
    showStatus('Extracting text layers...', 'info');
    // 'selection' is the plugin's long-standing behaviour: the sandbox falls
    // back to the whole page when nothing is selected.
    post({ type: 'extract', scope: 'selection' });
  });
}

export function showExportedData(data: TextLayerData[], format: ExportFormat): void {
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
