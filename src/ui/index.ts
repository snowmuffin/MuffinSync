import type { ExportFormat, TextLayerData } from '../shared/types';
import { isExportFormat } from '../shared/types';
import type { UiToMain } from '../shared/messages';
import { unwrapMainMessage } from '../shared/messages';
import { toCSV, fromCSV } from './format/csv';
import { toJSON, fromJSON } from './format/json';

/**
 * The File System Access API is not in TypeScript's DOM lib. The download
 * chain feature-detects it before use, so declare only what is touched here.
 */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (
      options?: SaveFilePickerOptions
    ) => Promise<FileSystemFileHandle>;
  }
}

type StatusKind = 'success' | 'error' | 'info';

let selectedFormat: ExportFormat = 'csv';

// Debug functionality (console logging only)
function debugLog(message: string, type: string = 'info'): void {
  // Log to console for development purposes
  console.log(`[MuffinSync] ${message}`);
}

/** `catch` binds `unknown` under strict; the old code read `.message` directly. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `getElementById` is typed `HTMLElement | null`. Every id here is in
 * ui.html, so a miss means the markup and this file drifted apart — log it
 * and let the caller skip rather than throw an unreadable TypeError.
 */
function byId(id: string): HTMLElement | null {
  const element = document.getElementById(id);
  if (!element) debugLog(`Element not found: ${id}`);
  return element;
}

function post(message: UiToMain): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

// Initialize debug logging
debugLog('Plugin UI initialization complete');
debugLog(`User Agent: ${navigator.userAgent}`);
debugLog(`Current URL: ${window.location.href}`);

// Debug environment info
setTimeout(() => {
  debugLog(`Clipboard API support: ${!!navigator.clipboard}`);
  debugLog(`File API support: ${!!window.File}`);
  debugLog(`Blob support: ${!!window.Blob}`);
  debugLog(`URL.createObjectURL support: ${!!URL.createObjectURL}`);
  debugLog(`showSaveFilePicker support: ${!!window.showSaveFilePicker}`);
}, 100);

// Format selector
document.querySelectorAll<HTMLElement>('.format-option').forEach((option) => {
  option.addEventListener('click', () => {
    document
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

const fileInputElement = byId('file-input');
const fileInput =
  fileInputElement instanceof HTMLInputElement ? fileInputElement : null;

// Extract button
byId('extract-btn')?.addEventListener('click', () => {
  debugLog('Text extraction started');
  showStatus('Extracting text layers...', 'info');
  // 'selection' is the plugin's long-standing behaviour: the sandbox falls
  // back to the whole page when nothing is selected.
  post({ type: 'extract', scope: 'selection' });
});

// Import button
byId('import-btn')?.addEventListener('click', () => {
  debugLog('File selection dialog opened');
  fileInput?.click();
});

// File input
fileInput?.addEventListener('change', (event: Event) => {
  const target = event.target;
  const file =
    target instanceof HTMLInputElement ? target.files?.[0] : undefined;
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let data: TextLayerData[];
        const content = typeof reader.result === 'string' ? reader.result : '';

        if (file.name.endsWith('.json')) {
          data = fromJSON(content);
        } else if (file.name.endsWith('.csv')) {
          data = fromCSV(content);
        } else {
          showStatus(
            'Unsupported file format. Please select a CSV or JSON file.',
            'error'
          );
          return;
        }

        showStatus('Importing file...', 'info');
        post({ type: 'import', rows: data });
      } catch (error) {
        showStatus(`File reading error: ${messageOf(error)}`, 'error');
      }
    };
    reader.readAsText(file);
  }
});

// Listen for messages from plugin
window.onmessage = (event: MessageEvent) => {
  const message = unwrapMainMessage(event);
  if (!message) {
    debugLog('Unknown or malformed message from plugin');
    return;
  }

  debugLog(`Message received from plugin: ${message.type}`);

  switch (message.type) {
    case 'extracted':
      debugLog(`Text extraction complete: ${message.rows.length} layers`);
      showExportedData(message.rows, selectedFormat);
      showStatus(
        `Successfully extracted ${message.rows.length} text layers.`,
        'success'
      );
      break;

    case 'no-text-found':
      debugLog('No text layers found');
      // The message no longer travels with the message; it lives here now.
      showStatus('No text layers found.', 'error');
      break;

    case 'import-complete': {
      debugLog(
        `Text import complete: ${message.updated} updated, ${message.failed} errors`
      );
      let statusMessage = `Updated ${message.updated} text layers.`;
      if (message.failed > 0) {
        statusMessage += ` (${message.failed} errors)`;
        if (message.errors && message.errors.length > 0) {
          statusMessage += '<br><small>' + message.errors.join('<br>') + '</small>';
        }
      }
      showStatus(statusMessage, message.failed > 0 ? 'error' : 'success');
      break;
    }

    case 'error':
      debugLog(`Plugin error: ${message.message}`, 'error');
      showStatus(message.message, 'error');
      break;
  }
};

function showExportedData(data: TextLayerData[], format: ExportFormat): void {
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
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = toJSON(data);
      filename = `figma-text-layers-${new Date().getTime()}.json`;
      mimeType = 'application/json';
    } else {
      content = toCSV(data);
      filename = `figma-text-layers-${new Date().getTime()}.csv`;
      mimeType = 'text/csv';
    }

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

async function attemptDownload(
  content: string,
  filename: string,
  mimeType: string,
  format: ExportFormat
): Promise<void> {
  debugLog('🚀 Multiple download methods attempt started');

  // Method 1: File System Access API (Chrome 86+)
  if (window.showSaveFilePicker) {
    try {
      debugLog('Method 1: File System Access API attempt');
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: `${format.toUpperCase()} File`,
            accept: {
              [mimeType]: [`.${format}`],
            },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      debugLog('✅ File System Access API download success', 'success');
      showStatus(`✅ ${filename} file downloaded successfully!`, 'success');
      return;
    } catch (error) {
      debugLog(`File System Access API failed: ${messageOf(error)}`, 'error');
    }
  }

  // Method 2: Blob + URL.createObjectURL
  try {
    debugLog('Method 2: Blob URL download attempt');
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up URL
    setTimeout(() => URL.revokeObjectURL(url), 100);

    debugLog('✅ Blob URL download executed', 'success');
    showStatus(
      `📥 ${filename} download started. Check your browser download folder.`,
      'success'
    );
    return;
  } catch (error) {
    debugLog(`Blob URL download failed: ${messageOf(error)}`, 'error');
  }

  // Method 3: Data URL
  try {
    debugLog('Method 3: Data URL download attempt');
    const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(
      content
    )}`;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    debugLog('✅ Data URL download executed', 'success');
    showStatus(
      `📥 ${filename} download started. Check your browser download folder.`,
      'success'
    );
    return;
  } catch (error) {
    debugLog(`Data URL download failed: ${messageOf(error)}`, 'error');
  }

  // Method 4: Open in new window
  try {
    debugLog('Method 4: New window download attempt');
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      debugLog('✅ File opened in new window success', 'success');
      showStatus(
        `📥 ${filename} opened in new window. Right-click > Save As.`,
        'info'
      );
      return;
    }
  } catch (error) {
    debugLog(`New window download failed: ${messageOf(error)}`, 'error');
  }

  // All methods failed - switch to manual copy mode
  debugLog(
    '⚠️ All automatic download methods failed, switching to manual mode',
    'error'
  );
  displayDownloadContent(content, filename, format);
  showStatus(
    `❌ Automatic download not supported. Please copy the text below to create the file manually.`,
    'error'
  );
}

function displayDownloadContent(
  content: string,
  filename: string,
  format: ExportFormat
): void {
  debugLog('Manual download content display');

  // Dynamically create manual download section
  const exportSection = byId('export-section');
  if (!exportSection) return;

  // Remove existing manual download area if present. Absence is the normal
  // case here, so look it up directly rather than through byId's "missing
  // element" logging.
  const existingManual = document.getElementById('manual-download');
  if (existingManual) {
    existingManual.remove();
  }

  // Create manual download area
  const manualSection = document.createElement('div');
  manualSection.id = 'manual-download';
  manualSection.style.cssText = `
    margin-top: 20px;
    padding: 16px;
    background: #fef3c7;
    border-radius: 8px;
    border-left: 4px solid #f59e0b;
  `;

  manualSection.innerHTML = `
    <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">
      ⚠️ Manual Download Required
    </div>
    <div style="color: #78350f; font-size: 14px; margin-bottom: 12px;">
      Automatic download is not supported. Please copy the text below and save as a file.
    </div>
    <div style="margin-bottom: 8px;">
      <strong>Filename:</strong> <code style="background: #fbbf24; padding: 2px 4px; border-radius: 3px;">${filename}</code>
    </div>
    <textarea id="manual-content" readonly style="
      width: 100%;
      height: 200px;
      padding: 12px;
      border: 1px solid #d97706;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      background-color: #fffbeb;
      resize: vertical;
    " placeholder="File content will be displayed here...">${content}</textarea>
    <div style="margin-top: 12px; font-size: 13px; color: #78350f;">
      <strong>How to save:</strong><br>
      1. Select all text above (Cmd+A or Ctrl+A)<br>
      2. Copy (Cmd+C or Ctrl+C)<br>
      3. Paste into text editor and save with .${format} extension
    </div>
  `;

  exportSection.appendChild(manualSection);

  // Auto-select text
  setTimeout(() => {
    const textarea = byId('manual-content');
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.select();
      textarea.focus();
    }
  }, 100);

  debugLog('Manual download area creation complete');
}

function showStatus(message: string, type: StatusKind): void {
  const statusDiv = byId('status');
  if (!statusDiv) return;

  statusDiv.innerHTML = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');

  if (type === 'info') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }
}
