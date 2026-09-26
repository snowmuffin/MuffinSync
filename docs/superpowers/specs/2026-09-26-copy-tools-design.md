# Copy Tools — Design and Plan

**Date:** 2026-09-26
**Status:** Implemented 2026-09-26 as 1.3.0 — §8 decided as recommended
**Starts from:** `main` at `891d6b4` (1.2.0 prepared, 442 tests)
**Target version:** 1.3.0. 1.2.0 stays as prepared, whether or not it has been
published by the time this lands.

Everything here is local: no network, no account. `networkAccess` stays
`["none"]`.

---

## 1. Scope

| # | Feature | Size |
|---|---|---|
| E1 | Remember settings across sessions; menu entries that open a tab directly | Small |
| E2 | Clipboard copy and paste-to-import; text statistics; optional context columns in exports | Small–medium |
| E3 | Import falls back to matching by layer path when ids don't match | Medium |
| E4 | **Check** tab: rule-based copy checks and a glossary, fixed through review | Medium–large |
| E5 | Docs, manual checks, version 1.3.0 | Small |

Order is E1 → E5. E1 comes first because E2 and E4 store their options in the
settings it introduces.

---

## 2. E1 — Settings and menu entries

### 2.1 Remembered settings

Stored with `figma.clientStorage` under `settings`, so per user on this device,
like snippets:

```ts
interface Settings {
  tab: TabName;
  scope: Scope;
  includeHidden: boolean;
  match: MatchOptions;          // case, whole word, regex
  contextColumns: boolean;      // E2
  checks: Record<RuleId, boolean>; // E4
}
```

- The sandbox sends `settings` after `ui-ready`; the UI applies them and saves
  every change with `save-settings` (debounced, 300 ms).
- A stored `scope: 'selection'` is only restored when something is selected;
  otherwise the existing rule applies (Current page).
- Unknown or malformed stored values fall back to today's defaults field by
  field, so a settings shape from an older version never breaks the panel.
- What is **not** remembered: Find/Replace text, chosen files, results. Those
  are per-task, and restoring a stale query is more confusing than helpful.

### 2.2 Menu entries

`manifest.json` gains commands beside **Open Copydesk**: **Extract & import**,
**Find & replace**, **Check copy**, **Generate**, **Snippets**. The sandbox
reads `figma.command` and sends `open-tab` after `ui-ready`, which overrides the
remembered tab for that session.

---

## 3. E2 — Clipboard, statistics, context columns

### 3.1 Clipboard

- After extracting: **Copy JSON** puts the round-trip JSON on the clipboard.
  `navigator.clipboard.writeText` can be refused inside the plugin iframe, so it
  falls back to a hidden textarea and `document.execCommand('copy')`, and says
  so if both fail.
- Import section: **Paste to import** reveals a text box and a **Check what
  would change** button. The pasted text is read as JSON if it starts with `[`,
  otherwise as CSV, then goes through exactly the path a chosen file takes
  (duplicate-id check, plan, review).

This is the low-friction route for editing copy with an AI chat or a
translation tool without saving files.

### 3.2 Statistics

After extracting, the Extracted Data section shows totals — layers, words,
characters — and a per-frame breakdown (collapsed by default). Words are counted
with `Intl.Segmenter` (word granularity), so Korean, Japanese and Chinese count
sensibly; where it is unavailable, whitespace splitting is the fallback.

### 3.3 Context columns

An **Add context columns** checkbox (remembered) adds `path` and `length` to
CSV and JSON exports:

- `path`: the layer's ancestors from its top-level frame down, joined with
  ` / ` — e.g. `Checkout / Summary / Total label`.
- `length`: character count of the text.

Import ignores both (it reads `id`, `name`, `characters`), except that `path`
feeds E3. `localesOf` in `src/shared/generate.ts` must treat `path` and
`length` as source columns, not languages.

---

## 4. E3 — Import matching by path

**Problem.** Import matches by layer id. Duplicating a file, pasting frames, or
rebuilding a screen changes every id, so the whole file lands under "Cannot
apply — layer no longer exists".

**Design.** When a row's id finds no text layer and the row has a `path`, the
sandbox looks for text layers with the same path:

- exactly one → that layer is the target; the review row notes
  "matched by path";
- none → blocked `missing`, as today;
- several → blocked with a new reason `ambiguous` ("N layers share this path").

The path index is built once per import, and only when at least one row misses
by id. It covers the current page first; if rows are still unmatched, every page
is loaded and indexed too. It runs inside the plan task, so it has progress and
Stop.

Paths repeat in real files (many layers named `Text`), so `ambiguous` will be
common for generic names; the review says so rather than guessing.

`ChangeTarget` gains an optional resolved node id; `ProposedChange` gains
`matchedBy?: 'path'` so review can show it.

---

## 5. E4 — Check tab

A fifth tab, **Check**. Scope and hidden-layer choice are the shared ones.

### 5.1 Rules

| Rule id | Finds | Fix |
|---|---|---|
| `double-space` | Two or more spaces between words | Collapse to one |
| `edge-space` | Leading or trailing spaces or line breaks | Trim |
| `space-before-punct` | A space before `, . ; : ! ?` | Remove the space |
| `repeated-word` | The same word twice in a row (`the the`) | Remove the repeat |
| `ellipsis` | Three dots `...` | `…` |
| `quotes` | Straight quotes `" '` | Curly `“ ” ‘ ’` (direction by context) |
| `placeholder` | Lorem ipsum, TODO, TBD, FIXME, XXX, "Placeholder", "Text" as a whole layer | Report only |
| `empty` | Text layers with no text, or only spaces | Report only |
| `glossary` | Terms from the glossary (§5.2) | Replace with the preferred term |

Defaults: all on except `ellipsis` and `quotes`, which are style choices. Each
rule can be toggled; toggles are remembered (E1).

`space-before-punct` skips `:` `;` `!` `?` when the layer's text looks French
(a non-breaking or narrow space before them is correct there) — cheap guard: only
flag an ordinary space, never U+00A0 or U+202F.

### 5.2 Glossary

Pairs of *avoid → use*, e.g. `Log in → Sign in`, `e-mail → email`, with
case-sensitive and whole-word options per entry (default: case-insensitive,
whole word). Matching reuses `src/shared/match.ts`.

Stored **in the file** with `figma.root.setPluginData('glossary', …)`, not per
user: terminology belongs to the product the file describes, and everyone
editing the file should check against the same list. Edited in the Check tab;
import/export as CSV (`avoid,use`) so a team can keep one list.

### 5.3 Running a check

**Check** walks the scope (a task: progress, Stop), runs the enabled rules on
every text layer, and lists findings grouped by rule, with counts. Each finding
shows the layer, the text with the issue highlighted, and **Show**.

- Fixable findings have checkboxes; **Fix N layers** combines every chosen fix
  per layer into one proposed text and sends it through the review screen
  (source `check`). Several rules can touch one layer; fixes apply in rule order
  to the current text at plan time, like find & replace.
- Report-only findings (`placeholder`, `empty`) have Show only.

The rules are pure functions in `src/shared/checks.ts` —
`(text, options) → Finding[]` and `(text, findings) → fixed text` — tested
without Figma.

---

## 6. Messages

- UI → sandbox: `save-settings`, `plan-check` (rule toggles + glossary),
  `get-glossary`, `save-glossary`.
- Sandbox → UI: `settings`, `open-tab`, `check-results`, `glossary`.
- `extract` gains `contextColumns: boolean`; `TextLayerData` gains optional
  `path` and `length`.
- `plan-import` rows may carry `path`.
- `ProposedChange.source` gains `'check'`; `matchedBy?: 'path'`.
- `BlockedChange.reason` gains `'ambiguous'`.
- `TaskKind` gains `'check'`.

Every variant gets accept and reject tests, one reject per check.

---

## 7. Testing and manual checks

- Unit: settings parsing and defaults; clipboard fallback order; word counting
  (Latin, Korean, mixed); path building; path index and the one/none/many
  outcomes; every check rule's find and fix, including overlaps between rules on
  one layer; glossary matching and CSV round trip; all new messages.
- Manual (`docs/verification/copy-tools-parity.md`): settings survive a reopen;
  each menu entry opens its tab; copy/paste through a chat window and back;
  import into a duplicated file matches by path; a Check run on a real file,
  fixed through review; glossary visible to a second collaborator.

---

## 8. Decisions needed

1. **Five tabs** (Extract, Find, Check, Generate, Snippets). At 360 px each is
   ~72 px wide; short labels fit. **Recommend:** yes. Alternative: put Check
   inside the Find tab as a second section.
2. **Glossary in the file** (shared with collaborators) rather than per user.
   **Recommend:** in the file.
3. **Rule defaults.** **Recommend:** as in §5.1 — `ellipsis` and `quotes` off.
4. **Path matching** on by default whenever rows carry a `path`. **Recommend:**
   yes; it only runs for rows whose id already failed, so it cannot change a
   row that matches today.
5. **Version** 1.3.0. **Recommend:** yes, leaving 1.2.0 as prepared.
