import { unwrapMainMessage } from '../shared/messages';
import { post } from './post';
import { byId, debugLog } from './dom';
import { mountStatus, showStatus } from './status';
import { initExtract, savePdfs, showExportedData } from './features/extract';
import { initImport } from './features/import';
import { openReview, closeReview, invalidateOnSelectionChange } from './features/review';
import { initFindReplace, showResults } from './features/find-replace';
import { initScope, setSelectionPresent } from './features/scope';
import { initTabs } from './features/tabs';
import { initGenerate, generatedMessage } from './features/generate';
import { initSnippets, showSnippets } from './features/snippets';
import { endTask, reportProgress, taskStopped } from './features/task';

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
initFindReplace(document);
initScope(document);
initTabs(document);
initGenerate(document);

// Listen for messages from plugin
window.onmessage = (event: MessageEvent) => {
  const message = unwrapMainMessage(event);
  if (!message) {
    debugLog('Unknown or malformed message from plugin');
    return;
  }

  debugLog(`Message received from plugin: ${message.type}`);

  // Every answer to a long task ends it, whichever answer it is. Progress,
  // selection reports, the snippet list and notices are not answers.
  if (
    message.type !== 'progress' &&
    message.type !== 'selection' &&
    message.type !== 'snippets' &&
    message.type !== 'notice'
  ) {
    endTask();
  }

  switch (message.type) {
    case 'extracted':
      debugLog(`Text extraction complete: ${message.rows.length} layers`);
      showExportedData(message.rows);
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

    case 'change-set':
      debugLog(
        `Change set: ${message.changeSet.changes.length} changed, ` +
          `${message.changeSet.unchangedCount} unchanged, ` +
          `${message.changeSet.blocked.length} blocked`
      );
      openReview(message.changeSet);
      break;

    case 'import-complete': {
      debugLog(
        `Text import complete: ${message.updated} updated, ${message.failed} errors`
      );
      closeReview();
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

    case 'selection':
      debugLog(`Selection changed: present=${message.present}`);
      setSelectionPresent(message.present);
      invalidateOnSelectionChange();
      break;

    case 'pdf-exported': {
      const count = message.files.length;
      savePdfs(message.files);
      debugLog(`Exported ${count} frame(s) as PDF`);
      break;
    }

    case 'snippets':
      showSnippets(message.snippets);
      break;

    case 'notice':
      showStatus(message.message, 'success');
      break;

    case 'generated':
      showStatus(
        generatedMessage(message.kind, message.count, message.missingTags, message.untranslated),
        message.missingTags.length > 0 || message.untranslated > 0 ? 'info' : 'success'
      );
      break;

    case 'progress':
      reportProgress(message.task, message.done, message.total);
      break;

    case 'task-stopped':
      taskStopped();
      break;

    case 'search-results':
      debugLog(`Search results: ${message.matches.length} layers matched`);
      showResults(message.matches);
      break;
  }
};

// Only now can the sandbox's first selection report be received. Sent last on
// purpose: the handler above must exist before anything is asked for.
post({ type: 'ui-ready' });
initSnippets();
