import { buildTranslations, localesOf, type Translations } from '../../shared/generate';
import { parseTable, type Table } from '../format/table';
import { byId, messageOf } from '../dom';
import { post } from '../post';
import { showStatus } from '../status';
import { beginTask, isBusy } from './task';

/**
 * The Generate tab: pick a data or translation file, see what it holds, then
 * generate. Reading and summarising the file happens here; cloning happens in
 * the sandbox (src/main/generate.ts). See local features spec §6.
 */

function reveal(id: string, text?: string): void {
  const element = byId(id);
  if (!element) return;
  if (text !== undefined) element.textContent = text;
  element.classList.remove('hidden');
}

function conceal(...ids: string[]): void {
  ids.forEach((id) => byId(id)?.classList.add('hidden'));
}

/** Reads the chosen file as a table, or says why it cannot. */
function readTable(input: HTMLInputElement, onTable: (table: Table) => void): void {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    // Cleared so choosing the same file again, after editing it, fires change.
    input.value = '';
    try {
      onTable(parseTable(typeof reader.result === 'string' ? reader.result : '', file.name));
    } catch (error) {
      showStatus(`File reading error: ${messageOf(error)}`, 'error');
    }
  };
  reader.readAsText(file);
}

export function describeMerge(table: Table): string {
  const rows = table.rows.length;
  return `${rows} ${rows === 1 ? 'row' : 'rows'} · columns: ${table.headers.join(', ')}`;
}

export interface LocalizePlan {
  locales: string[];
  translations: Translations;
  summary: string;
}

/** What a translation file will do, or why it cannot be used. */
export function planLocalize(table: Table): LocalizePlan | string {
  if (!table.headers.includes('id')) {
    return 'The file needs an "id" column: extract the frames first, then add a column per language.';
  }
  const locales = localesOf(table.headers);
  if (locales.length === 0) return 'Add a column per language (for example "ko" or "ja") next to "id".';
  const translations = buildTranslations(table.rows, locales);
  const counts = locales.map((l) => `${l}: ${Object.keys(translations[l]).length}`).join(', ');
  return {
    locales,
    translations,
    summary: `Languages: ${locales.join(', ')}\nTranslated layers — ${counts}`,
  };
}

export function initGenerate(root: Document): void {
  let mergeRows: Table['rows'] = [];
  let localize: LocalizePlan | null = null;

  const mergeInput = root.getElementById('merge-file') as HTMLInputElement | null;
  const localizeInput = root.getElementById('localize-file') as HTMLInputElement | null;

  root.getElementById('merge-pick-btn')?.addEventListener('click', () => mergeInput?.click());
  root.getElementById('localize-pick-btn')?.addEventListener('click', () => localizeInput?.click());

  mergeInput?.addEventListener('change', () =>
    readTable(mergeInput, (table) => {
      mergeRows = table.rows;
      reveal('merge-summary', describeMerge(table));
      if (table.rows.length === 0) {
        conceal('merge-btn');
        return;
      }
      reveal('merge-btn', `Generate ${table.rows.length} ${table.rows.length === 1 ? 'copy' : 'copies'}`);
    })
  );

  localizeInput?.addEventListener('change', () =>
    readTable(localizeInput, (table) => {
      const plan = planLocalize(table);
      if (typeof plan === 'string') {
        localize = null;
        conceal('localize-btn');
        reveal('localize-summary', plan);
        return;
      }
      localize = plan;
      reveal('localize-summary', plan.summary);
      reveal(
        'localize-btn',
        `Generate localized copies (${plan.locales.length} ${plan.locales.length === 1 ? 'language' : 'languages'})`
      );
    })
  );

  root.getElementById('merge-btn')?.addEventListener('click', () => {
    if (isBusy() || mergeRows.length === 0) return;
    beginTask('generate');
    post({ type: 'merge', rows: mergeRows });
  });

  root.getElementById('localize-btn')?.addEventListener('click', () => {
    if (isBusy() || !localize) return;
    beginTask('generate');
    post({ type: 'localize', locales: localize.locales, translations: localize.translations });
  });
}

/** The status line for a finished run. */
export function generatedMessage(
  kind: 'merge' | 'localize',
  count: number,
  missingTags: ReadonlyArray<string>,
  untranslated: number
): string {
  if (kind === 'merge') {
    const made = `Created ${count} ${count === 1 ? 'copy' : 'copies'}.`;
    return missingTags.length === 0
      ? made
      : `${made} These tags matched no column and were left as is: ${missingTags.map((t) => `{{${t}}}`).join(', ')}.`;
  }
  const made = `Created ${count} localized ${count === 1 ? 'copy' : 'copies'}.`;
  return untranslated === 0
    ? made
    : `${made} ${untranslated} ${untranslated === 1 ? 'layer has' : 'layers have'} no translation and kept the source text.`;
}
