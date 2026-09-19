import type { ExportFormat } from '../shared/types';

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

export type StatusKind = 'success' | 'error' | 'info';

// Debug functionality (console logging only)
export function debugLog(message: string, type: string = 'info'): void {
  // Log to console for development purposes
  console.log(`[MuffinSync] ${message}`);
}

/** `catch` binds `unknown` under strict; the old code read `.message` directly. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `getElementById` is typed `HTMLElement | null`. Every id here is in
 * ui.html, so a miss means the markup and this file drifted apart — log it
 * and let the caller skip rather than throw an unreadable TypeError.
 */
export function byId(id: string, root: Document = document): HTMLElement | null {
  const element = root.getElementById(id);
  if (!element) debugLog(`Element not found: ${id}`);
  return element;
}

export function showStatus(message: string, type: StatusKind): void {
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

export function filenameFor(format: ExportFormat, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `figma-text-layers-${date}.${format}`;
}

export function mimeTypeFor(format: ExportFormat): string {
  return format === 'csv' ? 'text/csv' : 'application/json';
}

export async function attemptDownload(
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

export function displayDownloadContent(
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
