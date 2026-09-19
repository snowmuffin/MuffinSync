import type { TextLayerData } from '../../shared/types';
import type { UiToMain } from '../../shared/messages';
import { fromCSV } from '../format/csv';
import { fromJSON } from '../format/json';
import { byId, debugLog, messageOf } from '../dom';
import { showStatus } from '../status';

function post(message: UiToMain): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function initImport(root: Document): void {
  const fileInputElement = byId('file-input', root);
  const fileInput =
    fileInputElement instanceof HTMLInputElement ? fileInputElement : null;

  // Import button
  byId('import-btn', root)?.addEventListener('click', () => {
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
}
