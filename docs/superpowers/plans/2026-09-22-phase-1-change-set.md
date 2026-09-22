# Phase 1 — Change Set and Diff Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop import from overwriting the document the moment a file is chosen. Every change is proposed, shown, and applied only if the user accepts it.

**Architecture:** The UI parses the file but cannot read the document, so it sends the parsed rows to the sandbox, which compares them against the current text and returns a `ChangeSet`. The UI renders that set as a review screen; accepted changes go back for applying. This is the first surface where Preact earns its place — a list with per-row selection — so the DOM test environment arrives with it.

**Tech Stack:** TypeScript 5.9, webpack 5.111, vitest 5.0, preact 10.29, happy-dom 20 (new)

**Spec:** `docs/superpowers/specs/2026-09-19-copy-qa-design.md` — sections 3, 3.1, 3.2, 3.3

## Global Constraints

- **Node 22+.** `engines.node` is `>=22`; CI runs Node 22.
- **The sandbox never touches the network.** No `fetch` in `src/main/`.
- **The UI never touches Figma nodes.** No `figma.*` in `src/ui/`. The split tsconfigs enforce this at compile time — reaching for `figma` in UI code will not compile.
- **Everything crossing that boundary goes through `src/shared/messages.ts`**, and every variant validates its payload fields. Adding a message type without validating its fields is how Phase 0's one Important finding happened.
- **`manifest.json` stays at `networkAccess.allowedDomains: ["none"]`.** Nothing here needs the network.
- **`documentAccess` is `dynamic-page`** — node lookup uses `figma.getNodeByIdAsync()`, never the synchronous form.
- **`dist/` is gitignored.** Never commit build output.
- Run `npm test && npm run typecheck && npm run build` before every commit. All three must pass.
- 65 tests pass at the start of this phase.

---

## What changes for the user

Today, choosing a file applies it immediately and reports counts afterwards. After this phase, choosing a file shows what would change and applies nothing until the user says so. That is the whole point of the phase, and it is a deliberate, visible behaviour change — unlike Phase 0.

Extraction also stops guessing: the scope it uses becomes a visible choice rather than an inference from whether something happens to be selected.

---

## Verified before writing this plan

Two things were tested rather than assumed, because a wrong guess about either would block the phase on day one.

**1. Component testing works, but not the obvious way.** Rendering a Preact component under vitest needs three things, and the first is easy to get wrong:

- **vitest 5 uses oxc, not esbuild.** Setting `esbuild: { jsx, jsxImportSource }` is silently ignored — vitest prints `oxc options will be used and esbuild options will be ignored` and the JSX compiles against the wrong runtime, failing at render with `TypeError: Cannot add property __, object is not extensible`. The working configuration is `oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }`.
- **Preact batches state updates**, so asserting immediately after calling a setter sees an empty container. Wrap the call in `act()` from `preact/test-utils`, which ships inside preact — no new dependency.
- **`happy-dom` works**; plain `h()` rendering passed under it before the JSX config was fixed, which is how the two problems were told apart.

**2. The status banner's rendered output.** With that recipe in place, `status.tsx` renders exactly:

| Input | Output |
|---|---|
| no status yet | `` (empty) |
| `showStatus('hello', 'success')` | `<div class="status success">hello</div>` |
| `showStatus(msg, 'error', ['one','two'])` | `<div class="status error">msg<br><small>one<br>two</small></div>` |

That confirms Phase 0's separator fix empirically, where previously it had only been read off the compiled JSX.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/main/plan.ts` | Compare rows against the document, produce a `ChangeSet` |
| `src/ui/features/review/screen.tsx` | The review screen |
| `src/ui/features/review/index.ts` | Open/close the review, own its state |
| `src/ui/features/scope.ts` | The shared scope selector |
| `src/**/*.test.ts(x)` | Tests beside what they test |

**Modified:** `src/shared/types.ts`, `src/shared/messages.ts`, `src/main/index.ts`, `src/main/apply.ts`, `src/ui/index.ts`, `src/ui/features/import.ts`, `src/ui/features/extract.ts`, `src/ui.html`, `vitest.config.ts`, `package.json`, `README.md`, `CHANGELOG.md`

**Deleted:** nothing.

---

## Deliberate deviations from the spec

State these up front so a reviewer does not flag them as drift.

**`ChangeSet.scope` is not implemented in this phase.** The spec includes it, set only by traversal-based producers. The only producer here is import, whose targets come from the file, so nothing would ever set it. It arrives in Phase 2 with find & replace.

**`selectionchange` invalidation is not implemented either**, for the same reason: it invalidates change sets whose scope is `selection`, and this phase produces none. The scope *selector* is built; the invalidation rule it eventually protects has nothing to protect yet.

---

### Task 1: DOM test environment

Everything about the review screen's correctness depends on being able to assert rendered output. Do this first, and prove it on the component that already exists.

**Files:**
- Modify: `vitest.config.ts`, `package.json`
- Create: `src/ui/status.test.tsx`

**Interfaces:**
- Consumes: `mountStatus`, `showStatus` from `src/ui/status.tsx` (unchanged)
- Produces: a working `// @vitest-environment happy-dom` docblock for any test file that needs a DOM; everything else stays on `node`

- [ ] **Step 1: Install happy-dom**

```bash
npm install -D happy-dom@^20.14.5
```

- [ ] **Step 2: Configure the JSX transform**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vitest 5 transforms with oxc. Setting `esbuild.jsx` here is accepted and
  // then ignored — it warns and compiles JSX against the wrong runtime, which
  // fails at render with "Cannot add property __, object is not extensible".
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  test: {
    // Pure modules stay on `node`, which is faster. A component test opts into
    // a DOM per file with `// @vitest-environment happy-dom`.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/ui/status.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'preact/test-utils';
import { mountStatus, showStatus } from './status';

describe('status banner', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    // Preact batches updates, so every render must be flushed before asserting.
    act(() => {
      mountStatus(host);
    });
  });

  it('renders nothing before any status', () => {
    expect(host.innerHTML).toBe('');
  });

  it('renders the message with its kind as a class', () => {
    act(() => {
      showStatus('hello', 'success');
    });
    expect(host.innerHTML).toBe('<div class="status success">hello</div>');
  });

  it('separates detail lines from the message and from each other', () => {
    act(() => {
      showStatus('Updated 0 text layers. (2 errors)', 'error', ['one', 'two']);
    });
    expect(host.innerHTML).toBe(
      '<div class="status error">Updated 0 text layers. (2 errors)' +
        '<br><small>one<br>two</small></div>'
    );
  });

  it('renders no separator when there are no details', () => {
    act(() => {
      showStatus('plain', 'info');
    });
    expect(host.innerHTML).toBe('<div class="status info">plain</div>');
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm test src/ui/status.test.tsx`
Expected: PASS — 4 tests. All four assertions were verified against this exact component before this plan was written; if any fails, the configuration is wrong, not the component.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — 69 tests (65 + 4).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/ui/status.test.tsx
git commit -m "test: add a DOM environment and cover the status banner

Phase 0 shipped a commit whose status detail lines ran into the message text.
Review caught it; no test could, because rendered output had nothing to assert
against. This adds happy-dom, opted into per file so pure tests stay on node.

The JSX config is on oxc rather than esbuild: vitest 5 transforms with oxc and
silently ignores esbuild options, compiling JSX against the wrong runtime."
```

---

### Task 2: the Change Set model

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/plan.ts`, `src/main/plan.test.ts`

**Interfaces:**
- Consumes: `TextLayerData` from `src/shared/types.ts`; `ApplicableNode` from `src/main/apply.ts`
- Produces:
  - `ProposedChange`, `BlockedChange`, `ChangeSet` exported from `src/shared/types.ts`
  - `buildChangeSet(rows: TextLayerData[], deps: PlanDeps, now?: number): Promise<ChangeSet>`
  - `interface PlanDeps { getNode(id: string): Promise<ApplicableNode | null> }`

- [ ] **Step 1: Write the failing test**

Create `src/main/plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildChangeSet } from './plan';
import type { ApplicableNode } from './apply';

const node = (
  id: string,
  name: string,
  characters: string,
  type = 'TEXT'
): ApplicableNode => ({ id, name, type, characters });

/** A document as a lookup table, so no Figma runtime is needed. */
const documentOf = (nodes: ApplicableNode[]) => ({
  getNode: async (id: string) => nodes.find((n) => n.id === id) ?? null,
});

describe('buildChangeSet', () => {
  it('proposes a change when the text differs', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Title', characters: 'new' }],
      documentOf([node('1:1', 'Title', 'old')]),
      1700000000000
    );

    expect(set.changes).toEqual([
      {
        nodeId: '1:1',
        layerName: 'Title',
        before: 'old',
        after: 'new',
        source: 'import',
        accepted: true,
      },
    ]);
    expect(set.blocked).toEqual([]);
    expect(set.unchangedCount).toBe(0);
    expect(set.createdAt).toBe(1700000000000);
  });

  it('counts rows that match without listing them', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Title', characters: 'same' }],
      documentOf([node('1:1', 'Title', 'same')])
    );

    expect(set.changes).toEqual([]);
    expect(set.unchangedCount).toBe(1);
  });

  it('treats a whitespace-only difference as a real change', async () => {
    // The CSV round-trip fix exists so this difference survives a file. It must
    // not be swallowed here.
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Title', characters: '  spaced  ' }],
      documentOf([node('1:1', 'Title', 'spaced')])
    );

    expect(set.changes).toHaveLength(1);
    expect(set.changes[0].after).toBe('  spaced  ');
  });

  it('blocks a row whose layer is gone, naming it from the file', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'Old CTA', characters: 'x' }],
      documentOf([])
    );

    expect(set.changes).toEqual([]);
    expect(set.blocked).toEqual([
      { nodeId: '1:1', layerName: 'Old CTA', reason: 'missing' },
    ]);
  });

  it('blocks a row whose node is no longer text, naming it from the document', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'stale name', characters: 'x' }],
      documentOf([node('1:1', 'Now a rectangle', '', 'RECTANGLE')])
    );

    expect(set.blocked).toEqual([
      { nodeId: '1:1', layerName: 'Now a rectangle', reason: 'not-text' },
    ]);
  });

  it('uses the document layer name, not the one in the file', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', name: 'renamed in the file', characters: 'new' }],
      documentOf([node('1:1', 'Actual name', 'old')])
    );

    expect(set.changes[0].layerName).toBe('Actual name');
  });

  it('keeps every category in one pass', async () => {
    const set = await buildChangeSet(
      [
        { id: '1:1', name: 'A', characters: 'changed' },
        { id: '1:2', name: 'B', characters: 'same' },
        { id: '1:3', name: 'C', characters: 'x' },
      ],
      documentOf([node('1:1', 'A', 'original'), node('1:2', 'B', 'same')])
    );

    expect(set.changes).toHaveLength(1);
    expect(set.unchangedCount).toBe(1);
    expect(set.blocked).toHaveLength(1);
  });

  it('returns an empty set for no rows', async () => {
    const set = await buildChangeSet([], documentOf([]));
    expect(set).toMatchObject({ changes: [], blocked: [], unchangedCount: 0 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test src/main/plan.test.ts`
Expected: FAIL — `Failed to resolve import "./plan"`.

- [ ] **Step 3: Add the types**

Append to `src/shared/types.ts`:

```ts
/** A text change the user may accept. See spec section 3. */
export interface ProposedChange {
  nodeId: string;
  layerName: string;
  before: string;
  after: string;
  source: 'import' | 'find-replace' | 'spellcheck';
  reason?: string;        // spellcheck explains itself; others do not
  accepted: boolean;      // the user's decision in review
}

/** A row naming a target the document cannot offer. Never applied. */
export interface BlockedChange {
  nodeId: string;
  layerName: string;
  reason: 'missing' | 'not-text';
}

export interface ChangeSet {
  changes: ProposedChange[];   // only rows whose text actually differs
  blocked: BlockedChange[];    // shown in review, never selectable
  unchangedCount: number;      // counted, not listed
  createdAt: number;
}
```

- [ ] **Step 4: Write the planner**

Create `src/main/plan.ts`:

```ts
import type { TextLayerData, ChangeSet, ProposedChange, BlockedChange } from '../shared/types';
import type { ApplicableNode } from './apply';

export interface PlanDeps {
  getNode(id: string): Promise<ApplicableNode | null>;
}

/**
 * Compare what a file says against what the document currently holds.
 *
 * The UI cannot read the document, so it cannot know the "before" text; this
 * runs in the sandbox and hands back a complete set. `now` is injectable so
 * the result is deterministic under test.
 */
export async function buildChangeSet(
  rows: TextLayerData[],
  deps: PlanDeps,
  now: number = Date.now()
): Promise<ChangeSet> {
  const changes: ProposedChange[] = [];
  const blocked: BlockedChange[] = [];
  let unchangedCount = 0;

  for (const row of rows) {
    const node = await deps.getNode(row.id);

    if (!node) {
      // The document has no node to ask, so the file's name is all we have.
      blocked.push({ nodeId: row.id, layerName: row.name, reason: 'missing' });
      continue;
    }
    if (node.type !== 'TEXT') {
      blocked.push({ nodeId: row.id, layerName: node.name, reason: 'not-text' });
      continue;
    }
    if (node.characters === row.characters) {
      unchangedCount++;
      continue;
    }

    changes.push({
      nodeId: row.id,
      // The document is the authority on what a layer is called; a file can
      // carry a name that was edited or has gone stale.
      layerName: node.name,
      before: node.characters,
      after: row.characters,
      source: 'import',
      // Checked by default: review is for vetoing, not for re-approving every
      // line of a file the user just edited on purpose.
      accepted: true,
    });
  }

  return { changes, blocked, unchangedCount, createdAt: now };
}
```

- [ ] **Step 5: Run it**

Run: `npm test src/main/plan.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/plan.ts src/main/plan.test.ts
git commit -m "feat: build a change set by comparing a file against the document

Splits the three outcomes a row can have -- differs, matches, cannot be
applied -- so the review screen can show each appropriately. Unchanged rows are
counted rather than listed; a re-imported file usually differs in a handful of
rows out of hundreds.

A whitespace-only difference counts as a change. The CSV round-trip fix exists
so that difference survives the file, and swallowing it here would undo that."
```

---

### Task 3: the message contract

**Files:**
- Modify: `src/shared/messages.ts`, `src/shared/messages.test.ts`

**Interfaces:**
- Consumes: `ProposedChange`, `ChangeSet` from `src/shared/types.ts`
- Produces: `UiToMain` gains `plan-import` and `apply` and loses `import`; `MainToUi` gains `change-set`. Both unwrappers validate the new payloads.

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/messages.test.ts`, inside the existing describe blocks. Do not modify any existing test.

```ts
  const change = {
    nodeId: '1:1',
    layerName: 'Title',
    before: 'old',
    after: 'new',
    source: 'import',
    accepted: true,
  };

  it('accepts plan-import with well-formed rows', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'plan-import', rows })).toEqual({
      type: 'plan-import',
      rows,
    });
  });

  it('rejects plan-import without rows', () => {
    expect(unwrapUiMessage({ type: 'plan-import' })).toBeNull();
  });

  it('accepts apply with well-formed changes', () => {
    expect(unwrapUiMessage({ type: 'apply', changes: [change] })).toEqual({
      type: 'apply',
      changes: [change],
    });
  });

  it('rejects apply whose changes are not proposals', () => {
    expect(unwrapUiMessage({ type: 'apply', changes: [{ nodeId: 1 }] })).toBeNull();
  });

  it('rejects apply without changes', () => {
    expect(unwrapUiMessage({ type: 'apply' })).toBeNull();
  });

  it('no longer recognises the old import message', () => {
    const rows = [{ id: '1:1', name: 'A', characters: 'x' }];
    expect(unwrapUiMessage({ type: 'import', rows })).toBeNull();
  });
```

and in the `unwrapMainMessage` block:

```ts
  it('accepts a change-set and keeps its contents', () => {
    const changeSet = {
      changes: [change],
      blocked: [{ nodeId: '1:2', layerName: 'Gone', reason: 'missing' }],
      unchangedCount: 7,
      createdAt: 1700000000000,
    };
    expect(unwrapMainMessage({ pluginMessage: { type: 'change-set', changeSet } })).toEqual(
      { type: 'change-set', changeSet }
    );
  });

  it('rejects a change-set missing its counts', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'change-set',
          changeSet: { changes: [], blocked: [] },
        },
      })
    ).toBeNull();
  });

  it('rejects a change-set whose blocked reason is unknown', () => {
    expect(
      unwrapMainMessage({
        pluginMessage: {
          type: 'change-set',
          changeSet: {
            changes: [],
            blocked: [{ nodeId: '1:1', layerName: 'x', reason: 'banana' }],
            unchangedCount: 0,
            createdAt: 1,
          },
        },
      })
    ).toBeNull();
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test src/shared/messages.test.ts`
Expected: FAIL — the new accept cases return `null` because the types do not exist yet.

- [ ] **Step 3: Extend the contract**

In `src/shared/messages.ts`, import the new types, replace the `import` variant, and add the validators. Keep `peel` and `isTextLayerRows` exactly as they are.

```ts
import type {
  TextLayerData,
  Scope,
  ProposedChange,
  BlockedChange,
  ChangeSet,
} from './types';

export type UiToMain =
  | { type: 'extract'; scope: Scope }
  | { type: 'plan-import'; rows: TextLayerData[] }
  | { type: 'apply'; changes: ProposedChange[] }
  | { type: 'cancel' };

export type MainToUi =
  | { type: 'extracted'; rows: TextLayerData[] }
  | { type: 'no-text-found' }
  | { type: 'change-set'; changeSet: ChangeSet }
  | { type: 'import-complete'; updated: number; failed: number; errors: string[] }
  | { type: 'error'; message: string };
```

Add these guards beside `isTextLayerRows`:

```ts
const SOURCES = ['import', 'find-replace', 'spellcheck'];
const BLOCK_REASONS = ['missing', 'not-text'];

function isProposedChanges(value: unknown): value is ProposedChange[] {
  return (
    Array.isArray(value) &&
    value.every((c) => {
      if (typeof c !== 'object' || c === null) return false;
      const v = c as Record<string, unknown>;
      return (
        typeof v.nodeId === 'string' &&
        typeof v.layerName === 'string' &&
        typeof v.before === 'string' &&
        typeof v.after === 'string' &&
        typeof v.source === 'string' &&
        SOURCES.includes(v.source) &&
        typeof v.accepted === 'boolean' &&
        (v.reason === undefined || typeof v.reason === 'string')
      );
    })
  );
}

function isBlockedChanges(value: unknown): value is BlockedChange[] {
  return (
    Array.isArray(value) &&
    value.every((b) => {
      if (typeof b !== 'object' || b === null) return false;
      const v = b as Record<string, unknown>;
      return (
        typeof v.nodeId === 'string' &&
        typeof v.layerName === 'string' &&
        typeof v.reason === 'string' &&
        BLOCK_REASONS.includes(v.reason)
      );
    })
  );
}

function isChangeSet(value: unknown): value is ChangeSet {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isProposedChanges(v.changes) &&
    isBlockedChanges(v.blocked) &&
    typeof v.unchangedCount === 'number' &&
    typeof v.createdAt === 'number'
  );
}
```

Then in `unwrapUiMessage`, replace the `import` case with:

```ts
    case 'plan-import':
      return isTextLayerRows(p.rows) ? { type: 'plan-import', rows: p.rows } : null;
    case 'apply':
      return isProposedChanges(p.changes) ? { type: 'apply', changes: p.changes } : null;
```

and in `unwrapMainMessage`, add:

```ts
    case 'change-set':
      return isChangeSet(p.changeSet) ? { type: 'change-set', changeSet: p.changeSet } : null;
```

- [ ] **Step 4: Run it**

Run: `npm test src/shared/messages.test.ts`
Expected: PASS. Every pre-existing test in this file must still pass untouched.

- [ ] **Step 5: Prove the validators bite**

Temporarily change `typeof v.unchangedCount === 'number'` to `typeof v.unchangedCount === 'string'` in `isChangeSet`. Run the suite: the `accepts a change-set` test must FAIL. Restore it and confirm the suite is green again. Report both results — this is the check Phase 0 learned to make.

- [ ] **Step 6: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: add plan-import, apply, and change-set to the contract

Import is now two steps: ask what would change, then apply what was accepted.
The old one-shot import message is gone rather than deprecated, so nothing can
reach the document without passing through review.

Every new payload is validated field by field, including the enum values for a
change's source and a blocked row's reason."
```

---

### Task 4: wire the sandbox

**Files:**
- Modify: `src/main/index.ts`, `src/main/apply.ts`, `src/main/apply.test.ts`

**Interfaces:**
- Consumes: `buildChangeSet` from `src/main/plan.ts`; the new message types
- Produces: `applyTextChanges(changes: ProposedChange[], deps: ApplyDeps): Promise<ApplyResult>` — the parameter type changes from `TextLayerData[]`

- [ ] **Step 1: Update the apply tests**

In `src/main/apply.test.ts`, change every call to pass `ProposedChange` objects instead of `TextLayerData`. A row that was `{ id: '1:1', name: 'Title', characters: 'new' }` becomes:

```ts
{
  nodeId: '1:1',
  layerName: 'Title',
  before: 'old',
  after: 'new',
  source: 'import' as const,
  accepted: true,
}
```

Keep every assertion — counts, the five-error cap, the font-ordering check, the per-row failure collection — exactly as they are. The point of this task is that none of that behaviour changes.

Add one test asserting the new contract explicitly:

```ts
  it('writes the after text, not the before text', async () => {
    const target = node('1:1', 'Title');
    await applyTextChanges(
      [
        {
          nodeId: '1:1',
          layerName: 'Title',
          before: 'old',
          after: 'new',
          source: 'import',
          accepted: true,
        },
      ],
      { getNode: async () => target, loadFonts: async () => {} }
    );
    expect(target.characters).toBe('new');
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test src/main/apply.test.ts`
Expected: FAIL — type errors and/or `undefined` written, because `applyTextChanges` still reads `row.id` and `row.characters`.

- [ ] **Step 3: Change the signature**

In `src/main/apply.ts`, change the parameter to `changes: ProposedChange[]` and read `change.nodeId`, `change.layerName`, and `change.after` in place of `row.id`, `row.name`, and `row.characters`. Leave everything else — the `MAX_REPORTED_ERRORS` cap, the per-row try/catch, the missing-and-not-text checks, the font load before the write — untouched.

Those two checks stay even though review already screened for them: the document can change between review and apply.

- [ ] **Step 4: Route the new messages**

In `src/main/index.ts`, replace the `import` case with these two. Keep the surrounding try/catch and its operation-naming wrapper.

```ts
      case 'plan-import': {
        try {
          const changeSet = await buildChangeSet(message.rows, {
            getNode: async (id) =>
              (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
          });
          send({ type: 'change-set', changeSet });
        } catch (error) {
          throw new Error(
            `Error occurred while planning the import: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'apply': {
        try {
          const result = await applyTextChanges(message.changes, {
            getNode: async (id) =>
              (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
            loadFonts,
          });
          send({ type: 'import-complete', ...result });
        } catch (error) {
          throw new Error(
            `Error occurred during text import: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green. The UI will not compile against the removed `import` message if anything still sends it — that is the point; Task 6 fixes the UI.

If the build fails because `src/ui/features/import.ts` still posts `{ type: 'import' }`, that is expected at this point. Leave it broken and say so in your report; do not patch the UI here.

- [ ] **Step 6: Commit**

```bash
git add src/main/
git commit -m "feat: plan imports in the sandbox before applying them

applyTextChanges now takes proposed changes rather than file rows, so the text
it writes is the one the user accepted rather than whatever the file said.

The missing and not-text checks stay in apply even though planning already
screened for them: the document can change between the two."
```

---

### Task 5: the review screen

**Files:**
- Create: `src/ui/features/review/screen.tsx`, `src/ui/features/review/screen.test.tsx`

**Interfaces:**
- Consumes: `ChangeSet`, `ProposedChange` from `src/shared/types.ts`
- Produces:
  - `interface ReviewProps { changeSet: ChangeSet; onApply(accepted: ProposedChange[]): void; onCancel(): void }`
  - `export function ReviewScreen(props: ReviewProps)`

This is a pure component: it takes a change set and reports a decision. It sends no messages and reads no globals, so it is fully testable.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/features/review/screen.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ReviewScreen } from './screen';
import type { ChangeSet, ProposedChange } from '../../../shared/types';

const change = (nodeId: string, after: string): ProposedChange => ({
  nodeId,
  layerName: `Layer ${nodeId}`,
  before: 'before',
  after,
  source: 'import',
  accepted: true,
});

const setOf = (partial: Partial<ChangeSet>): ChangeSet => ({
  changes: [],
  blocked: [],
  unchangedCount: 0,
  createdAt: 0,
  ...partial,
});

let host: HTMLElement;
const draw = (changeSet: ChangeSet, onApply = vi.fn(), onCancel = vi.fn()) => {
  act(() => {
    render(
      <ReviewScreen changeSet={changeSet} onApply={onApply} onCancel={onCancel} />,
      host
    );
  });
  return { onApply, onCancel };
};

const rows = () => Array.from(host.querySelectorAll('[data-change]'));
const boxes = () =>
  Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-change]'));
const applyButton = () =>
  host.querySelector<HTMLButtonElement>('[data-action=apply]');

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('ReviewScreen', () => {
  it('lists one row per change and none for unchanged rows', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')], unchangedCount: 197 }));
    expect(rows()).toHaveLength(2);
  });

  it('says how many changed out of how many were seen', () => {
    draw(setOf({ changes: [change('1:1', 'a')], unchangedCount: 199 }));
    expect(host.textContent).toContain('1 of 200 layers changed');
  });

  it('shows the before and after text of each change', () => {
    draw(setOf({ changes: [change('1:1', 'the new text')] }));
    expect(host.textContent).toContain('before');
    expect(host.textContent).toContain('the new text');
  });

  it('starts with every change selected', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));
    expect(boxes().every((b) => b.checked)).toBe(true);
  });

  it('applies only the changes still selected', () => {
    const { onApply } = draw(
      setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] })
    );

    act(() => {
      boxes()[0].click();
    });
    act(() => {
      applyButton()?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    const accepted = onApply.mock.calls[0][0] as ProposedChange[];
    expect(accepted.map((c) => c.nodeId)).toEqual(['1:2']);
  });

  it('counts the selection in the apply button', () => {
    draw(setOf({ changes: [change('1:1', 'a'), change('1:2', 'b')] }));
    expect(applyButton()?.textContent).toContain('2');

    act(() => {
      boxes()[0].click();
    });
    expect(applyButton()?.textContent).toContain('1');
  });

  it('disables applying when nothing is selected', () => {
    draw(setOf({ changes: [change('1:1', 'a')] }));
    act(() => {
      boxes()[0].click();
    });
    expect(applyButton()?.disabled).toBe(true);
  });

  it('lists blocked rows with a reason and no checkbox', () => {
    draw(
      setOf({
        changes: [change('1:1', 'a')],
        blocked: [{ nodeId: '1:9', layerName: 'Old CTA', reason: 'missing' }],
      })
    );

    expect(host.textContent).toContain('Old CTA');
    expect(host.textContent).toContain('Cannot apply');
    // one checkbox for the change, none for the blocked row
    expect(boxes()).toHaveLength(1);
  });

  it('still allows applying when some rows are blocked', () => {
    draw(
      setOf({
        changes: [change('1:1', 'a')],
        blocked: [{ nodeId: '1:9', layerName: 'Old CTA', reason: 'not-text' }],
      })
    );
    expect(applyButton()?.disabled).toBe(false);
  });

  it('reports a cancel without applying anything', () => {
    const { onApply, onCancel } = draw(setOf({ changes: [change('1:1', 'a')] }));
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-action=cancel]')?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says so when a file changes nothing', () => {
    draw(setOf({ unchangedCount: 12 }));
    expect(host.textContent).toContain('No changes');
    expect(applyButton()?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test src/ui/features/review/screen.test.tsx`
Expected: FAIL — `Failed to resolve import "./screen"`.

- [ ] **Step 3: Write the component**

Create `src/ui/features/review/screen.tsx`. Requirements, all asserted by the tests above:

- Header: `<n> of <total> layers changed`, where total is `changes.length + unchangedCount + blocked.length`. When `changes` is empty, say `No changes to apply` instead.
- A "select all" control that toggles every change.
- One row per change carrying `data-change` on both the row and its checkbox, showing the layer name, then `before` and `after` stacked — not side by side. The panel is 400px wide; two columns leave roughly 170px each, which mangles ordinary UI copy.
- A "Cannot apply" section listing blocked rows with their reason in words, and no checkbox. Blocked rows never disable the apply button.
- An apply button carrying `data-action=apply`, labelled with the number selected, disabled when that number is zero.
- A cancel control carrying `data-action=cancel`.

Own the selection in component state seeded from each change's `accepted`; do not mutate the props. Style with the existing classes in `src/ui.html` where they fit rather than inventing a parallel set.

- [ ] **Step 4: Run it**

Run: `npm test src/ui/features/review/screen.test.tsx`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/features/review/
git commit -m "feat: add the diff review screen

Takes a change set and reports a decision. It sends no messages and reads no
globals, so the whole of its behaviour is under test -- which is what the DOM
environment was added for.

Before and after are stacked rather than side by side: at 400px, two columns
leave about 170px each and wrap ordinary UI copy badly enough to defeat the
point of showing a diff."
```

---

### Task 6: wire the UI

**Files:**
- Modify: `src/ui/features/import.ts`, `src/ui/index.ts`, `src/ui.html`
- Create: `src/ui/features/review/index.ts`

**Interfaces:**
- Consumes: `ReviewScreen`; `post` from `src/ui/post.ts`; `showStatus` from `src/ui/status.ts`
- Produces: `openReview(changeSet: ChangeSet): void` and `closeReview(): void` from `src/ui/features/review/index.ts`

- [ ] **Step 1: Add the review host**

In `src/ui.html`, add an empty host inside the main container, after the import section and before `#status-host`:

```html
      <div id="review-host"></div>
```

- [ ] **Step 2: Own the screen's lifecycle**

Create `src/ui/features/review/index.ts`. It mounts `ReviewScreen` into `#review-host`, hides the main content while review is open, and:

- on apply, posts `{ type: 'apply', changes: accepted }` and closes
- on cancel, closes and shows an info status reading `Import cancelled. Nothing was changed.`

"Hides the main content" means toggling the existing `hidden` class on the wrapper that holds the extract and import sections — `src/ui.html` already uses that class, so do not introduce a second mechanism.

- [ ] **Step 3: Send the new message from import**

In `src/ui/features/import.ts`, replace `post({ type: 'import', rows: data })` with `post({ type: 'plan-import', rows: data })`, and change the status from `Importing file...` to `Checking what would change...` — the file is no longer being imported at that moment, and saying so would be a lie.

- [ ] **Step 4: Handle the change set**

In `src/ui/index.ts`, add a `change-set` case to the switch:

```ts
    case 'change-set':
      debugLog(
        `Change set: ${message.changeSet.changes.length} changed, ` +
          `${message.changeSet.unchangedCount} unchanged, ` +
          `${message.changeSet.blocked.length} blocked`
      );
      openReview(message.changeSet);
      break;
```

and in the existing `import-complete` case, call `closeReview()` before showing the status, so the user lands back on the main screen with the result.

- [ ] **Step 5: Build and verify the bundle**

```bash
npm test && npm run typecheck && npm run build
grep -c 'src=' dist/ui.html        # expect 0
test -f dist/ui.js && echo FAIL || echo "no stray bundle: OK"
grep -c '<script>' dist/ui.html    # expect 1
```

Also confirm the old vocabulary is gone: `grep -c '"import"' dist/ui.html` should not find the removed message type being posted.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: route import through the review screen

Choosing a file now asks the sandbox what would change and shows it. Nothing
reaches the document until the user applies. The status during planning no
longer claims the file is being imported, because it is not."
```

---

### Task 7: the scope selector

**Files:**
- Create: `src/ui/features/scope.ts`, `src/ui/features/scope.test.ts`
- Modify: `src/ui.html`, `src/ui/features/extract.ts`, `src/ui/index.ts`

**Interfaces:**
- Produces:
  - `initScope(root: Document): void`
  - `getScope(): Scope`
  - `setSelectionPresent(present: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `src/ui/features/scope.test.ts` covering the rule from spec 3.1, which is pure logic and needs no DOM:

```ts
import { describe, it, expect } from 'vitest';
import { effectiveScope } from './scope';

describe('effectiveScope', () => {
  it('uses the selection when one is chosen and present', () => {
    expect(effectiveScope('selection', true)).toBe('selection');
  });

  it('falls back to the page when selection is chosen but nothing is selected', () => {
    expect(effectiveScope('selection', false)).toBe('page');
  });

  it('uses the page when the page is chosen', () => {
    expect(effectiveScope('page', true)).toBe('page');
    expect(effectiveScope('page', false)).toBe('page');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test src/ui/features/scope.test.ts`
Expected: FAIL — `Failed to resolve import "./scope"`.

- [ ] **Step 3: Add the control**

Create `src/ui/features/scope.ts` exporting `effectiveScope(chosen: Scope, selectionPresent: boolean): Scope` — returning `'page'` when `chosen` is `'selection'` and nothing is selected — plus `initScope`, `getScope`, and `setSelectionPresent`.

In `src/ui.html`, add a two-option control above the extract button, matching the existing format-selector markup so it does not look bolted on. Label the options **Selection** and **Current page**. Disable the Selection option and show Current page as chosen when nothing is selected.

In `src/ui/features/extract.ts`, replace the hardcoded `post({ type: 'extract', scope: 'selection' })` with `post({ type: 'extract', scope: getScope() })`.

- [ ] **Step 4: Report selection presence to the UI**

The UI cannot ask Figma what is selected. Add to `src/main/index.ts`, after `figma.showUI(...)`:

```ts
const reportSelection = () =>
  send({ type: 'selection', present: figma.currentPage.selection.length > 0 });

figma.on('selectionchange', reportSelection);
reportSelection();
```

Add `{ type: 'selection'; present: boolean }` to `MainToUi` with a validator, and handle it in `src/ui/index.ts` by calling `setSelectionPresent`. Add contract tests for it alongside the others, following the same accept/reject pattern.

Note what this does NOT do: it does not invalidate a change set. That rule in spec 3.1 protects traversal-produced sets, and this phase produces none — Phase 2 adds it with find & replace.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green, bundle still self-contained.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: make the extraction scope a visible choice

Extraction has always used the selection when there was one and the page
otherwise, without saying which it did. A user who left something selected got
a partial file with no indication why. The rule is unchanged; it is now shown
and chosen.

The sandbox reports whether anything is selected, because the UI cannot ask."
```

---

### Task 8: documentation and parity

**Files:**
- Modify: `README.md`, `CHANGELOG.md`
- Create: `docs/verification/phase-1-parity.md`

- [ ] **Step 1: Update the README**

The feature list still describes import as applying immediately. Rewrite that section to describe the review step, and add the scope selector to the usage steps. Verify every path in the project-structure block still exists and add the new directories.

- [ ] **Step 2: Write the CHANGELOG entry**

Under `## [Unreleased]`, in plain prose:
- Import now shows what would change and applies only what is accepted.
- Rows the document cannot take (layer gone, no longer a text layer) are listed before applying rather than reported as errors afterwards.
- Rows that match are counted, not listed.
- The extraction scope is a visible choice rather than an inference.

- [ ] **Step 3: Write the parity checks**

Create `docs/verification/phase-1-parity.md` in the same style as the Phase 0 document — each check with steps and an expected result, noting at the top that these need the Figma desktop app. Cover:
- importing an edited file shows the review with the right counts and only the edited rows listed
- unchecking a row leaves that layer untouched while the others apply
- cancelling applies nothing
- a file with an id that no longer exists shows it under "Cannot apply" before applying, and the rest still apply
- importing an unmodified file says there is nothing to apply
- selecting a frame and choosing **Selection** extracts only that frame; choosing **Current page** extracts the page
- deselecting everything disables the Selection option

- [ ] **Step 4: Full gate**

```bash
npm ci && npm test && npm run typecheck && npm run build && npm audit
```
Expected: clean install, all tests pass, no type errors, build succeeds, zero vulnerabilities.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: describe the review step and how to verify it"
```

---

## What Phase 1 does not do

- **No find & replace, no layer navigation.** Phase 2.
- **No AI, no network.** Phase 3; `manifest.json` is untouched.
- **No `ChangeSet.scope` and no `selectionchange` invalidation.** Both exist in the spec to serve traversal-produced change sets. This phase produces none, so building them now would be building for nothing.
- **No virtualisation of long change lists.** Whether hundreds of rows in a 400px panel is a problem is a question to answer by measuring.
- **The format selector stays decorative.** It has no effect today and this phase does not change that; whether to wire it or remove it is a behaviour decision on its own.

---

## Self-review

**Spec coverage.** Section 3 `ChangeSet`/`ProposedChange`/`BlockedChange` → Task 2. Section 3.1 scope selection → Task 7, with the invalidation rule explicitly deferred and the reason given. Section 3.2 applying → Task 4, including the re-check at write time. Section 3.3 who builds the set, the screen, blocked rows, no virtualisation → Tasks 2, 5, 6. Section 6 testing, DOM environment → Task 1.

**Type consistency.** `ProposedChange`, `BlockedChange` and `ChangeSet` are defined once in Task 2 and imported everywhere after. `buildChangeSet` and `PlanDeps` keep the names from Task 2's interface block. `ApplicableNode` continues to come from `src/main/apply.ts`. `applyTextChanges` changes its parameter type in Task 4 and no earlier task depends on the old one. `ReviewProps` is named identically in Task 5's interface block and its tests.

**Known rough edges.** Task 4 deliberately leaves the build broken between it and Task 6: the sandbox stops accepting `import` before the UI stops sending it. Splitting them is what keeps each diff reviewable, and the plan says so rather than pretending otherwise. Task 5's component requirements are given as a list of asserted behaviours rather than as finished code, because the markup should follow the existing stylesheet — the tests, not this document, are the specification.
