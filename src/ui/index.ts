import { unwrapMainMessage } from '../shared/messages';
import { byId, debugLog } from './dom';
import { mountStatus, showStatus } from './status';
import { initExtract, showExportedData, getSelectedFormat } from './features/extract';
import { initImport } from './features/import';

const statusHost = byId('status-host');
if (statusHost) mountStatus(statusHost);

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

initExtract(document);
initImport(document);

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
      showExportedData(message.rows, getSelectedFormat());
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
      }
      showStatus(
        statusMessage,
        message.failed > 0 ? 'error' : 'success',
        message.failed > 0 ? message.errors : []
      );
      break;
    }

    case 'error':
      debugLog(`Plugin error: ${message.message}`, 'error');
      showStatus(message.message, 'error');
      break;
  }
};
