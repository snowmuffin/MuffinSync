import type { ExportFormat } from '../shared/types';

/** Anything the plugin saves: a text export, or frames exported as PDF. */
export type FileKind = ExportFormat | 'pdf' | 'zip';
import { byId, debugLog, messageOf } from './dom';
import { showStatus } from './status';

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

/**
 * Downloads are named with epoch milliseconds, which is what the plugin has
 * always emitted. Keep the format here rather than inline at the call site,
 * so there is one definition of it and a test can pin it.
 */
export function filenameFor(format: ExportFormat, now: Date = new Date()): string {
  return `figma-text-layers-${now.getTime()}.${format}`;
}

const MIME_TYPES: Record<FileKind, string> = {
  csv: 'text/csv',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

export function mimeTypeFor(kind: FileKind): string {
  return MIME_TYPES[kind];
}

/**
 * A file name from a layer name: characters no file system accepts become
 * `-`, and an empty result falls back to `untitled`.
 */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
  return cleaned === '' ? 'untitled' : cleaned;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function attemptDownload(
  content: string | Uint8Array,
  filename: string,
  mimeType: string,
  format: FileKind
): Promise<void> {
  // Blob and FileSystemWritableFileStream accept either; the cast is only
  // TypeScript's ArrayBufferLike vs ArrayBuffer distinction.
  const part = content as BlobPart;
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
      await writable.write(part);
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
    const blob = new Blob([part], { type: mimeType });
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
    const dataUrl =
      typeof content === 'string'
        ? `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`
        : `data:${mimeType};base64,${base64(content)}`;

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
    const blob = new Blob([part], { type: mimeType });
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

  // All methods failed. A binary file cannot be copied out as text.
  if (typeof content !== 'string') {
    showStatus(`❌ ${filename} could not be saved automatically.`, 'error');
    return;
  }

  // Switch to manual copy mode
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
  format: FileKind
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

  // Built with textContent and value, never innerHTML: the content is layer
  // text from the document, and a layer reading `</textarea><script>` must
  // stay text.
  const heading = document.createElement('div');
  heading.style.cssText = 'font-weight: 600; color: #92400e; margin-bottom: 8px;';
  heading.textContent = '⚠️ Manual Download Required';

  const note = document.createElement('div');
  note.style.cssText = 'color: #78350f; font-size: 14px; margin-bottom: 12px;';
  note.textContent =
    'Automatic download is not supported. Please copy the text below and save as a file.';

  const nameLine = document.createElement('div');
  nameLine.style.cssText = 'margin-bottom: 8px;';
  const nameLabel = document.createElement('strong');
  nameLabel.textContent = 'Filename: ';
  const nameCode = document.createElement('code');
  nameCode.style.cssText = 'background: #fbbf24; padding: 2px 4px; border-radius: 3px;';
  nameCode.textContent = filename;
  nameLine.append(nameLabel, nameCode);

  const textarea = document.createElement('textarea');
  textarea.id = 'manual-content';
  textarea.readOnly = true;
  textarea.style.cssText = `
      width: 100%;
      height: 200px;
      padding: 12px;
      border: 1px solid #d97706;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      background-color: #fffbeb;
      resize: vertical;
  `;
  textarea.value = content;

  const howTo = document.createElement('div');
  howTo.style.cssText = 'margin-top: 12px; font-size: 13px; color: #78350f; white-space: pre-line;';
  howTo.textContent =
    'How to save:\n' +
    '1. Select all text above (Cmd+A or Ctrl+A)\n' +
    '2. Copy (Cmd+C or Ctrl+C)\n' +
    `3. Paste into text editor and save with .${format} extension`;

  manualSection.append(heading, note, nameLine, textarea, howTo);

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
