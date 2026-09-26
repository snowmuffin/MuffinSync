import type { TextLayerData } from '../../shared/types';
import { fromCSV, FormatError } from '../format/csv';
import { fromJSON } from '../format/json';
import { assertUniqueIds } from '../format/rows';
import { byId, debugLog, messageOf } from '../dom';
import { showStatus } from '../status';
import { post } from '../post';
import { beginTask, isBusy } from './task';

/**
 * Reads pasted text as an import: JSON when it starts with `[`, CSV
 * otherwise -- the two shapes Extract and Copy JSON produce.
 */
export function parseImportText(text: string): TextLayerData[] {
  const trimmed = text.trim();
  if (trimmed === '') throw new FormatError('Paste the JSON or CSV to import first.');
  return trimmed.startsWith('[') ? fromJSON(trimmed) : fromCSV(trimmed);
}

/** The one path every import takes, whatever it came from: check, then plan. */
function planRows(rows: TextLayerData[]): void {
  assertUniqueIds(rows);
  beginTask('plan');
  post({ type: 'plan-import', rows });
}

export function initImport(root: Document): void {
  const fileInputElement = byId('file-input', root);
  const fileInput =
    fileInputElement instanceof HTMLInputElement ? fileInputElement : null;

  // Import button
  byId('import-btn', root)?.addEventListener('click', () => {
    if (isBusy()) return;
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
          planRows(data);
        } catch (error) {
          showStatus(`File reading error: ${messageOf(error)}`, 'error');
        }
      };
      reader.readAsText(file);
    }
  });

  // Paste to import: the same path as a file, without saving one.
  const pasteArea = root.getElementById('paste-area');
  const pasteInput = root.getElementById('paste-input');
  root.getElementById('paste-toggle-btn')?.addEventListener('click', () => {
    pasteArea?.classList.toggle('hidden');
    if (pasteInput instanceof HTMLTextAreaElement && !pasteArea?.classList.contains('hidden')) {
      pasteInput.focus();
    }
  });
  root.getElementById('paste-import-btn')?.addEventListener('click', () => {
    if (isBusy() || !(pasteInput instanceof HTMLTextAreaElement)) return;
    try {
      planRows(parseImportText(pasteInput.value));
    } catch (error) {
      showStatus(`Paste reading error: ${messageOf(error)}`, 'error');
    }
  });
}
