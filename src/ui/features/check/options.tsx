import { useState } from 'preact/hooks';
import { RULES, type GlossaryEntry, type RuleId } from '../../../shared/checks';

export interface CheckOptionsProps {
  /** Rule id -> on; a rule not listed uses its default. */
  toggles: Readonly<Record<string, boolean>>;
  glossary: GlossaryEntry[];
  onToggle(rule: RuleId, on: boolean): void;
  onGlossaryChange(entries: GlossaryEntry[]): void;
  onImportGlossary(): void;
  onExportGlossary(): void;
}

/**
 * Pure: which rules run, and the file's glossary. Reports changes and sends
 * nothing; `index.ts` stores rule toggles in settings (per user) and the
 * glossary in the file (shared). See copy tools spec §5.
 */
export function CheckOptions({
  toggles,
  glossary,
  onToggle,
  onGlossaryChange,
  onImportGlossary,
  onExportGlossary,
}: CheckOptionsProps) {
  const [avoid, setAvoid] = useState('');
  const [use, setUse] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);

  const add = (event: Event) => {
    event.preventDefault();
    if (avoid.trim() === '') return;
    const entry: GlossaryEntry = { avoid: avoid.trim(), use: use.trim(), caseSensitive, wholeWord };
    // A second entry for the same term replaces the first rather than competing with it.
    const rest = glossary.filter((e) => e.avoid.toLowerCase() !== entry.avoid.toLowerCase());
    onGlossaryChange([...rest, entry]);
    setAvoid('');
    setUse('');
  };

  return (
    <div>
      <div class="section">
        <div class="section-title">Rules</div>
        {RULES.map((rule) => (
          <label class="rule-row" key={rule.id}>
            <input
              type="checkbox"
              data-rule={rule.id}
              checked={toggles[rule.id] ?? rule.defaultOn}
              onChange={(e) => onToggle(rule.id, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span>{rule.label}</span>
            {!rule.fixable && <span class="hint">report only</span>}
          </label>
        ))}
      </div>

      <div class="section">
        <div class="section-title">Glossary ({glossary.length})</div>
        <div class="instruction">
          Terms to avoid and what to use instead. Saved in this file, so everyone editing it checks
          against the same list.
        </div>
        {glossary.map((entry) => (
          <div class="glossary-row" data-glossary={entry.avoid} key={entry.avoid}>
            <span class="avoid">{entry.avoid}</span>
            <span>→</span>
            <span class="use">{entry.use || '(remove)'}</span>
            <span class="flags">
              {entry.caseSensitive ? 'Aa' : 'aa'} · {entry.wholeWord ? 'word' : 'part'}
            </span>
            <button
              type="button"
              class="results-row-navigate"
              data-glossary-delete=""
              onClick={() => onGlossaryChange(glossary.filter((e) => e !== entry))}
            >
              Delete
            </button>
          </div>
        ))}
        <form class="glossary-add" onSubmit={add} data-glossary-form="">
          <input
            class="text-input"
            id="glossary-avoid"
            placeholder="Avoid, e.g. Log in"
            value={avoid}
            onInput={(e) => setAvoid((e.currentTarget as HTMLInputElement).value)}
          />
          <input
            class="text-input"
            id="glossary-use"
            placeholder="Use, e.g. Sign in"
            value={use}
            onInput={(e) => setUse((e.currentTarget as HTMLInputElement).value)}
          />
          <button class="button primary" type="submit" disabled={avoid.trim() === ''} style="margin: 0; padding: 8px 12px">
            Add
          </button>
        </form>
        <label class="checkbox-row">
          <input
            type="checkbox"
            id="glossary-case"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive((e.currentTarget as HTMLInputElement).checked)}
          />
          Case sensitive
        </label>
        <label class="checkbox-row">
          <input
            type="checkbox"
            id="glossary-word"
            checked={wholeWord}
            onChange={(e) => setWholeWord((e.currentTarget as HTMLInputElement).checked)}
          />
          Whole word
        </label>
        <div class="inline-actions">
          <button type="button" class="results-row-navigate" data-glossary-import="" onClick={onImportGlossary}>
            Import CSV
          </button>
          <button
            type="button"
            class="results-row-navigate"
            data-glossary-export=""
            disabled={glossary.length === 0}
            onClick={onExportGlossary}
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
