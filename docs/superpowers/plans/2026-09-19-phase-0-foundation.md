# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give MuffinSync a real build pipeline, module boundaries, and a test suite, without changing what the plugin does for its users.

**Architecture:** The single 190-line sandbox file and 801-line inline-script UI are split into three areas — `src/main/` (Figma sandbox), `src/ui/` (iframe), and `src/shared/` (the typed contract between them). Webpack grows a second entry for the UI, and a 25-line custom plugin folds the UI bundle into `ui.html` as an inline script, because Figma plugin UIs must be a single self-contained HTML file. Logic moves out of DOM-facing code so vitest can reach it.

**Tech Stack:** TypeScript 5.9, webpack 5.111, ts-loader 9.6, html-webpack-plugin 5.6.8, vitest 5.0, preact 10.29 (pipeline proof only in this phase)

**Spec:** `docs/superpowers/specs/2026-09-19-copy-qa-design.md`

## Global Constraints

- **Node 22+.** `engines.node` is `>=22`; CI runs Node 22.
- **The sandbox never touches the network.** No `fetch` in `src/main/`. Figma's sandbox has none.
- **The UI never touches Figma nodes.** No `figma.*` in `src/ui/`. It has no document access.
- **Everything crossing that boundary goes through `src/shared/messages.ts`.**
- **`manifest.json` stays at `networkAccess.allowedDomains: ["none"]` for this entire phase.** Nothing here needs the network; opening it is Phase 3's job.
- **`dist/` is gitignored** (`.gitignore:8`) and must stay that way. Never commit build output.
- **`documentAccess` is `dynamic-page`** — node lookup must use `figma.getNodeByIdAsync()`, never the synchronous `getNodeById()`.
- **No user-visible behaviour change in this phase**, with three deliberate exceptions: the CSV data-loss bugs fixed in Task 2. Those are defects, not features.
- Commit after every task. Run `npm run typecheck && npm test && npm run build` before each commit.

---

## Why this phase exists

Nothing in the larger feature set can be built on the current structure. `webpack.config.js` sets `inject: false` because no UI JavaScript is bundled at all — `src/ui.html:220` opens one inline `<script>` that runs to the end of the file. **No npm package can be used in the UI.** PDF generation, spell-check clients, diff libraries — all blocked by that one fact.

The second reason is test coverage, which is currently zero. The CHANGELOG records a fix for "multi-line content in CSV parsing"; that character-by-character parser still lives inside the inline script with nothing covering it. Running the current `parseCSV`/`convertToCSV` pair round-trip reveals three reproducible data-loss bugs, documented in Task 2.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/shared/types.ts` | `TextLayerData`, `Scope`, `ExportFormat` — the vocabulary both sides share |
| `src/shared/messages.ts` | Typed message union and the envelope unwrapper |
| `src/main/index.ts` | Sandbox entry; routes messages, owns no logic |
| `src/main/traverse.ts` | Walks a node tree collecting text layers |
| `src/main/apply.ts` | Writes text back, loads fonts, collects per-node failures |
| `src/ui/index.ts` | UI entry; wires DOM to the modules below |
| `src/ui/format/csv.ts` | CSV serialize/parse |
| `src/ui/format/json.ts` | JSON serialize/parse |
| `src/ui/download.ts` | Browser download fallback chain |
| `src/ui/status.tsx` | Status banner, rendered with Preact |
| `tsconfig.main.json` | Sandbox compile settings — no DOM lib |
| `tsconfig.ui.json` | UI compile settings — DOM lib, Preact JSX |
| `vitest.config.ts` | Test runner config |
| `src/**/*.test.ts` | Tests colocated with what they test |

**Modified:** `webpack.config.js`, `tsconfig.json`, `package.json`, `src/ui.html`, `README.md`, `CHANGELOG.md`

**Deleted:** `src/code.ts` (contents move to `src/main/`)

---

### Task 1: Test harness

Nothing else in this plan can be verified until `npm test` runs. Fold the config and the first proof into one task.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/shared/types.ts`
- Create: `src/shared/types.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs vitest once and exits; `npm run test:watch` stays open. `src/shared/types.ts` exports `TextLayerData` (`{ id: string; name: string; characters: string }`), `Scope` (`'selection' | 'page'`), and `ExportFormat` (`'csv' | 'json'`).

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest@^5.0.1
```

- [ ] **Step 2: Write the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every module under test is pure logic. Nothing here needs a DOM;
    // code that does touch the DOM stays out of the test suite by design.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add the scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test**

Create `src/shared/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isExportFormat } from './types';

describe('isExportFormat', () => {
  it('accepts the two supported formats', () => {
    expect(isExportFormat('csv')).toBe(true);
    expect(isExportFormat('json')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isExportFormat('xlsx')).toBe(false);
    expect(isExportFormat('')).toBe(false);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./types"`.

- [ ] **Step 6: Write the types**

Create `src/shared/types.ts`:

```ts
/** One Figma text layer, as it crosses the sandbox/UI boundary. */
export interface TextLayerData {
  id: string;
  name: string;
  characters: string;
}

/** Which roots a document walk starts from. See spec section 3.1. */
export type Scope = 'selection' | 'page';

export type ExportFormat = 'csv' | 'json';

const EXPORT_FORMATS: readonly string[] = ['csv', 'json'];

export function isExportFormat(value: string): value is ExportFormat {
  return EXPORT_FORMATS.includes(value);
}
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npm test`
Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/shared/
git commit -m "test: add vitest harness and shared types"
```

---

### Task 2: CSV and JSON format modules

The most valuable task in the phase. It lifts the CSV parser out of the inline script, covers it, and fixes three data-loss bugs that exist today.

**The bugs**, reproduced by running the current `src/ui.html` functions round-trip:

| Input `characters` | Comes back as | Cause |
|---|---|---|
| `"  hello  "` | `"hello"` | `parseCSV` calls `currentField.trim()` on every field |
| `"\tindented"` | `"indented"` | same |
| `"a\rb"` | `"a"` | `convertToCSV` quotes for `,` `"` `\n` but not `\r`, so `parseCSV` reads the `\r` as a row break |

Figma text layers legitimately contain leading spaces and tabs. This is silent corruption of user content on a round-trip.

The fix needs both sides. `"  hello  "` contains no character that triggers quoting, so it is written unquoted, and the parser then trims it. So: **quote when the value has leading/trailing whitespace or a `\r`**, and **never trim a field that arrived quoted**.

**Files:**
- Create: `src/ui/format/csv.ts`
- Create: `src/ui/format/csv.test.ts`
- Create: `src/ui/format/json.ts`
- Create: `src/ui/format/json.test.ts`
- Reference only: `src/ui.html:366-443` (`parseCSV`), `src/ui.html:763-785` (`convertToCSV`)

**Interfaces:**
- Consumes: `TextLayerData` from `src/shared/types.ts`
- Produces:
  - `toCSV(rows: TextLayerData[]): string`
  - `fromCSV(text: string): TextLayerData[]`
  - `toJSON(rows: TextLayerData[]): string`
  - `fromJSON(text: string): TextLayerData[]`
  - Both `fromCSV` and `fromJSON` throw `FormatError` (exported from `csv.ts`) on unusable input.

- [ ] **Step 1: Write the failing round-trip test**

Create `src/ui/format/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCSV, fromCSV, FormatError } from './csv';
import type { TextLayerData } from '../../shared/types';

const row = (characters: string): TextLayerData => ({
  id: '1:1',
  name: 'Layer',
  characters,
});

describe('CSV round-trip', () => {
  // Each of these is content a Figma text layer can legitimately hold.
  const cases: [string, string][] = [
    ['leading and trailing spaces', '  hello  '],
    ['tab indent', '\tindented'],
    ['carriage return', 'a\rb'],
    ['multi-line', 'line1\nline2'],
    ['CRLF inside a field', 'x\r\ny'],
    ['embedded comma and quote', 'a, "b"'],
    ['only quote characters', '"""'],
    ['empty string', ''],
    ['single space', ' '],
    ['comma only', ','],
    ['unicode and emoji', '한글 🧁 ok'],
    ['trailing newline', 'trail\n'],
  ];

  for (const [label, characters] of cases) {
    it(`preserves ${label}`, () => {
      expect(fromCSV(toCSV([row(characters)]))).toEqual([row(characters)]);
    });
  }

  it('preserves several rows at once', () => {
    const rows: TextLayerData[] = [
      { id: '1', name: 'a', characters: 'x' },
      { id: '2', name: 'b', characters: 'y\nz' },
      { id: '3', name: 'c', characters: '' },
    ];
    expect(fromCSV(toCSV(rows))).toEqual(rows);
  });
});

describe('fromCSV', () => {
  it('trims unquoted fields so hand-edited spacing is tolerated', () => {
    const text = 'id,name,characters\n1:1, Layer , hello ';
    expect(fromCSV(text)).toEqual([
      { id: '1:1', name: 'Layer', characters: 'hello' },
    ]);
  });

  it('ignores blank lines', () => {
    const text = 'id,name,characters\n1:1,A,x\n\n';
    expect(fromCSV(text)).toEqual([
      { id: '1:1', name: 'A', characters: 'x' },
    ]);
  });

  it('rejects a file missing required columns', () => {
    expect(() => fromCSV('id,name\n1:1,A')).toThrow(FormatError);
  });

  it('rejects an empty file', () => {
    expect(() => fromCSV('')).toThrow(FormatError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test src/ui/format/csv.test.ts`
Expected: FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3: Write the CSV module**

Create `src/ui/format/csv.ts`. This implementation has been verified against every case above.

```ts
import type { TextLayerData } from '../../shared/types';

/** Raised when input cannot be read as a text-layer file. */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

const HEADERS = ['id', 'name', 'characters'] as const;

/**
 * A field needs quoting if it holds a structural character, or if it has
 * leading/trailing whitespace. Without the whitespace rule, "  hello  " is
 * written bare and the parser trims it away — silent loss of real content.
 */
function needsQuoting(value: string): boolean {
  return /[",\n\r]/.test(value) || value !== value.trim();
}

function escapeField(value: string): string {
  const s = value ?? '';
  return needsQuoting(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: TextLayerData[]): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => escapeField(row[h])).join(','));
  }
  return lines.join('\n');
}

/** Character-by-character so that quoted fields may contain , " \n and \r. */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;    // did THIS field arrive wrapped in quotes?
  let inQuotes = false;
  let i = 0;

  // A quoted field is preserved byte for byte. An unquoted one is trimmed,
  // so that a hand-edited "1:1, Layer" reads the way a human meant it.
  const endField = () => {
    row.push(quoted ? field : field.trim());
    field = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; quoted = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r' && next === '\n') { endRow(); i += 2; continue; }
    if (c === '\n' || c === '\r') { endRow(); i++; continue; }

    field += c;
    i++;
  }

  if (field !== '' || row.length > 0 || quoted) endRow();
  return rows;
}

export function fromCSV(text: string): TextLayerData[] {
  const rows = parseRows(text);
  if (rows.length === 0) {
    throw new FormatError('The file is empty.');
  }

  const headers = rows[0].map((h) => h.trim());
  const missing = HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new FormatError(
      `Missing required column(s): ${missing.join(', ')}. ` +
        `Expected a header row of: ${HEADERS.join(', ')}.`
    );
  }

  const index = Object.fromEntries(
    HEADERS.map((h) => [h, headers.indexOf(h)])
  ) as Record<(typeof HEADERS)[number], number>;

  return rows
    .slice(1)
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => ({
      id: r[index.id] ?? '',
      name: r[index.name] ?? '',
      characters: r[index.characters] ?? '',
    }));
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test src/ui/format/csv.test.ts`
Expected: PASS — 16 tests. The three cases that fail against today's code (`leading and trailing spaces`, `tab indent`, `carriage return`) now pass.

- [ ] **Step 5: Write the failing JSON test**

Create `src/ui/format/json.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toJSON, fromJSON } from './json';
import { FormatError } from './csv';
import type { TextLayerData } from '../../shared/types';

const rows: TextLayerData[] = [
  { id: '1:1', name: 'Title', characters: '  spaced  ' },
  { id: '1:2', name: 'Body', characters: 'line1\nline2' },
];

describe('JSON round-trip', () => {
  it('returns exactly what went in', () => {
    expect(fromJSON(toJSON(rows))).toEqual(rows);
  });

  it('formats readably for hand editing', () => {
    expect(toJSON(rows)).toContain('\n  {');
  });
});

describe('fromJSON', () => {
  it('rejects malformed JSON', () => {
    expect(() => fromJSON('{not json')).toThrow(FormatError);
  });

  it('rejects a top-level object', () => {
    expect(() => fromJSON('{"id":"1"}')).toThrow(FormatError);
  });

  it('rejects entries missing required fields', () => {
    expect(() => fromJSON('[{"id":"1:1","name":"A"}]')).toThrow(FormatError);
  });

  it('coerces nothing — a numeric id is a malformed entry', () => {
    expect(() => fromJSON('[{"id":1,"name":"A","characters":"x"}]')).toThrow(
      FormatError
    );
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm test src/ui/format/json.test.ts`
Expected: FAIL — `Failed to resolve import "./json"`.

- [ ] **Step 7: Write the JSON module**

Create `src/ui/format/json.ts`:

```ts
import type { TextLayerData } from '../../shared/types';
import { FormatError } from './csv';

export function toJSON(rows: TextLayerData[]): string {
  return JSON.stringify(rows, null, 2);
}

function isTextLayerData(value: unknown): value is TextLayerData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.characters === 'string'
  );
}

export function fromJSON(text: string): TextLayerData[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FormatError('The file is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new FormatError('Expected a JSON array of text layers.');
  }

  const bad = parsed.findIndex((entry) => !isTextLayerData(entry));
  if (bad !== -1) {
    throw new FormatError(
      `Entry ${bad} is missing a string id, name, or characters field.`
    );
  }

  return parsed as TextLayerData[];
}
```

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests across types, csv, and json.

- [ ] **Step 9: Commit**

```bash
git add src/ui/format/
git commit -m "fix: preserve whitespace and carriage returns through CSV round-trip

Lifts the CSV parser out of the ui.html inline script into a tested module
and fixes three ways it silently corrupted layer text.

parseCSV trimmed every field, so a layer reading '  hello  ' or '\\tindented'
came back stripped. convertToCSV quoted for , \" and \\n but not \\r, so a
layer containing a carriage return was truncated at it on re-import. Figma
text layers hold leading spaces and tabs routinely, so this was ordinary
content loss, not an edge case.

The fix needs both sides: values with leading/trailing whitespace or a \\r are
now quoted on the way out, and a field that arrived quoted is never trimmed on
the way in. Unquoted fields are still trimmed, so hand-edited spacing after a
comma keeps working."
```

---

### Task 3: Typed message contract

**Files:**
- Create: `src/shared/messages.ts`
- Create: `src/shared/messages.test.ts`
- Reference only: `src/code.ts:28-55`

Today `src/code.ts:33-39` tries three different shapes to find the payload:

```ts
if ((event as any).pluginMessage) { ... }
else if (event.data && event.data.pluginMessage) { ... }
else { msg = event as any as UIMessage; }
```

That guesswork exists because no contract says what arrives. One unwrapper, tested, replaces it.

**Interfaces:**
- Consumes: `TextLayerData`, `Scope`, `ExportFormat` from `src/shared/types.ts`
- Produces:
  - `type UiToMain` — union of `{ type: 'extract'; scope: Scope }`, `{ type: 'import'; rows: TextLayerData[] }`, `{ type: 'cancel' }`
  - `type MainToUi` — union of `{ type: 'extracted'; rows: TextLayerData[] }`, `{ type: 'no-text-found' }`, `{ type: 'import-complete'; updated: number; failed: number; errors: string[] }`, `{ type: 'error'; message: string }`
  - `unwrapUiMessage(event: unknown): UiToMain | null`
  - `unwrapMainMessage(event: unknown): MainToUi | null`

- [ ] **Step 1: Write the failing test**

Create `src/shared/messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { unwrapUiMessage, unwrapMainMessage } from './messages';

describe('unwrapUiMessage', () => {
  it('reads a bare message object', () => {
    expect(unwrapUiMessage({ type: 'cancel' })).toEqual({ type: 'cancel' });
  });

  it('reads a pluginMessage envelope', () => {
    expect(unwrapUiMessage({ pluginMessage: { type: 'cancel' } })).toEqual({
      type: 'cancel',
    });
  });

  it('reads a data.pluginMessage envelope', () => {
    expect(
      unwrapUiMessage({ data: { pluginMessage: { type: 'cancel' } } })
    ).toEqual({ type: 'cancel' });
  });

  it('keeps the payload of a typed message', () => {
    expect(unwrapUiMessage({ pluginMessage: { type: 'extract', scope: 'page' } }))
      .toEqual({ type: 'extract', scope: 'page' });
  });

  it('returns null for an unknown type', () => {
    expect(unwrapUiMessage({ type: 'nonsense' })).toBeNull();
  });

  it('returns null for junk', () => {
    expect(unwrapUiMessage(null)).toBeNull();
    expect(unwrapUiMessage('cancel')).toBeNull();
    expect(unwrapUiMessage({})).toBeNull();
  });
});

describe('unwrapMainMessage', () => {
  it('reads a typed main message', () => {
    expect(unwrapMainMessage({ pluginMessage: { type: 'no-text-found' } }))
      .toEqual({ type: 'no-text-found' });
  });

  it('returns null for a UI-bound type', () => {
    expect(unwrapMainMessage({ type: 'cancel' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test src/shared/messages.test.ts`
Expected: FAIL — `Failed to resolve import "./messages"`.

- [ ] **Step 3: Write the contract**

Create `src/shared/messages.ts`:

```ts
import type { TextLayerData, Scope } from './types';

export type UiToMain =
  | { type: 'extract'; scope: Scope }
  | { type: 'import'; rows: TextLayerData[] }
  | { type: 'cancel' };

export type MainToUi =
  | { type: 'extracted'; rows: TextLayerData[] }
  | { type: 'no-text-found' }
  | { type: 'import-complete'; updated: number; failed: number; errors: string[] }
  | { type: 'error'; message: string };

const UI_TO_MAIN_TYPES = ['extract', 'import', 'cancel'];
const MAIN_TO_UI_TYPES = [
  'extracted',
  'no-text-found',
  'import-complete',
  'error',
];

/**
 * Figma delivers plugin messages under more than one envelope depending on
 * direction and API version. Peel them here, once, so no caller has to guess.
 */
function peel(event: unknown): Record<string, unknown> | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;

  if (typeof e.pluginMessage === 'object' && e.pluginMessage !== null) {
    return e.pluginMessage as Record<string, unknown>;
  }
  if (typeof e.data === 'object' && e.data !== null) {
    const data = e.data as Record<string, unknown>;
    if (typeof data.pluginMessage === 'object' && data.pluginMessage !== null) {
      return data.pluginMessage as Record<string, unknown>;
    }
  }
  return e;
}

function unwrap<T>(event: unknown, allowed: string[]): T | null {
  const payload = peel(event);
  if (!payload || typeof payload.type !== 'string') return null;
  return allowed.includes(payload.type) ? (payload as T) : null;
}

export function unwrapUiMessage(event: unknown): UiToMain | null {
  return unwrap<UiToMain>(event, UI_TO_MAIN_TYPES);
}

export function unwrapMainMessage(event: unknown): MainToUi | null {
  return unwrap<MainToUi>(event, MAIN_TO_UI_TYPES);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test src/shared/messages.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: add typed message contract between sandbox and UI"
```

---

### Task 4: Split the sandbox

`src/code.ts` becomes three focused modules. Traversal and apply logic are written against structural types rather than `figma.*` directly, which is what makes them testable without a Figma runtime.

**Files:**
- Create: `src/main/traverse.ts`, `src/main/traverse.test.ts`
- Create: `src/main/apply.ts`, `src/main/apply.test.ts`
- Create: `src/main/index.ts`
- Create: `tsconfig.main.json`
- Modify: `tsconfig.json`
- Delete: `src/code.ts`

**Interfaces:**
- Consumes: `TextLayerData` and `Scope` from `src/shared/types.ts`; `UiToMain`, `MainToUi`, `unwrapUiMessage` from `src/shared/messages.ts`
- Produces:
  - `interface TraversableNode { readonly type: string; readonly id: string; readonly name: string; readonly characters?: string; readonly children?: ReadonlyArray<TraversableNode> }`
  - `collectTextLayers(roots: ReadonlyArray<TraversableNode>): TextLayerData[]`
  - `interface ApplyDeps { getNode(id: string): Promise<ApplicableNode | null>; loadFonts(node: ApplicableNode): Promise<void> }`
  - `interface ApplyResult { updated: number; failed: number; errors: string[] }`
  - `applyTextChanges(rows: TextLayerData[], deps: ApplyDeps): Promise<ApplyResult>`

- [ ] **Step 1: Write the failing traversal test**

Create `src/main/traverse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectTextLayers, type TraversableNode } from './traverse';

const text = (id: string, name: string, characters: string): TraversableNode =>
  ({ type: 'TEXT', id, name, characters });

const frame = (
  id: string,
  children: TraversableNode[]
): TraversableNode => ({ type: 'FRAME', id, name: `Frame ${id}`, children });

describe('collectTextLayers', () => {
  it('returns an empty list for no roots', () => {
    expect(collectTextLayers([])).toEqual([]);
  });

  it('collects a text node given directly as a root', () => {
    expect(collectTextLayers([text('1:1', 'Title', 'Hello')])).toEqual([
      { id: '1:1', name: 'Title', characters: 'Hello' },
    ]);
  });

  it('descends into children', () => {
    const tree = frame('1:0', [
      text('1:1', 'A', 'one'),
      frame('1:2', [text('1:3', 'B', 'two')]),
    ]);
    expect(collectTextLayers([tree])).toEqual([
      { id: '1:1', name: 'A', characters: 'one' },
      { id: '1:3', name: 'B', characters: 'two' },
    ]);
  });

  it('ignores non-text leaves', () => {
    const tree = frame('1:0', [
      { type: 'RECTANGLE', id: '1:1', name: 'Box' },
      text('1:2', 'A', 'kept'),
    ]);
    expect(collectTextLayers([tree])).toEqual([
      { id: '1:2', name: 'A', characters: 'kept' },
    ]);
  });

  it('keeps empty text layers, which are real and editable', () => {
    expect(collectTextLayers([text('1:1', 'Empty', '')])).toEqual([
      { id: '1:1', name: 'Empty', characters: '' },
    ]);
  });

  it('preserves document order across several roots', () => {
    const result = collectTextLayers([
      text('1:1', 'A', 'one'),
      frame('1:2', [text('1:3', 'B', 'two')]),
      text('1:4', 'C', 'three'),
    ]);
    expect(result.map((r) => r.id)).toEqual(['1:1', '1:3', '1:4']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test src/main/traverse.test.ts`
Expected: FAIL — `Failed to resolve import "./traverse"`.

- [ ] **Step 3: Write the traversal module**

Create `src/main/traverse.ts`:

```ts
import type { TextLayerData } from '../shared/types';

/**
 * The shape traversal actually needs. Figma's SceneNode satisfies it
 * structurally, and a plain object literal does too — which is what lets
 * this be tested without a Figma runtime.
 */
export interface TraversableNode {
  readonly type: string;
  readonly id: string;
  readonly name: string;
  readonly characters?: string;
  readonly children?: ReadonlyArray<TraversableNode>;
}

export function collectTextLayers(
  roots: ReadonlyArray<TraversableNode>
): TextLayerData[] {
  const found: TextLayerData[] = [];
  for (const root of roots) {
    visit(root, found);
  }
  return found;
}

function visit(node: TraversableNode, found: TextLayerData[]): void {
  if (node.type === 'TEXT') {
    found.push({
      id: node.id,
      name: node.name,
      characters: node.characters ?? '',
    });
  }
  if (node.children) {
    for (const child of node.children) {
      visit(child, found);
    }
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test src/main/traverse.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the failing apply test**

Create `src/main/apply.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { applyTextChanges, type ApplicableNode } from './apply';

const node = (id: string, name: string): ApplicableNode => ({
  id,
  name,
  type: 'TEXT',
  characters: '',
});

describe('applyTextChanges', () => {
  it('writes characters and counts the update', async () => {
    const target = node('1:1', 'Title');
    const result = await applyTextChanges(
      [{ id: '1:1', name: 'Title', characters: 'new' }],
      { getNode: async () => target, loadFonts: async () => {} }
    );

    expect(target.characters).toBe('new');
    expect(result).toEqual({ updated: 1, failed: 0, errors: [] });
  });

  it('loads fonts before writing', async () => {
    const order: string[] = [];
    const target = node('1:1', 'Title');
    Object.defineProperty(target, 'characters', {
      set: () => order.push('write'),
      get: () => '',
    });

    await applyTextChanges([{ id: '1:1', name: 'T', characters: 'x' }], {
      getNode: async () => target,
      loadFonts: async () => {
        order.push('fonts');
      },
    });

    expect(order).toEqual(['fonts', 'write']);
  });

  it('reports a missing node without aborting the batch', async () => {
    const target = node('1:2', 'Body');
    const result = await applyTextChanges(
      [
        { id: '1:1', name: 'Gone', characters: 'a' },
        { id: '1:2', name: 'Body', characters: 'b' },
      ],
      {
        getNode: async (id) => (id === '1:2' ? target : null),
        loadFonts: async () => {},
      }
    );

    expect(target.characters).toBe('b');
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('1:1');
  });

  it('reports a node that is no longer a text layer', async () => {
    const result = await applyTextChanges(
      [{ id: '1:1', name: 'Shape', characters: 'a' }],
      {
        getNode: async () => ({ ...node('1:1', 'Shape'), type: 'RECTANGLE' }),
        loadFonts: async () => {},
      }
    );

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('not a text');
  });

  it('survives a font that will not load', async () => {
    const result = await applyTextChanges(
      [{ id: '1:1', name: 'T', characters: 'a' }],
      {
        getNode: async () => node('1:1', 'T'),
        loadFonts: async () => {
          throw new Error('font unavailable');
        },
      }
    );

    expect(result).toEqual({
      updated: 0,
      failed: 1,
      errors: ['Failed to update T: font unavailable'],
    });
  });

  it('caps the error list at five but keeps counting', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      id: `1:${i}`,
      name: `L${i}`,
      characters: 'x',
    }));
    const result = await applyTextChanges(rows, {
      getNode: async () => null,
      loadFonts: async () => {},
    });

    expect(result.failed).toBe(9);
    expect(result.errors).toHaveLength(5);
  });

  it('does nothing for an empty change list', async () => {
    const getNode = vi.fn();
    const result = await applyTextChanges([], { getNode, loadFonts: async () => {} });

    expect(getNode).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, failed: 0, errors: [] });
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm test src/main/apply.test.ts`
Expected: FAIL — `Failed to resolve import "./apply"`.

- [ ] **Step 7: Write the apply module**

Create `src/main/apply.ts`:

```ts
import type { TextLayerData } from '../shared/types';

/** The part of a Figma node this module writes to. */
export interface ApplicableNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  characters: string;
}

export interface ApplyDeps {
  getNode(id: string): Promise<ApplicableNode | null>;
  loadFonts(node: ApplicableNode): Promise<void>;
}

export interface ApplyResult {
  updated: number;
  failed: number;
  errors: string[];
}

/** How many failures are worth showing before the list stops being useful. */
const MAX_REPORTED_ERRORS = 5;

/**
 * One bad layer must not cost the user the rest of the batch, so every failure
 * is caught per row and collected rather than thrown.
 */
export async function applyTextChanges(
  rows: TextLayerData[],
  deps: ApplyDeps
): Promise<ApplyResult> {
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  const fail = (message: string) => {
    failed++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
  };

  for (const row of rows) {
    try {
      const node = await deps.getNode(row.id);
      if (!node) {
        fail(`No layer found with id ${row.id} (${row.name}).`);
        continue;
      }
      if (node.type !== 'TEXT') {
        fail(`Layer ${row.name} (${row.id}) is not a text layer.`);
        continue;
      }

      // Every font the layer uses must be loaded before its text is replaced.
      await deps.loadFonts(node);
      node.characters = row.characters;
      updated++;
    } catch (error) {
      fail(
        `Failed to update ${row.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { updated, failed, errors };
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npm test src/main/apply.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 9: Write the sandbox entry**

Create `src/main/index.ts`:

```ts
import type { Scope } from '../shared/types';
import type { MainToUi } from '../shared/messages';
import { unwrapUiMessage } from '../shared/messages';
import { collectTextLayers, type TraversableNode } from './traverse';
import { applyTextChanges, type ApplicableNode } from './apply';

figma.showUI(__html__, { width: 400, height: 500 });

function send(message: MainToUi): void {
  figma.ui.postMessage(message);
}

/** Resolve a scope to the roots a walk starts from. See spec section 3.1. */
function rootsFor(scope: Scope): ReadonlyArray<TraversableNode> {
  const nodes =
    scope === 'selection'
      ? figma.currentPage.selection
      : figma.currentPage.children;
  // SceneNode satisfies TraversableNode structurally; TypeScript cannot see
  // that through the SceneNode union, so state it once here.
  return nodes as unknown as ReadonlyArray<TraversableNode>;
}

/** Load every font a layer uses, including the mixed-font case. */
async function loadFonts(node: ApplicableNode): Promise<void> {
  const textNode = node as unknown as TextNode;
  if (textNode.fontName === figma.mixed) {
    const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
  } else {
    await figma.loadFontAsync(textNode.fontName);
  }
}

figma.ui.onmessage = async (event: unknown) => {
  const message = unwrapUiMessage(event);
  if (!message) return;

  try {
    switch (message.type) {
      case 'extract': {
        const rows = collectTextLayers(rootsFor(message.scope));
        send(rows.length === 0 ? { type: 'no-text-found' } : { type: 'extracted', rows });
        break;
      }
      case 'import': {
        const result = await applyTextChanges(message.rows, {
          getNode: async (id) =>
            (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
          loadFonts,
        });
        send({ type: 'import-complete', ...result });
        break;
      }
      case 'cancel':
        figma.closePlugin();
        break;
    }
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
```

- [ ] **Step 10: Split the TypeScript config**

The sandbox must not be able to reach the DOM, and the UI must not be able to reach `figma`. Separate configs make that a compile error rather than a code-review habit.

Create `tsconfig.main.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2020"],
    "typeRoots": ["./node_modules/@figma", "./node_modules/@types"],
    "types": ["@figma/plugin-typings"]
  },
  "include": ["src/main/**/*", "src/shared/**/*"]
}
```

Replace `tsconfig.json` with a base that holds only shared settings:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 11: Point the build at the new entry**

In `webpack.config.js`, change the entry:

```js
  entry: {
    code: './src/main/index.ts',
  },
```

and give the `.ts` rule the sandbox config:

```js
      {
        test: /\.ts$/,
        include: [path.resolve(__dirname, 'src/main'), path.resolve(__dirname, 'src/shared')],
        use: { loader: 'ts-loader', options: { configFile: 'tsconfig.main.json', transpileOnly: false } },
        exclude: /node_modules/,
      },
```

- [ ] **Step 12: Delete the old entry**

```bash
git rm src/code.ts
```

- [ ] **Step 13: Verify the whole thing**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass; typecheck clean; webpack emits `dist/code.js` and `dist/ui.html`.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: split sandbox into traverse, apply, and entry modules

Replaces the three-shape envelope guessing at the top of the old code.ts with
the typed contract from shared/messages.ts.

Traversal and apply are written against structural interfaces rather than
figma.* directly, so both are now covered by tests that need no Figma runtime.
Separate tsconfigs keep the DOM out of sandbox code and figma out of UI code
by compilation rather than by convention."
```

---

### Task 5: UI build pipeline

The task the rest of the product waits on. After it, the UI can import npm packages.

Figma plugin UIs must be **a single self-contained HTML file** — no external script loading. So `inject: 'body'` alone is not enough; the emitted bundle has to be folded into the HTML. `html-inline-script-webpack-plugin` does this, but its last release was 2023-08-09, and this is the one build step everything else depends on. The 25-line plugin below does the same job with no new dependency. **It has been verified end-to-end: the output HTML carries the script inline, with no `src=` reference and no stray `.js` asset.**

**Files:**
- Create: `src/ui/index.ts`
- Create: `tsconfig.ui.json`
- Modify: `webpack.config.js`
- Modify: `src/ui.html` (remove the inline `<script>` block, keep the markup and styles)

**Interfaces:**
- Consumes: `toCSV`/`fromCSV` from `src/ui/format/csv.ts`, `toJSON`/`fromJSON` from `src/ui/format/json.ts`, `unwrapMainMessage` and `UiToMain` from `src/shared/messages.ts`
- Produces: `dist/ui.html`, a single file with the UI bundle inlined

- [ ] **Step 1: Add the inlining plugin**

In `webpack.config.js`, above `module.exports`:

```js
// A Figma plugin UI must be one self-contained HTML file: it cannot load an
// external script. Fold each emitted chunk into the HTML as an inline
// <script>, then drop the now-unreferenced .js asset from the output.
class InlineScriptPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('InlineScriptPlugin', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tap(
        'InlineScriptPlugin',
        (data) => {
          data.bodyTags = data.bodyTags.map((tag) => {
            if (tag.tagName !== 'script' || !tag.attributes?.src) return tag;
            const name = path.basename(tag.attributes.src);
            const asset = compilation.assets[name];
            if (!asset) return tag;
            delete compilation.assets[name];
            return { tagName: 'script', closeTag: true, innerHTML: asset.source() };
          });
          return data;
        }
      );
    });
  }
}
```

- [ ] **Step 2: Add the UI entry and its loader rule**

In `webpack.config.js`:

```js
  entry: {
    code: './src/main/index.ts',
    ui: './src/ui/index.ts',
  },
```

Add a second rule beside the sandbox one:

```js
      {
        test: /\.tsx?$/,
        include: [path.resolve(__dirname, 'src/ui'), path.resolve(__dirname, 'src/shared')],
        use: { loader: 'ts-loader', options: { configFile: 'tsconfig.ui.json' } },
        exclude: /node_modules/,
      },
```

Update `resolve.extensions` to `['.tsx', '.ts', '.js']`.

Change the HtmlWebpackPlugin call and register the new plugin:

```js
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/ui.html',
      filename: 'ui.html',
      chunks: ['ui'],
      inject: 'body',
    }),
    new InlineScriptPlugin(),
  ],
```

- [ ] **Step 3: Add the UI TypeScript config**

Create `tsconfig.ui.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": []
  },
  "include": ["src/ui/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: Move the inline script into `src/ui/index.ts`**

Move the body of `src/ui.html:220-800` into `src/ui/index.ts` **unchanged in behaviour**, with these mechanical edits:

1. Delete `parseCSV` and `convertToCSV`; import `fromCSV`/`toCSV` from `./format/csv` and `fromJSON`/`toJSON` from `./format/json` instead.
2. Replace the raw `window.onmessage` body with `unwrapMainMessage(event)` and a `switch` on the returned type, returning early on `null`.
3. Replace each `parent.postMessage({ pluginMessage: {...} }, '*')` payload with a value typed as `UiToMain`. The extract call sends `{ type: 'extract', scope: 'page' }` for now — the scope selector is Phase 1.
4. Add explicit types where `strict` requires them. Prefer narrowing over `any`; use `as HTMLInputElement` and friends for `getElementById` results.
5. Keep every other behaviour identical, including the download fallback chain.

Then delete the entire `<script>…</script>` block from `src/ui.html`, leaving markup and styles. Do not add a `<script src>` — the plugin injects and inlines it.

- [ ] **Step 5: Verify the output is self-contained**

```bash
npm run build
grep -c 'src=' dist/ui.html        # expect 0
test -f dist/ui.js && echo FAIL || echo "no stray bundle: OK"
grep -c '<script>' dist/ui.html    # expect 1
```

Expected: no `src=` attribute, no `dist/ui.js`, exactly one inline `<script>`.

- [ ] **Step 6: Verify in Figma — the parity gate**

This is the one step in the plan that cannot be automated. Load the plugin (**Plugins → Development → Import plugin from manifest…**, select `manifest.json`) and confirm against the pre-change behaviour:

1. Open the plugin on a page with text layers. Click **Extract Text Layers** with CSV selected. A file downloads.
2. Repeat with JSON selected.
3. Edit a `characters` value in the downloaded file, **including one with leading spaces**. Import it. The status reports the right number updated.
4. Check the edited layer in Figma. The leading spaces survived — this is the Task 2 fix reaching the user.
5. Select a single frame, extract, and confirm only that frame's layers appear.
6. Import a file with a layer id that no longer exists. The error is reported and the other rows still apply.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build: bundle the plugin UI and inline it into ui.html

The UI was one inline <script> in ui.html with no build step, so it could not
import a single npm package. Everything later in the roadmap -- document
export, spell-check clients, diff rendering -- was blocked behind that.

Adds a second webpack entry for the UI and a small plugin that folds the
emitted bundle back into ui.html as an inline script, because a Figma plugin
UI must be a single self-contained file. Written here rather than taken from
html-inline-script-webpack-plugin, whose last release was 2023 and which would
sit on the build's critical path.

Behaviour is unchanged; the script moved, it was not rewritten."
```

---

### Task 6: Split the UI into modules

`src/ui/index.ts` arrived from Task 5 as one long file. Break it along the same responsibility lines the rest of the codebase now uses.

**Files:**
- Create: `src/ui/download.ts`, `src/ui/download.test.ts`
- Create: `src/ui/features/extract.ts`
- Create: `src/ui/features/import.ts`
- Modify: `src/ui/index.ts` (becomes wiring only)

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5
- Produces:
  - `filenameFor(format: ExportFormat, now?: Date): string`
  - `mimeTypeFor(format: ExportFormat): string`
  - `download(content: string, filename: string, mimeType: string): Promise<void>`
  - `initExtract(root: Document): void`
  - `initImport(root: Document): void`

- [ ] **Step 1: Write the failing test for the pure parts**

The download fallback chain itself needs a browser, but the naming and MIME
decisions around it do not, and those are what actually vary.

Create `src/ui/download.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filenameFor, mimeTypeFor } from './download';

describe('filenameFor', () => {
  const when = new Date('2026-09-19T14:30:00Z');

  it('names CSV exports with a sortable timestamp', () => {
    expect(filenameFor('csv', when)).toBe('figma-text-layers-2026-09-19.csv');
  });

  it('names JSON exports the same way', () => {
    expect(filenameFor('json', when)).toBe('figma-text-layers-2026-09-19.json');
  });
});

describe('mimeTypeFor', () => {
  it('maps each format', () => {
    expect(mimeTypeFor('csv')).toBe('text/csv');
    expect(mimeTypeFor('json')).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test src/ui/download.test.ts`
Expected: FAIL — `Failed to resolve import "./download"`.

- [ ] **Step 3: Create `src/ui/download.ts`**

Move `tryBlobDownload`, `tryDataUrlDownload`, `tryIframeDownload`, `attemptDownload`, and `displayDownloadContent` from `src/ui/index.ts` unchanged, and add:

```ts
import type { ExportFormat } from '../shared/types';

export function filenameFor(format: ExportFormat, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `figma-text-layers-${date}.${format}`;
}

export function mimeTypeFor(format: ExportFormat): string {
  return format === 'csv' ? 'text/csv' : 'application/json';
}

export async function download(
  content: string,
  filename: string,
  mimeType: string
): Promise<void> {
  await attemptDownload(content, filename, mimeType);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test src/ui/download.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Move the feature wiring**

Move the format selector and extract-button handlers into `src/ui/features/extract.ts` as `initExtract(root: Document)`. Move the file input and import-button handlers into `src/ui/features/import.ts` as `initImport(root: Document)`. `src/ui/index.ts` keeps only the message listener and:

```ts
initExtract(document);
initImport(document);
```

- [ ] **Step 6: Verify nothing moved that should not have**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green; `dist/ui.html` still has exactly one inline `<script>` and no `src=`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: split the UI entry into download and feature modules"
```

---

### Task 7: Prove the Preact pipeline

Phase 1 builds a diff table with per-row selection — stateful list rendering, the case hand-written DOM handles worst. That is where Preact earns its place, so components are not ported here. What this task does is prove the pipeline compiles and ships TSX, so Phase 1 does not open with a build problem.

The status banner is the right subject: small, self-contained, and already re-rendered imperatively.

**Files:**
- Create: `src/ui/status.tsx`
- Modify: `src/ui/index.ts`, `package.json`, `src/ui.html`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `showStatus(message: string, kind: 'info' | 'success' | 'error'): void` — same signature the old `showStatus` had, so callers do not change

- [ ] **Step 1: Install Preact**

```bash
npm install preact@^10.29.8
```

Note this is a `dependencies` entry, not `devDependencies` — it ships inside the bundle.

- [ ] **Step 2: Write the component**

Create `src/ui/status.tsx`:

```tsx
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

type Kind = 'info' | 'success' | 'error';
interface Status { message: string; kind: Kind; seq: number }

/** Info messages are transient; success and error stay until replaced. */
const AUTO_HIDE_MS = 3000;

let publish: (status: Status | null) => void = () => {};
let seq = 0;

function StatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  publish = setStatus;

  useEffect(() => {
    if (!status || status.kind !== 'info') return;
    const timer = setTimeout(() => setStatus(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [status?.seq]);

  if (!status) return null;
  return <div class={`status ${status.kind}`}>{status.message}</div>;
}

export function mountStatus(host: HTMLElement): void {
  render(<StatusBanner />, host);
}

export function showStatus(message: string, kind: Kind): void {
  publish({ message, kind, seq: seq++ });
}
```

- [ ] **Step 3: Mount it**

In `src/ui.html`, replace the existing status `<div>` with an empty host:

```html
<div id="status-host"></div>
```

In `src/ui/index.ts`, delete the old `showStatus` function and add at the top of the wiring:

```ts
import { mountStatus, showStatus } from './status';

mountStatus(document.getElementById('status-host')!);
```

Every existing `showStatus(...)` call site keeps working unchanged.

- [ ] **Step 4: Verify TSX survives the build**

```bash
npm run typecheck && npm run build
grep -c 'src=' dist/ui.html   # expect 0
```

Expected: typecheck clean, build succeeds, output still self-contained. Note the bundle grows by roughly 4 KB — that is Preact, and it is the whole cost.

- [ ] **Step 5: Verify in Figma**

Reload the plugin. Extract text and confirm the status banner appears and, for an info message, disappears after about three seconds. Trigger an error (import a file with a bad id) and confirm that message stays visible.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: render the status banner with Preact to prove the TSX pipeline

Phase 1's diff table is stateful list rendering, which is where Preact earns
its 4 KB. Porting components is that phase's work; this only proves TSX
compiles, bundles, and still inlines, so Phase 1 does not open by debugging
the build."
```

---

### Task 8: Documentation and parity close-out

**Files:**
- Modify: `README.md`, `CHANGELOG.md`
- Create: `docs/verification/phase-0-parity.md`

**Interfaces:**
- Consumes: the finished state of Tasks 1-7
- Produces: documentation matching the shipped structure

- [ ] **Step 1: Correct the project structure in the README**

`README.md:87-98` still describes `src/code.ts` and `src/ui.html` as the whole project. Replace that block with the real tree:

```
MuffinSync/
├── src/
│   ├── main/            # Figma sandbox: traversal, applying text
│   ├── shared/          # Typed contract between sandbox and UI
│   └── ui/              # Plugin UI: formats, download, features
├── dist/                # Build output (generated; not committed)
├── manifest.json
├── tsconfig.json        # Base config; tsconfig.main.json and .ui.json extend it
└── webpack.config.js
```

- [ ] **Step 2: Document the test commands**

Add to the README's Installation and Build block:

```bash
# Run the test suite
npm test

# Re-run on change
npm run test:watch
```

- [ ] **Step 3: Record the release note**

Add under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
### Fixed
- **CSV round-trip preserved layer text exactly.** Leading and trailing
  whitespace, tab indentation, and carriage returns were silently lost or
  truncated when exporting and re-importing. Values needing protection are now
  quoted, and quoted fields are never trimmed on the way back in.

### Changed
- The plugin UI is bundled rather than written as one inline script, so it can
  use npm packages. Output is still a single self-contained `ui.html`, as Figma
  requires.
- Source is split into `src/main/` (sandbox), `src/ui/` (iframe), and
  `src/shared/` (the typed contract between them). Separate TypeScript configs
  keep DOM APIs out of sandbox code and Figma APIs out of UI code.

### Added
- Test suite (vitest) covering CSV and JSON handling, the message contract,
  layer traversal, and text application. The project previously had none.
```

- [ ] **Step 4: Write down the manual check**

Parts of this plugin cannot be tested without Figma. Record what must be checked by hand so it is repeatable rather than remembered.

Create `docs/verification/phase-0-parity.md` listing the six checks from Task 5 Step 6 plus the Preact check from Task 7 Step 5, each with its expected result.

- [ ] **Step 5: Full verification**

```bash
npm ci
npm test
npm run typecheck
npm run build
npm audit
```

Expected: clean install, all tests pass, no type errors, build succeeds, zero vulnerabilities.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: bring README and CHANGELOG up to the Phase 0 structure"
```

---

## What Phase 0 does not do

Stated so no reviewer looks for them:

- **No scope selector.** `extract` sends `scope: 'page'` unconditionally. The selector, and the `selectionchange` invalidation that goes with it, are Phase 1 (spec section 3.1).
- **No Change Set.** Import still applies directly. Routing it through review is Phase 1.
- **No Preact port.** Only the status banner, and only to prove the pipeline.
- **No network.** `manifest.json` keeps `allowedDomains: ["none"]`.
- **No chunked traversal.** `collectTextLayers` stays synchronous recursion. The spec lists UI freezing on very large documents as a risk; it needs a document with thousands of text layers to measure against, and fixing it before measuring would be guesswork.

---

## Self-review

**Spec coverage.** Section 2.1 module layout → Tasks 2-6. Section 2.2 invariants → Task 4 Step 10, enforced by split tsconfigs. Section 2.3 Preact → Task 7. Section 3.1 scope → deliberately deferred, recorded above. Section 5 build pipeline and inlining → Task 5. Section 6 testing → Tasks 1, 2, 3, 4, 6. Section 8 risk "bundle inlining proves awkward, confirm first" → Task 5, already verified before this plan was written. Section 8 risk "large documents freeze the UI" → deferred with a reason.

**Type consistency.** `TextLayerData` is defined once in Task 1 and imported everywhere after. `collectTextLayers` and `applyTextChanges` keep the names given in Task 4's Interfaces block. `ApplicableNode` is defined in `apply.ts` and imported by `main/index.ts`. `FormatError` is defined in `csv.ts` and imported by `json.ts` and its test. `showStatus` keeps its original signature so Task 7 changes no call site.

**One known rough edge.** Task 5 Step 4 is a move of ~580 lines and is the largest single step here. It resists decomposition: the inline script has to leave `ui.html` in one piece or the plugin is broken in between. Its gate is the six-point manual parity check in Step 6, which is why that check is specified in full rather than left to judgement.
