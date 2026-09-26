import { h, render } from 'preact';
import {
  enabledRules,
  glossaryFromRows,
  glossaryToRows,
  type GlossaryEntry,
} from '../../../shared/checks';
import type { Scope } from '../../../shared/types';
import type { CheckResult, CheckTarget } from '../../../shared/messages';
import { CheckOptions } from './options';
import { CheckResults } from './results';
import { post } from '../../post';
import { byId, messageOf } from '../../dom';
import { clearStatus, showStatus } from '../../status';
import { attemptDownload, mimeTypeFor } from '../../download';
import { parseTable } from '../../format/table';
import { rowsToCSV } from '../../format/csv';
import { beginTask, isBusy } from '../task';
import { getIncludeHidden, getScope } from '../scope';
import { getCheckToggles, setCheckToggle } from '../settings';

/**
 * Wires the Check tab. Rule toggles live in remembered settings (per user);
 * the glossary lives in the file (shared) and the sandbox's copy is the
 * source of truth: every edit sends the whole list and renders what comes
 * back. No JSX here; this file keeps the `.ts` extension.
 */

let glossary: GlossaryEntry[] = [];
let lastScope: Scope = 'page';

function drawOptions(): void {
  const host = byId('check-options-host');
  if (!host) return;
  render(
    h(CheckOptions, {
      toggles: getCheckToggles(),
      glossary,
      onToggle: (rule, on) => {
        setCheckToggle(rule, on);
        drawOptions();
      },
      onGlossaryChange: (entries) => post({ type: 'save-glossary', entries }),
      onImportGlossary: () => (document.getElementById('glossary-file') as HTMLInputElement | null)?.click(),
      onExportGlossary: () =>
        attemptDownload(rowsToCSV(glossaryToRows(glossary)), 'copydesk-glossary.csv', mimeTypeFor('csv'), 'csv'),
    }),
    host
  );
}

export function showGlossary(entries: GlossaryEntry[]): void {
  glossary = entries;
  drawOptions();
}

function setMainHidden(hidden: boolean): void {
  byId('main-content')?.classList.toggle('hidden', hidden);
}

function closeResults(): void {
  const host = byId('check-results-host');
  if (host) render(null, host);
  setMainHidden(false);
}

export function showCheckResults(results: CheckResult[], scope: Scope): void {
  lastScope = scope;
  const host = byId('check-results-host');
  if (!host) return;
  if (results.length === 0) {
    render(null, host);
    setMainHidden(false);
    showStatus('No issues found.', 'success');
    return;
  }
  clearStatus();
  setMainHidden(true);
  // Unmount first so a new run never inherits the previous run's ticks.
  render(null, host);
  render(
    h(CheckResults, {
      results,
      onFix: (targets: CheckTarget[]) => {
        closeResults();
        beginTask('plan');
        post({ type: 'plan-check', targets, glossary, scope: lastScope });
      },
      onClose: closeResults,
      onNavigate: (nodeId) => post({ type: 'navigate', nodeId }),
    }),
    host
  );
}

export function initCheck(root: Document): void {
  glossary = [];
  drawOptions();
  // Rule toggles arrive with the remembered settings, after this first draw.
  root.addEventListener('copydesk:settings-applied', drawOptions);

  root.getElementById('check-btn')?.addEventListener('click', () => {
    if (isBusy()) return;
    const rules = enabledRules(getCheckToggles());
    if (rules.length === 0) {
      showStatus('Turn on at least one rule to check.', 'error');
      return;
    }
    beginTask('check');
    post({ type: 'check', scope: getScope(), includeHidden: getIncludeHidden(), rules, glossary });
  });

  const file = root.getElementById('glossary-file') as HTMLInputElement | null;
  file?.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    const reader = new FileReader();
    reader.onload = () => {
      file.value = '';
      try {
        const table = parseTable(typeof reader.result === 'string' ? reader.result : '', chosen.name);
        if (!table.headers.includes('avoid')) throw new Error('The file needs an "avoid" column and a "use" column.');
        const imported = glossaryFromRows(table.rows);
        const keys = new Set(imported.map((e) => e.avoid.toLowerCase()));
        post({
          type: 'save-glossary',
          entries: [...glossary.filter((e) => !keys.has(e.avoid.toLowerCase())), ...imported],
        });
        showStatus(`Imported ${imported.length} glossary ${imported.length === 1 ? 'term' : 'terms'}.`, 'success');
      } catch (error) {
        showStatus(`Glossary import error: ${messageOf(error)}`, 'error');
      }
    };
    reader.readAsText(chosen);
  });
}

/** Asks the sandbox for the file's glossary; called once the UI is listening. */
export function requestGlossary(): void {
  post({ type: 'get-glossary' });
}
