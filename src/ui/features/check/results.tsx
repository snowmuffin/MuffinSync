import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { ruleInfo, type RuleId } from '../../../shared/checks';
import type { CheckResult, CheckTarget } from '../../../shared/messages';
import { LIST_PAGE, ShowMore } from '../show-more';

export interface CheckResultsProps {
  results: CheckResult[];
  onFix(targets: CheckTarget[]): void;
  onClose(): void;
  onNavigate(nodeId: string): void;
}

/** The fixable rules found in a layer, each once, in rule order. */
function fixableRules(result: CheckResult): RuleId[] {
  const rules: RuleId[] = [];
  for (const finding of result.findings) {
    if (finding.replacement !== undefined && !rules.includes(finding.rule)) rules.push(finding.rule);
  }
  return rules;
}

function reportRules(result: CheckResult): RuleId[] {
  const rules: RuleId[] = [];
  for (const finding of result.findings) {
    if (finding.replacement === undefined && !rules.includes(finding.rule)) rules.push(finding.rule);
  }
  return rules;
}

/**
 * Pure: the check's findings, one row per layer. Fixable rules can be ticked
 * per layer; report-only findings (placeholders, empty layers) can only be
 * shown. Fixing sends the chosen rules per layer, and the sandbox recomputes
 * the fix on the layer's current text (copy tools spec §5.3).
 */
export function CheckResults({ results, onFix, onClose, onNavigate }: CheckResultsProps) {
  const [chosen, setChosen] = useState<Map<string, Set<RuleId>>>(
    () => new Map(results.map((r) => [r.nodeId, new Set(fixableRules(r))]))
  );
  const [shown, setShown] = useState(LIST_PAGE);

  const counts = new Map<RuleId, number>();
  for (const result of results) {
    for (const finding of result.findings) counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  }
  const fixableLayers = results.filter((r) => fixableRules(r).length > 0);
  const selectedCount = results.filter((r) => (chosen.get(r.nodeId)?.size ?? 0) > 0).length;
  const allSelected =
    fixableLayers.length > 0 && fixableLayers.every((r) => chosen.get(r.nodeId)?.size === fixableRules(r).length);

  const toggle = (nodeId: string, rule: RuleId) => (event: Event) => {
    const on = (event.currentTarget as HTMLInputElement).checked;
    setChosen((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(nodeId));
      if (on) set.add(rule);
      else set.delete(rule);
      next.set(nodeId, set);
      return next;
    });
  };

  const toggleAll = (event: Event) => {
    const on = (event.currentTarget as HTMLInputElement).checked;
    setChosen(new Map(results.map((r) => [r.nodeId, new Set(on ? fixableRules(r) : [])])));
  };

  const fix = () => {
    const targets: CheckTarget[] = [];
    for (const result of results) {
      const rules = chosen.get(result.nodeId);
      if (rules && rules.size > 0) {
        targets.push({ nodeId: result.nodeId, layerName: result.layerName, rules: Array.from(rules) });
      }
    }
    onFix(targets);
  };

  const highlighted = (result: CheckResult) => {
    const parts: Array<string | JSX.Element> = [];
    let cursor = 0;
    for (const finding of result.findings) {
      if (finding.start < cursor) continue;
      parts.push(result.characters.slice(cursor, finding.start));
      // A finding that is only whitespace would be invisible; show its spaces
      // as dots. Findings with words in them are shown as written.
      const raw = result.characters.slice(finding.start, finding.end);
      const text = raw === '' ? '∅' : raw.trim() === '' ? raw.replace(/ /g, '·') : raw;
      parts.push(
        <mark class={finding.replacement === undefined ? 'issue report' : 'issue'} title={ruleInfo(finding.rule).label}>
          {text}
        </mark>
      );
      cursor = finding.end;
    }
    parts.push(result.characters.slice(cursor));
    return parts;
  };

  return (
    <div class="section">
      <div class="section-title">Check results</div>
      <div class="results-summary">
        {results.length} {results.length === 1 ? 'layer' : 'layers'} with issues ·{' '}
        {Array.from(counts, ([rule, n]) => `${ruleInfo(rule).label} ${n}`).join(' · ')}
      </div>

      {fixableLayers.length > 1 && (
        <label class="review-select-all">
          <input type="checkbox" data-select-all="" checked={allSelected} onClick={toggleAll} />
          Select all fixes
        </label>
      )}

      {results.slice(0, shown).map((result) => (
        <div class="results-row" data-check-row="" key={result.nodeId}>
          <div class="results-row-body">
            <div class="results-row-name">
              <span>{result.layerName}</span>
              <button type="button" class="results-row-navigate" data-navigate="" onClick={() => onNavigate(result.nodeId)}>
                Show
              </button>
            </div>
            <div class="results-row-text">{highlighted(result)}</div>
            <div class="rule-chips">
              {fixableRules(result).map((rule) => (
                <label class="rule-chip" key={rule}>
                  <input
                    type="checkbox"
                    data-fix={rule}
                    checked={chosen.get(result.nodeId)?.has(rule) ?? false}
                    onChange={toggle(result.nodeId, rule)}
                  />
                  {ruleInfo(rule).label}
                </label>
              ))}
              {reportRules(result).map((rule) => (
                <span class="rule-chip report" data-report={rule} key={rule}>
                  {ruleInfo(rule).label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
      <ShowMore hidden={results.length - shown} onClick={() => setShown((n) => n + LIST_PAGE)} />

      {fixableLayers.length > 0 && (
        <button class="button primary action" data-action="fix" disabled={selectedCount === 0} onClick={fix}>
          Fix {selectedCount} {selectedCount === 1 ? 'layer' : 'layers'}
        </button>
      )}
      <button class="button secondary action" data-action="cancel" onClick={() => onClose()}>
        Close
      </button>
    </div>
  );
}
