import type { TextLayerData } from '../../shared/types';
import { fromCSV } from '../format/csv';
import { fromJSON } from '../format/json';
import { assertUniqueIds } from '../format/rows';
import { byId, debugLog, messageOf } from '../dom';
import { showStatus } from '../status';
import { post } from '../post';

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
          assertUniqueIds(data);

          showStatus('Checking what would change...', 'info');
          post({ type: 'plan-import', rows: data });
        } catch (error) {
          showStatus(`File reading error: ${messageOf(error)}`, 'error');
        }
      };
      reader.readAsText(file);
    }
  });
}
