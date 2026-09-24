# Phase 2 — Find & Replace and Layer Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Search the text layers of a page or selection, then replace in the ones the user picks — routed through the same review screen import already uses.

**Architecture:** The sandbox owns matching. `main/search.ts` is pure: it counts occurrences and performs replacement on plain strings. The UI sends a query, gets back a result list, lets the user choose rows, and sends the chosen ids; the sandbox re-reads each node and builds a `ChangeSet` through the same `buildChangeSet` import uses, generalised in Task 2 so each producer supplies only what to write. Two tabs arrive with the second feature.

**Tech Stack:** TypeScript 5.9, webpack 5.111, vitest 5.0, preact 10.29, happy-dom 20

**Spec:** `docs/superpowers/specs/2026-09-19-copy-qa-design.md` — sections 3, 3.1, 3.3, 3.4, 3.5, 6

## Global Constraints

- **Node 22+.** `engines.node` is `>=22`; CI runs Node 22.
- **The sandbox never touches the network.** No `fetch` in `src/main/`.
- **The UI never touches Figma nodes.** No `figma.*` in `src/ui/`. The split tsconfigs enforce this at compile time.
- **Everything crossing that boundary goes through `src/shared/messages.ts`**, and **every variant validates its payload fields, with accept AND reject tests**. Phase 1's final review found `isProposedChanges` pinned by one of its seven checks; every reject fixture added here must violate exactly one check so each is individually load-bearing.
- **`manifest.json` stays at `networkAccess.allowedDomains: ["none"]`.** Nothing here needs the network.
- **`documentAccess` is `dynamic-page`** — node lookup uses `figma.getNodeByIdAsync()`, never the synchronous form.
- **`dist/` is gitignored.** Never commit build output.
- **No regular expressions.** A query is matched literally, by scanning. Do not compile a regex from the query.
- Run `npm test && npm run typecheck && npm run build` before every commit. All three must pass.
- 134 tests across 12 files pass at the start of this phase.

---

## What changes for the user

A second tab appears. It takes a query and a replacement, searches the current page or the selection, and lists every layer that matches with its text and an occurrence count. From that list the user picks rows and continues into the review screen import already uses; nothing is written until they apply there.

Searching alone is useful and supported: leave the replacement empty and the list still answers "where does this appear". Any row in either list can centre its layer in the viewport.

---

## File Structure

**Created:**

- `src/main/search.ts` — `countMatches`, `replaceAll`, `matchingLayers`. Pure; no Figma.
- `src/main/search.test.ts`
- `src/main/navigate.ts` — centre a node in the viewport. Thin Figma wrapper, not unit tested (spec 6).
- `src/ui/features/tabs.ts` — panel switching by class toggle.
- `src/ui/features/tabs.test.ts`
- `src/ui/features/find-replace/results.tsx` — the result list component. Pure: reports a decision, sends nothing.
- `src/ui/features/find-replace/results.test.tsx`
- `src/ui/features/find-replace/index.ts` — the form, the wiring, the messages. `.ts` with `h()`, not `.tsx`: JSX requires a `.tsx` extension.
- `src/ui/features/find-replace/index.test.ts`
- `docs/verification/phase-2-parity.md`

**Modified:**

- `src/shared/types.ts` — `SearchMatch`, `MatchOptions`, `ChangeSet.scope`
- `src/shared/messages.ts` + `.test.ts` — four new variants
- `src/main/plan.ts` + `.test.ts` — `buildChangeSet` takes `ChangeTarget[]`
- `src/main/index.ts` — three new handlers; the `plan-import` call site follows Task 2's signature
- `src/main/apply.test.ts` — only if Task 2's signature change reaches it
- `src/ui.html` — tab bar, `#extract-panel`, `#find-replace-panel`, the form, `review-*` jump button styling
- `src/ui/index.ts` — `initTabs`, `initFindReplace`, routing for `search-results`
- `src/ui/features/review/index.ts` + `screen.tsx` + both test files — remount key, jump action, invalidation
- `README.md`, `CHANGELOG.md`

---

## Task 1: Matching and replacement

**Files:**
- Create: `src/main/search.ts`, `src/main/search.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Consumes: `TextLayerData` from `src/shared/types.ts` (exists: `{ id, name, characters }`).
- Produces: `MatchOptions`, `SearchMatch` in `src/shared/types.ts`; `countMatches`, `replaceAll`, `matchingLayers` from `src/main/search.ts`. Tasks 3, 4 and 6 depend on these exact names.

- [ ] **Step 1: Add the two types**

In `src/shared/types.ts`, after the `Scope` type:

```ts
/** How a query is compared against a layer's text. See spec section 3.4. */
export interface MatchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

/** One layer the query occurs in. See spec section 3.4. */
export interface SearchMatch {
  nodeId: string;
  layerName: string;
  characters: string;   // the layer's current text
  matchCount: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/main/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countMatches, replaceAll, matchingLayers } from './search';
import type { MatchOptions } from '../shared/types';

const opts = (over: Partial<MatchOptions> = {}): MatchOptions => ({
  caseSensitive: false,
  wholeWord: false,
  ...over,
});

describe('countMatches', () => {
  it('counts every occurrence, not just the first', () => {
    expect(countMatches('Sign up to sign up', 'sign up', opts())).toBe(2);
  });

  it('ignores case when caseSensitive is off', () => {
    expect(countMatches('SIGN UP', 'sign up', opts())).toBe(1);
  });

  it('respects case when caseSensitive is on', () => {
    expect(countMatches('SIGN UP', 'sign up', opts({ caseSensitive: true }))).toBe(0);
    expect(countMatches('sign up', 'sign up', opts({ caseSensitive: true }))).toBe(1);
  });

  it('counts adjacent occurrences without overlapping them', () => {
    // 'aa' fits twice in 'aaaa' without reusing a character; a naive scan that
    // advanced by one would report three.
    expect(countMatches('aaaa', 'aa', opts())).toBe(2);
  });

  it('matches at the very start and the very end of the text', () => {
    expect(countMatches('go now', 'go', opts())).toBe(1);
    expect(countMatches('now go', 'go', opts())).toBe(1);
  });

  it('treats regular-expression metacharacters literally', () => {
    expect(countMatches('abc', 'a.c', opts())).toBe(0);
    expect(countMatches('a.c', 'a.c', opts())).toBe(1);
    expect(countMatches('price (net)', '(net)', opts())).toBe(1);
  });

  it('returns zero for an empty query rather than matching everywhere', () => {
    expect(countMatches('anything', '', opts())).toBe(0);
  });

  it('requires both sides to be non-word when wholeWord is on', () => {
    const w = opts({ wholeWord: true });
    expect(countMatches('Pro plan', 'Pro', w)).toBe(1);
    expect(countMatches('Product', 'Pro', w)).toBe(0);
    expect(countMatches('a Pro', 'Pro', w)).toBe(1);
    expect(countMatches('Pro.', 'Pro', w)).toBe(1);
    expect(countMatches('_Pro', 'Pro', w)).toBe(0);
    expect(countMatches('4Pro', 'Pro', w)).toBe(0);
  });

  it('treats letters outside Latin as word characters', () => {
    // Hangul has no spaces between words, so whole word cannot find a term
    // inside a compound. Spec 3.4 states this is the option's meaning, not a bug.
    expect(countMatches('회원가입', '회원', opts({ wholeWord: true }))).toBe(0);
    expect(countMatches('회원가입', '회원', opts())).toBe(1);
  });
});

describe('replaceAll', () => {
  it('replaces every occurrence', () => {
    expect(replaceAll('Sign up to sign up', 'sign up', 'Get started', opts())).toBe(
      'Get started to Get started'
    );
  });

  it('preserves the text around each occurrence exactly', () => {
    expect(replaceAll('  padded  ', 'padded', 'trimmed', opts())).toBe('  trimmed  ');
  });

  it('returns the text unchanged when nothing matches', () => {
    expect(replaceAll('Sign up', 'log in', 'Get started', opts())).toBe('Sign up');
  });

  it('returns identical text when the replacement reproduces the match', () => {
    expect(replaceAll('Sign up', 'Sign up', 'Sign up', opts())).toBe('Sign up');
  });

  it('does not rescan its own output', () => {
    // Replacing 'a' with 'aa' must terminate and double each character once.
    expect(replaceAll('aaa', 'a', 'aa', opts())).toBe('aaaaaa');
  });

  it('honours wholeWord', () => {
    expect(replaceAll('Pro and Product', 'Pro', 'Plus', opts({ wholeWord: true }))).toBe(
      'Plus and Product'
    );
  });

  it('replaces with an empty string when the replacement is empty', () => {
    expect(replaceAll('a-b-c', '-', '', opts())).toBe('abc');
  });

  it('returns the text unchanged for an empty query', () => {
    expect(replaceAll('anything', '', 'x', opts())).toBe('anything');
  });
});

describe('matchingLayers', () => {
  const rows = [
    { id: '1:1', name: 'Hero / CTA', characters: 'Sign up free' },
    { id: '1:2', name: 'Nav / Right', characters: 'Log in' },
    { id: '1:3', name: 'Pricing / Card', characters: 'Sign up or sign up' },
  ];

  it('keeps only the layers the query occurs in', () => {
    const found = matchingLayers(rows, 'sign up', opts());
    expect(found.map((m) => m.nodeId)).toEqual(['1:1', '1:3']);
  });

  it('carries the layer name, its current text, and the count', () => {
    const [first] = matchingLayers(rows, 'sign up', opts());
    expect(first).toEqual({
      nodeId: '1:1',
      layerName: 'Hero / CTA',
      characters: 'Sign up free',
      matchCount: 1,
    });
  });

  it('reports a per-layer count, not a total', () => {
    const found = matchingLayers(rows, 'sign up', opts());
    expect(found.map((m) => m.matchCount)).toEqual([1, 2]);
  });

  it('returns nothing for an empty query', () => {
    expect(matchingLayers(rows, '', opts())).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/main/search.test.ts`
Expected: FAIL — `Failed to resolve import "./search"`.

- [ ] **Step 4: Write the implementation**

Create `src/main/search.ts`:

```ts
import type { MatchOptions, SearchMatch, TextLayerData } from '../shared/types';

/**
 * Matching scans with `indexOf` rather than compiling a regular expression
 * from the query. Spec 3.4 excludes regular expressions partly because of
 * catastrophic backtracking; building one internally would put that back on
 * the path of every search for no gain.
 */

/**
 * A word character by Unicode category, so the rule means something in scripts
 * other than Latin. Note the consequence spec 3.4 records: languages that do
 * not delimit words with spaces cannot usefully use `wholeWord`.
 */
const WORD = /[\p{L}\p{N}_]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD.test(char);
}

/** Is the occurrence at `at` flanked by non-word characters (or nothing)? */
function isWholeWordAt(text: string, at: string, index: number): boolean {
  return (
    !isWordChar(text[index - 1]) && !isWordChar(text[index + at.length])
  );
}

/**
 * Every index where `query` occurs, left to right and non-overlapping. The
 * boundary check runs against the original text so that case folding cannot
 * shift positions.
 */
function occurrences(text: string, query: string, opts: MatchOptions): number[] {
  if (query === '') return [];

  const haystack = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const found: number[] = [];

  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (!opts.wholeWord || isWholeWordAt(text, needle, at)) {
      found.push(at);
    }
    // Advance past this occurrence so 'aa' counts twice in 'aaaa', not three
    // times. When the match is rejected by the boundary check, advancing by one
    // is right -- the next occurrence may start inside this one.
    from = opts.wholeWord && !isWholeWordAt(text, needle, at) ? at + 1 : at + needle.length;
  }
  return found;
}

export function countMatches(text: string, query: string, opts: MatchOptions): number {
  return occurrences(text, query, opts).length;
}

export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  opts: MatchOptions
): string {
  const at = occurrences(text, query, opts);
  if (at.length === 0) return text;

  // Built left to right from the original text, so the replacement is never
  // rescanned -- replacing 'a' with 'aa' terminates.
  let out = '';
  let cursor = 0;
  for (const index of at) {
    out += text.slice(cursor, index) + replacement;
    cursor = index + query.length;
  }
  return out + text.slice(cursor);
}

export function matchingLayers(
  rows: ReadonlyArray<TextLayerData>,
  query: string,
  opts: MatchOptions
): SearchMatch[] {
  const found: SearchMatch[] = [];
  for (const row of rows) {
    const matchCount = countMatches(row.characters, query, opts);
    if (matchCount === 0) continue;
    found.push({
      nodeId: row.id,
      layerName: row.name,
      characters: row.characters,
      matchCount,
    });
  }
  return found;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/main/search.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Prove the boundary check bites**

Change `isWholeWordAt` to `return true;`. Run the same file.
Expected: the `wholeWord` and Hangul tests fail. Restore the function and confirm green again. Record both outputs in your report.

- [ ] **Step 7: Full gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/main/search.ts src/main/search.test.ts src/shared/types.ts
git commit -m "feat: match and replace text without a regular expression"
```

---

## Task 2: One change-set builder for every producer

**Files:**
- Modify: `src/main/plan.ts`, `src/main/plan.test.ts`, `src/main/index.ts`

**Interfaces:**
- Consumes: `ApplicableNode` from `src/main/apply.ts` (unchanged by this task).
- Produces: `ChangeTarget` and the new `buildChangeSet(targets, source, deps, now?)` signature from `src/main/plan.ts`. Task 4 calls it for both producers.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/main/plan.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { buildChangeSet, type ChangeTarget } from './plan';
import type { ApplicableNode } from './apply';

const node = (id: string, name: string, characters = '', type = 'TEXT'): ApplicableNode =>
  ({ id, name, characters, type }) as ApplicableNode;

const deps = (nodes: ApplicableNode[]) => ({
  getNode: async (id: string) => nodes.find((n) => n.id === id) ?? null,
});

/** The import producer: the file's text wins, whatever the node holds. */
const fromFile = (id: string, name: string, characters: string): ChangeTarget => ({
  id,
  fallbackName: name,
  after: () => characters,
});

describe('buildChangeSet', () => {
  it('proposes a change when the text differs', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Title', 'new')],
      'import',
      deps([node('1:1', 'Title', 'old')]),
      42
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
    expect(set.createdAt).toBe(42);
  });

  it('counts a row whose text already matches instead of listing it', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Title', 'same')],
      'import',
      deps([node('1:1', 'Title', 'same')])
    );
    expect(set.changes).toEqual([]);
    expect(set.unchangedCount).toBe(1);
  });

  it('blocks a target the document no longer has, naming it from fallbackName', async () => {
    const set = await buildChangeSet(
      [fromFile('9:9', 'Gone from the file', 'new')],
      'import',
      deps([])
    );
    expect(set.blocked).toEqual([
      { nodeId: '9:9', layerName: 'Gone from the file', reason: 'missing' },
    ]);
    expect(set.changes).toEqual([]);
  });

  it('blocks a node that is no longer text, naming it from the document', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Name in the file', 'new')],
      'import',
      deps([node('1:1', 'Name in the document', '', 'RECTANGLE')])
    );
    expect(set.blocked).toEqual([
      { nodeId: '1:1', layerName: 'Name in the document', reason: 'not-text' },
    ]);
  });

  it('prefers the document name over fallbackName when the node exists', async () => {
    const set = await buildChangeSet(
      [fromFile('1:1', 'Stale name', 'new')],
      'import',
      deps([node('1:1', 'Current name', 'old')])
    );
    expect(set.changes[0].layerName).toBe('Current name');
  });

  it('passes the node current text to after, so a producer can derive from it', async () => {
    const seen: string[] = [];
    const target: ChangeTarget = {
      id: '1:1',
      fallbackName: 'unused',
      after: (current) => {
        seen.push(current);
        return current.toUpperCase();
      },
    };
    const set = await buildChangeSet([target], 'find-replace', deps([node('1:1', 'T', 'quiet')]));
    expect(seen).toEqual(['quiet']);
    expect(set.changes[0].after).toBe('QUIET');
  });

  it('stamps the source it was given', async () => {
    const set = await buildChangeSet(
      [{ id: '1:1', fallbackName: 'f', after: () => 'new' }],
      'find-replace',
      deps([node('1:1', 'T', 'old')])
    );
    expect(set.changes[0].source).toBe('find-replace');
  });

  it('records the scope when one is given, and omits it otherwise', async () => {
    const targets = [fromFile('1:1', 'T', 'new')];
    const withScope = await buildChangeSet(targets, 'find-replace', deps([node('1:1', 'T', 'old')]), 1, 'page');
    expect(withScope.scope).toBe('page');

    const without = await buildChangeSet(targets, 'import', deps([node('1:1', 'T', 'old')]), 1);
    expect(without.scope).toBeUndefined();
  });

  it('keeps going after a blocked target', async () => {
    const set = await buildChangeSet(
      [fromFile('9:9', 'Gone', 'x'), fromFile('1:1', 'Here', 'new')],
      'import',
      deps([node('1:1', 'Here', 'old')])
    );
    expect(set.blocked).toHaveLength(1);
    expect(set.changes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/plan.test.ts`
Expected: FAIL — `plan.ts` exports no `ChangeTarget`, and `buildChangeSet` does not take these arguments.

- [ ] **Step 3: Rewrite `plan.ts`**

Replace `src/main/plan.ts` with:

```ts
import type {
  ChangeSet,
  ProposedChange,
  BlockedChange,
  Scope,
} from '../shared/types';
import type { ApplicableNode } from './apply';

export interface PlanDeps {
  getNode(id: string): Promise<ApplicableNode | null>;
}

/**
 * One node a producer wants to write to, and what it wants written.
 *
 * `after` receives the node's current text so a producer can derive from it --
 * find & replace does; import ignores it and returns the file's text. That is
 * the whole difference between the producers, which is why there is one
 * builder rather than one per producer. See spec section 3.
 */
export interface ChangeTarget {
  id: string;
  /** Used only when the node is gone; a missing node cannot be asked its name. */
  fallbackName: string;
  after(current: string): string;
}

/**
 * Classify every target against what the document currently holds: the node is
 * gone, it is not text, its text already matches, or it differs.
 *
 * This runs in the sandbox because the UI cannot read the document and so
 * cannot know the "before" text. `now` is injectable so `createdAt` is
 * deterministic under test. `scope` is set only by producers that walked the
 * document -- import's targets come from a file, so it has none (spec 3.1).
 */
export async function buildChangeSet(
  targets: ReadonlyArray<ChangeTarget>,
  source: ProposedChange['source'],
  deps: PlanDeps,
  now: number = Date.now(),
  scope?: Scope
): Promise<ChangeSet> {
  const changes: ProposedChange[] = [];
  const blocked: BlockedChange[] = [];
  let unchangedCount = 0;

  for (const target of targets) {
    const node = await deps.getNode(target.id);

    if (!node) {
      blocked.push({ nodeId: target.id, layerName: target.fallbackName, reason: 'missing' });
      continue;
    }
    if (node.type !== 'TEXT') {
      blocked.push({ nodeId: target.id, layerName: node.name, reason: 'not-text' });
      continue;
    }

    const after = target.after(node.characters);
    if (node.characters === after) {
      unchangedCount++;
      continue;
    }

    changes.push({
      nodeId: target.id,
      // The document is the authority on what a layer is called; a file, or a
      // search result a moment stale, can carry a name since edited.
      layerName: node.name,
      before: node.characters,
      after,
      source,
      // Checked by default: review is for vetoing, not for re-approving every
      // row the user just asked for.
      accepted: true,
    });
  }

  return scope === undefined
    ? { changes, blocked, unchangedCount, createdAt: now }
    : { changes, blocked, unchangedCount, createdAt: now, scope };
}
```

- [ ] **Step 4: Update the one existing call site**

In `src/main/index.ts`, the `plan-import` case currently passes `message.rows`. Change it to build targets:

```ts
      case 'plan-import': {
        try {
          const changeSet = await buildChangeSet(
            message.rows.map((row) => ({
              id: row.id,
              fallbackName: row.name,
              after: () => row.characters,
            })),
            'import',
            {
              getNode: async (id) =>
                (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
            }
          );
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/main/plan.test.ts`
Expected: PASS, 9 tests.

Then run the whole suite: `npm test`. `src/main/apply.test.ts` does not import `buildChangeSet`, so it should be untouched — if it fails, report that rather than editing it without saying so.

- [ ] **Step 6: Prove the unchanged branch still bites**

Change `if (node.characters === after)` to `if (false)`. Run `npx vitest run src/main/plan.test.ts`.
Expected: the "counts a row whose text already matches" test fails. Restore and confirm green. Record both outputs.

- [ ] **Step 7: Full gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/main/plan.ts src/main/plan.test.ts src/main/index.ts
git commit -m "refactor: let every producer share one change-set builder"
```

---

## Task 3: The message contract

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/messages.ts`, `src/shared/messages.test.ts`

**Interfaces:**
- Consumes: `MatchOptions`, `SearchMatch` from Task 1; `Scope`, `ChangeSet` (existing).
- Produces: `search`, `plan-replace`, `navigate` on `UiToMain`; `search-results` on `MainToUi`; `ChangeSet.scope`. Tasks 4, 6 and 7 send and receive these.

- [ ] **Step 1: Add `scope` to `ChangeSet`**

In `src/shared/types.ts`, in the `ChangeSet` interface, after `unchangedCount`:

```ts
  /**
   * Set when a traversal produced this set, so the UI can tell whether a
   * selection change invalidates it. Absent for 'import', whose targets come
   * from a file. See spec section 3.1.
   */
  scope?: Scope;
```

- [ ] **Step 2: Write the failing tests**

Append to `src/shared/messages.test.ts`, inside the existing top-level `describe` for `unwrapUiMessage` where the other UI-to-main cases live (match the file's existing structure; if the cases are flat, keep them flat):

```ts
  it('accepts a search message', () => {
    expect(
      unwrapUiMessage({
        type: 'search',
        query: 'Sign up',
        scope: 'page',
        caseSensitive: false,
        wholeWord: true,
      })
    ).toEqual({
      type: 'search',
      query: 'Sign up',
      scope: 'page',
      caseSensitive: false,
      wholeWord: true,
    });
  });

  it('rejects a search message whose query is not a string', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 5, scope: 'page', caseSensitive: false, wholeWord: false })
    ).toBeNull();
  });

  it('rejects a search message whose scope is not a known scope', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'document', caseSensitive: false, wholeWord: false })
    ).toBeNull();
  });

  it('rejects a search message whose caseSensitive is not a boolean', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'page', caseSensitive: 'yes', wholeWord: false })
    ).toBeNull();
  });

  it('rejects a search message whose wholeWord is not a boolean', () => {
    expect(
      unwrapUiMessage({ type: 'search', query: 'x', scope: 'page', caseSensitive: false, wholeWord: 1 })
    ).toBeNull();
  });

  it('accepts a plan-replace message', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'Sign up',
        replacement: 'Get started',
        targets: [{ nodeId: '1:1', layerName: 'Hero' }],
        scope: 'selection',
        caseSensitive: true,
        wholeWord: false,
      })
    ).toEqual({
      type: 'plan-replace',
      query: 'Sign up',
      replacement: 'Get started',
      targets: [{ nodeId: '1:1', layerName: 'Hero' }],
      scope: 'selection',
      caseSensitive: true,
      wholeWord: false,
    });
  });

  it('rejects a plan-replace message whose replacement is missing', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'x',
        targets: [],
        scope: 'page',
        caseSensitive: false,
        wholeWord: false,
      })
    ).toBeNull();
  });

  it('rejects a plan-replace target without a nodeId', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'x',
        replacement: 'y',
        targets: [{ layerName: 'Hero' }],
        scope: 'page',
        caseSensitive: false,
        wholeWord: false,
      })
    ).toBeNull();
  });

  it('rejects a plan-replace target without a layerName', () => {
    expect(
      unwrapUiMessage({
        type: 'plan-replace',
        query: 'x',
        replacement: 'y',
        targets: [{ nodeId: '1:1' }],
        scope: 'page',
        caseSensitive: false,
        wholeWord: false,
      })
    ).toBeNull();
  });

  it('accepts a navigate message', () => {
    expect(unwrapUiMessage({ type: 'navigate', nodeId: '1:1' })).toEqual({
      type: 'navigate',
      nodeId: '1:1',
    });
  });

  it('rejects a navigate message whose nodeId is not a string', () => {
    expect(unwrapUiMessage({ type: 'navigate', nodeId: null })).toBeNull();
  });
```

And for the main-to-UI direction, alongside the existing `unwrapMainMessage` cases:

```ts
  it('accepts search results', () => {
    const matches = [
      { nodeId: '1:1', layerName: 'Hero', characters: 'Sign up free', matchCount: 1 },
    ];
    expect(unwrapMainMessage({ type: 'search-results', matches, scope: 'page' })).toEqual({
      type: 'search-results',
      matches,
      scope: 'page',
    });
  });

  it('rejects search results whose matchCount is not a number', () => {
    expect(
      unwrapMainMessage({
        type: 'search-results',
        matches: [{ nodeId: '1:1', layerName: 'Hero', characters: 'x', matchCount: 'one' }],
        scope: 'page',
      })
    ).toBeNull();
  });

  it('rejects search results whose characters field is missing', () => {
    expect(
      unwrapMainMessage({
        type: 'search-results',
        matches: [{ nodeId: '1:1', layerName: 'Hero', matchCount: 1 }],
        scope: 'page',
      })
    ).toBeNull();
  });

  it('rejects search results whose scope is unknown', () => {
    expect(unwrapMainMessage({ type: 'search-results', matches: [], scope: 'all' })).toBeNull();
  });

  it('accepts a change set carrying a scope', () => {
    const changeSet = { changes: [], blocked: [], unchangedCount: 0, createdAt: 1, scope: 'page' };
    expect(unwrapMainMessage({ type: 'change-set', changeSet })).toEqual({
      type: 'change-set',
      changeSet,
    });
  });

  it('rejects a change set whose scope is unknown', () => {
    expect(
      unwrapMainMessage({
        type: 'change-set',
        changeSet: { changes: [], blocked: [], unchangedCount: 0, createdAt: 1, scope: 'all' },
      })
    ).toBeNull();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — the new variants are unrecognised, so `unwrapUiMessage` returns `null` where a message is expected.

- [ ] **Step 4: Extend the contract**

In `src/shared/messages.ts`:

Import the new types alongside the existing ones:

```ts
import type {
  TextLayerData,
  Scope,
  ProposedChange,
  BlockedChange,
  ChangeSet,
  SearchMatch,
} from './types';
```

Add to `UiToMain`:

```ts
  | { type: 'search'; query: string; scope: Scope; caseSensitive: boolean; wholeWord: boolean }
  | {
      type: 'plan-replace';
      query: string;
      replacement: string;
      // Name included so a node deleted between searching and replacing can
      // still be named in the blocked row.
      targets: ReplaceTarget[];
      scope: Scope;
      caseSensitive: boolean;
      wholeWord: boolean;
    }
  | { type: 'navigate'; nodeId: string }
```

Add to `MainToUi`:

```ts
  | { type: 'search-results'; matches: SearchMatch[]; scope: Scope }
```

Add the target type to `src/shared/types.ts`, not to `messages.ts` — it is a data
shape the UI builds and the sandbox consumes, which is where `ProposedChange` and
`BlockedChange` already live:

```ts
/** One node the user chose to replace in. See spec section 3.4. */
export interface ReplaceTarget {
  nodeId: string;
  /**
   * Carried so a node deleted between searching and replacing can still be
   * named in the blocked row; a missing node cannot be asked its name.
   */
  layerName: string;
}
```

Import it into `messages.ts` alongside the other types.

Add the validators:

```ts
function isScope(value: unknown): value is Scope {
  return value === 'selection' || value === 'page';
}

function isReplaceTargets(value: unknown): value is ReplaceTarget[] {
  return (
    Array.isArray(value) &&
    value.every((t) => {
      if (typeof t !== 'object' || t === null) return false;
      const v = t as Record<string, unknown>;
      return typeof v.nodeId === 'string' && typeof v.layerName === 'string';
    })
  );
}

function isSearchMatches(value: unknown): value is SearchMatch[] {
  return (
    Array.isArray(value) &&
    value.every((m) => {
      if (typeof m !== 'object' || m === null) return false;
      const v = m as Record<string, unknown>;
      return (
        typeof v.nodeId === 'string' &&
        typeof v.layerName === 'string' &&
        typeof v.characters === 'string' &&
        typeof v.matchCount === 'number'
      );
    })
  );
}
```

Use `isScope` in `isChangeSet` for the new optional field, and in the existing `extract` case:

```ts
function isChangeSet(value: unknown): value is ChangeSet {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isProposedChanges(v.changes) &&
    isBlockedChanges(v.blocked) &&
    typeof v.unchangedCount === 'number' &&
    typeof v.createdAt === 'number' &&
    (v.scope === undefined || isScope(v.scope))
  );
}
```

Add the cases to `unwrapUiMessage`:

```ts
    case 'search':
      return typeof p.query === 'string' &&
        isScope(p.scope) &&
        typeof p.caseSensitive === 'boolean' &&
        typeof p.wholeWord === 'boolean'
        ? {
            type: 'search',
            query: p.query,
            scope: p.scope,
            caseSensitive: p.caseSensitive,
            wholeWord: p.wholeWord,
          }
        : null;
    case 'plan-replace':
      return typeof p.query === 'string' &&
        typeof p.replacement === 'string' &&
        isReplaceTargets(p.targets) &&
        isScope(p.scope) &&
        typeof p.caseSensitive === 'boolean' &&
        typeof p.wholeWord === 'boolean'
        ? {
            type: 'plan-replace',
            query: p.query,
            replacement: p.replacement,
            targets: p.targets,
            scope: p.scope,
            caseSensitive: p.caseSensitive,
            wholeWord: p.wholeWord,
          }
        : null;
    case 'navigate':
      return typeof p.nodeId === 'string' ? { type: 'navigate', nodeId: p.nodeId } : null;
```

And to `unwrapMainMessage`:

```ts
    case 'search-results':
      return isSearchMatches(p.matches) && isScope(p.scope)
        ? { type: 'search-results', matches: p.matches, scope: p.scope }
        : null;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS, with the 17 new tests added.

- [ ] **Step 6: Prove each new check bites**

Every reject fixture above violates exactly one check. Confirm that by weakening checks one at a time and watching a single test fail each time. Do at least these four, restoring after each:

1. Drop `typeof p.caseSensitive === 'boolean'` from the `search` case → "rejects a search message whose caseSensitive is not a boolean" fails, and nothing else.
2. Drop `typeof v.layerName === 'string'` from `isReplaceTargets` → "rejects a plan-replace target without a layerName" fails.
3. Drop `typeof v.characters === 'string'` from `isSearchMatches` → "rejects search results whose characters field is missing" fails.
4. Drop `(v.scope === undefined || isScope(v.scope))` from `isChangeSet` → "rejects a change set whose scope is unknown" fails, and the accept case still passes.

Record each command and its output in your report.

- [ ] **Step 7: Confirm the build stays green**

Adding union members does not break the router in `src/main/index.ts`: its `switch` is a statement with no exhaustiveness constraint, so unhandled variants compile. Verify rather than assume:

Run: `npm run typecheck && npm run build`
Expected: both clean. If either fails, report exactly which file and why before changing anything.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: add search, replace, and navigate to the contract"
```

---

## Task 4: The sandbox handlers

**Files:**
- Create: `src/main/navigate.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `matchingLayers`, `replaceAll` from Task 1; `buildChangeSet`, `ChangeTarget` from Task 2; the `search`, `plan-replace`, `navigate` variants from Task 3.
- Produces: `centreOnNode` from `src/main/navigate.ts`. Nothing later consumes it.

- [ ] **Step 1: Write `navigate.ts`**

Create `src/main/navigate.ts`:

```ts
/**
 * Centre a node in the viewport.
 *
 * It does NOT set `figma.currentPage.selection`, which is what a jump-to-layer
 * action usually does. Selecting fires `selectionchange`, and spec 3.1 requires
 * that to invalidate a selection-scoped change set -- so selecting here would
 * close the review the user pressed the button from. Zooming answers "where is
 * this" without touching the rule. See spec section 3.5.
 *
 * A thin Figma wrapper by design; spec section 6 excludes these from unit tests.
 */
export async function centreOnNode(nodeId: string): Promise<boolean> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('absoluteBoundingBox' in node)) return false;
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  return true;
}
```

- [ ] **Step 2: Add the three handlers**

In `src/main/index.ts`, add the imports:

```ts
import { matchingLayers, replaceAll } from './search';
import { centreOnNode } from './navigate';
import { buildChangeSet, type ChangeTarget } from './plan';
```

(`buildChangeSet` is already imported — extend that line rather than adding a second import of the same module.)

Add these cases to the `switch` in `figma.ui.onmessage`, following the shape of the existing cases including the `try`/`catch` that wraps each one in a contextual error:

```ts
      case 'search': {
        try {
          const rows = collectTextLayers(rootsFor(message.scope));
          const matches = matchingLayers(rows, message.query, {
            caseSensitive: message.caseSensitive,
            wholeWord: message.wholeWord,
          });
          send({ type: 'search-results', matches, scope: message.scope });
        } catch (error) {
          throw new Error(
            `Error occurred during search: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'plan-replace': {
        try {
          const opts = {
            caseSensitive: message.caseSensitive,
            wholeWord: message.wholeWord,
          };
          // Each node is re-read and the replacement recomputed here, so the
          // set's `before` is the document's text now, not at search time.
          const targets: ChangeTarget[] = message.targets.map((target) => ({
            id: target.nodeId,
            fallbackName: target.layerName,
            after: (current) => replaceAll(current, message.query, message.replacement, opts),
          }));
          const changeSet = await buildChangeSet(
            targets,
            'find-replace',
            {
              getNode: async (id) =>
                (await figma.getNodeByIdAsync(id)) as ApplicableNode | null,
            },
            Date.now(),
            message.scope
          );
          send({ type: 'change-set', changeSet });
        } catch (error) {
          throw new Error(
            `Error occurred while planning the replacement: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
      case 'navigate': {
        try {
          const found = await centreOnNode(message.nodeId);
          if (!found) {
            send({ type: 'error', message: 'That layer no longer exists.' });
          }
        } catch (error) {
          throw new Error(
            `Error occurred while navigating: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, unchanged count from Task 3. No new tests: `navigate.ts` is excluded by spec 6, and every piece of logic these handlers use was tested as a pure function in Tasks 1 and 2. If you find yourself wanting a test here, that means logic leaked into the handler — report it rather than testing around it.

- [ ] **Step 4: Confirm the boundary constraints**

```bash
grep -rn "fetch" src/main/ ; grep -rn "getNodeById\b" src/
```
Expected: no output from either. The second guards against the synchronous lookup form.

- [ ] **Step 5: Full gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/main/navigate.ts src/main/index.ts
git commit -m "feat: search, plan a replacement, and centre a layer"
```

---

## Task 5: The tab bar

**Files:**
- Create: `src/ui/features/tabs.ts`, `src/ui/features/tabs.test.ts`
- Modify: `src/ui.html`, `src/ui/index.ts`

**Interfaces:**
- Consumes: `byId` from `src/ui/dom.ts` (exists).
- Produces: `initTabs(root: Document)` and `showTab(name: TabName)` from `src/ui/features/tabs.ts`; `TabName = 'extract' | 'find-replace'`. Task 6 does not call these; Task 7 does not either. They are wired once in `src/ui/index.ts`.

- [ ] **Step 1: Restructure the markup**

In `src/ui.html`, inside `#main-content`, wrap the three existing sections (the extract section, `#export-section`, and the import section) in a new panel div, and add an empty sibling panel. Do not change the sections themselves.

```html
      <div id="main-content">
        <div class="tab-bar">
          <button class="tab selected" data-tab="extract" type="button">Extract</button>
          <button class="tab" data-tab="find-replace" type="button">Find &amp; Replace</button>
        </div>

        <div id="extract-panel" class="tab-panel">
          <!-- the three existing sections, moved unchanged -->
        </div>

        <div id="find-replace-panel" class="tab-panel hidden">
          <!-- Task 6 fills this -->
        </div>
      </div>
```

- [ ] **Step 2: Style the tab bar**

Add to the stylesheet in `src/ui.html`. Read the surrounding rules first and reuse the existing colour values, spacing scale and font sizes rather than introducing new ones. Do not reuse a class name that JavaScript queries — `.format-option` and `.scope-option` are each queried by a module, which is why the review styles kept their own names.

```css
      .tab-bar {
        display: flex;
        gap: 4px;
        margin-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
      }
      .tab {
        flex: 1;
        padding: 8px 4px;
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        font: inherit;
        font-size: 12px;
        color: #64748b;
        cursor: pointer;
      }
      .tab.selected {
        color: #1e293b;
        font-weight: 600;
        border-bottom-color: #1e293b;
      }
```

- [ ] **Step 3: Write the failing tests**

Create `src/ui/features/tabs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { initTabs, showTab } from './tabs';

function markup(): void {
  document.body.innerHTML = `
    <div id="main-content">
      <div class="tab-bar">
        <button class="tab selected" data-tab="extract" type="button">Extract</button>
        <button class="tab" data-tab="find-replace" type="button">Find &amp; Replace</button>
      </div>
      <div id="extract-panel" class="tab-panel"></div>
      <div id="find-replace-panel" class="tab-panel hidden"></div>
    </div>
  `;
}

const panel = (name: string) => document.getElementById(`${name}-panel`)!;
const tab = (name: string) =>
  document.querySelector<HTMLElement>(`.tab[data-tab="${name}"]`)!;

describe('tabs', () => {
  beforeEach(() => {
    markup();
    initTabs(document);
  });

  it('shows Extract and hides Find & Replace on init', () => {
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(panel('find-replace').classList.contains('hidden')).toBe(true);
    expect(tab('extract').classList.contains('selected')).toBe(true);
  });

  it('swaps which panel is visible when a tab is clicked', () => {
    tab('find-replace').click();
    expect(panel('extract').classList.contains('hidden')).toBe(true);
    expect(panel('find-replace').classList.contains('hidden')).toBe(false);
  });

  it('moves the selected class to the clicked tab', () => {
    tab('find-replace').click();
    expect(tab('find-replace').classList.contains('selected')).toBe(true);
    expect(tab('extract').classList.contains('selected')).toBe(false);
  });

  it('is idempotent: clicking the open tab leaves it open', () => {
    tab('extract').click();
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(tab('extract').classList.contains('selected')).toBe(true);
  });

  it('switches on demand without a click', () => {
    showTab('find-replace');
    expect(panel('find-replace').classList.contains('hidden')).toBe(false);
  });

  it('re-initialising resets to Extract rather than trusting leftover markup', () => {
    showTab('find-replace');
    initTabs(document);
    expect(panel('extract').classList.contains('hidden')).toBe(false);
    expect(panel('find-replace').classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/ui/features/tabs.test.ts`
Expected: FAIL — `Failed to resolve import "./tabs"`.

- [ ] **Step 5: Write the implementation**

Create `src/ui/features/tabs.ts`:

```ts
/**
 * Which panel of the main screen is showing.
 *
 * A class toggle rather than a Preact shell: the extract and import sections
 * are imperative modules that query this markup, and wrapping them in a
 * component tree buys nothing the user can see. Preact is here for the review
 * table and the results list. See spec section 3.3.
 */
export type TabName = 'extract' | 'find-replace';

const TABS: readonly TabName[] = ['extract', 'find-replace'];

let host: Document | null = null;

export function showTab(name: TabName): void {
  if (!host) return;
  for (const tab of TABS) {
    host.getElementById(`${tab}-panel`)?.classList.toggle('hidden', tab !== name);
    host
      .querySelector<HTMLElement>(`.tab[data-tab="${tab}"]`)
      ?.classList.toggle('selected', tab === name);
  }
}

export function initTabs(root: Document): void {
  host = root;
  // Extract is the tab every session opens on. Reasserting it here rather than
  // trusting whatever class the markup carries keeps module and DOM in step --
  // the same reason `initScope` reasserts its default.
  showTab('extract');
  root.querySelectorAll<HTMLElement>('.tab').forEach((element) => {
    element.addEventListener('click', () => {
      const name = element.dataset.tab;
      if (name === 'extract' || name === 'find-replace') showTab(name);
    });
  });
}
```

- [ ] **Step 6: Wire it up**

In `src/ui/index.ts`, import `initTabs` and call it alongside the existing `initScope` call.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/ui/features/tabs.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Full gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/ui/features/tabs.ts src/ui/features/tabs.test.ts src/ui.html src/ui/index.ts
git commit -m "feat: put extract and find & replace on their own tabs"
```

---

## Task 6: The find & replace form and result list

**Files:**
- Create: `src/ui/features/find-replace/results.tsx`, `src/ui/features/find-replace/results.test.tsx`, `src/ui/features/find-replace/index.ts`, `src/ui/features/find-replace/index.test.ts`
- Modify: `src/ui.html`, `src/ui/index.ts`

**Interfaces:**
- Consumes: `SearchMatch`, `MatchOptions` from Task 1; `ReplaceTarget` and the `search` / `plan-replace` / `navigate` variants from Task 3; `post` from `src/ui/post.ts`; `showStatus` / `clearStatus` from `src/ui/status.tsx`; `byId` from `src/ui/dom.ts`; `getScope` from `src/ui/features/scope.ts`.
- Produces: `initFindReplace(root: Document)` and `showResults(matches: SearchMatch[])` from `src/ui/features/find-replace/index.ts`. Task 7 does not consume these; `src/ui/index.ts` routes `search-results` to `showResults`.

- [ ] **Step 1: Add the form markup**

In `src/ui.html`, fill `#find-replace-panel`. Reuse the existing `.section`, `.button`, and input classes — read the extract and import sections first and follow them. Add the scope control by copying the existing `.scope-selector` block's structure; it is already styled.

```html
        <div id="find-replace-panel" class="tab-panel hidden">
          <div class="section">
            <label class="field-label" for="find-input">Find</label>
            <input id="find-input" type="text" class="text-input" placeholder="Text to find" />

            <label class="field-label" for="replace-input">Replace with</label>
            <input id="replace-input" type="text" class="text-input" placeholder="Leave empty to search only" />

            <label class="checkbox-row">
              <input id="case-sensitive" type="checkbox" /> Case sensitive
            </label>
            <label class="checkbox-row">
              <input id="whole-word" type="checkbox" /> Whole word
            </label>

            <button class="button primary" id="search-btn" type="button" disabled>
              Search
            </button>
          </div>
        </div>
      </div>  <!-- end #main-content -->

      <div id="results-host"></div>
```

**`#results-host` must be a sibling of `#main-content`, not inside it** — placed
beside `#review-host`, which is already there. The result list hides
`#main-content` to take over the panel, so a host nested inside it would be
hidden by the very toggle that reveals it. This is the same trap Phase 1 hit with
the status banner, in the opposite direction. Verify the nesting in the built
`dist/ui.html`, not just in the source.

Add `.field-label`, `.text-input` and `.checkbox-row` rules to the stylesheet only if no equivalent already exists — check first, and group the selectors with the existing rule if one matches.

- [ ] **Step 2: Write the failing component tests**

Create `src/ui/features/find-replace/results.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ResultList } from './results';
import type { SearchMatch } from '../../../shared/types';

const matches: SearchMatch[] = [
  { nodeId: '1:1', layerName: 'Hero / CTA', characters: 'Sign up free', matchCount: 1 },
  { nodeId: '1:2', layerName: 'Pricing / Card', characters: 'Sign up or sign up', matchCount: 2 },
];

let host: HTMLDivElement;

function mount(props: Partial<Parameters<typeof ResultList>[0]> = {}) {
  const onReplace = props.onReplace ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  const onNavigate = props.onNavigate ?? vi.fn();
  act(() => {
    render(
      <ResultList
        matches={props.matches ?? matches}
        canReplace={props.canReplace ?? true}
        onReplace={onReplace}
        onCancel={onCancel}
        onNavigate={onNavigate}
      />,
      host
    );
  });
  return { onReplace, onCancel, onNavigate };
}

const rows = () => host.querySelectorAll('[data-match-row]');
const boxes = () => host.querySelectorAll<HTMLInputElement>('[data-match]');
const button = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

describe('ResultList', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('lists one row per matching layer', () => {
    mount();
    expect(rows()).toHaveLength(2);
  });

  it('shows the layer name, its text, and the match count', () => {
    mount();
    const first = rows()[0].textContent ?? '';
    expect(first).toContain('Hero / CTA');
    expect(first).toContain('Sign up free');
    expect(first).toContain('1');
  });

  it('summarises totals as matches across layers', () => {
    mount();
    expect(host.textContent).toContain('3 matches in 2 layers');
  });

  it('starts with every row selected', () => {
    mount();
    expect(Array.from(boxes()).every((b) => b.checked)).toBe(true);
    expect(button('Replace').textContent).toContain('2');
  });

  it('reports only the selected rows', () => {
    const { onReplace } = mount();
    act(() => boxes()[0].click());
    act(() => button('Replace').click());
    expect(onReplace).toHaveBeenCalledWith([
      { nodeId: '1:2', layerName: 'Pricing / Card' },
    ]);
  });

  it('pluralises the replace button for one row', () => {
    mount({ matches: [matches[0]] });
    expect(button('Replace').textContent).toBe('Replace 1 layer');
  });

  it('disables replace when nothing is selected', () => {
    mount();
    act(() => boxes()[0].click());
    act(() => boxes()[1].click());
    expect(button('Replace').disabled).toBe(true);
  });

  it('hides the replace action entirely when there is no replacement', () => {
    mount({ canReplace: false });
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.includes('Replace'))).toBe(false);
    expect(boxes()).toHaveLength(0);
  });

  it('reports which layer to centre when a row asks', () => {
    const { onNavigate } = mount();
    act(() => host.querySelectorAll<HTMLElement>('[data-navigate]')[1].click());
    expect(onNavigate).toHaveBeenCalledWith('1:2');
  });

  it('reports a cancel without a payload', () => {
    const { onCancel } = mount();
    act(() => button('Close').click());
    expect(onCancel).toHaveBeenCalledWith();
  });

  it('never mutates the matches it was given', () => {
    const given = structuredClone(matches);
    mount({ matches: given });
    act(() => boxes()[0].click());
    expect(given).toEqual(matches);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/ui/features/find-replace/results.test.tsx`
Expected: FAIL — `Failed to resolve import "./results"`.

- [ ] **Step 4: Write the component**

Create `src/ui/features/find-replace/results.tsx`. Follow `src/ui/features/review/screen.tsx` for structure and class naming, and use the `results-*` class prefix. The component is pure: it reports decisions and sends nothing.

Requirements, which the tests above pin:

- Header reads `<total> matches in <layers> layers`, where total is the sum of `matchCount`.
- A row per match carrying `data-match-row`, showing `layerName`, `characters`, and `matchCount`.
- Each row has an element carrying `data-navigate` that calls `onNavigate(nodeId)`.
- When `canReplace` is true, each row has a checkbox carrying `data-match`, all checked initially, and a `Replace <n> layer`/`layers` button that calls `onReplace` with `ReplaceTarget[]` for the selected rows and is disabled at zero.
- When `canReplace` is false, no checkboxes and no replace button — searching without a replacement is a supported use (spec 3.4).
- A `Close` button calling `onCancel()`.
- Selection state lives in the component; never mutate `props.matches`.

Bind the checkbox with `onClick`, not `onChange`: a native click toggles `checked` before the handler runs, which is what `screen.tsx` relies on and what makes `.click()` work in tests.

Its props interface:

```ts
export interface ResultListProps {
  matches: SearchMatch[];
  canReplace: boolean;
  onReplace(targets: ReplaceTarget[]): void;
  onCancel(): void;
  onNavigate(nodeId: string): void;
}
```

- [ ] **Step 5: Run the component tests to verify they pass**

Run: `npx vitest run src/ui/features/find-replace/results.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 6: Write the failing wiring tests**

Create `src/ui/features/find-replace/index.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../post', () => ({ post: vi.fn() }));

import { post } from '../../post';
import { initFindReplace, showResults } from './index';
import type { SearchMatch } from '../../../shared/types';

const matches: SearchMatch[] = [
  { nodeId: '1:1', layerName: 'Hero', characters: 'Sign up', matchCount: 1 },
];

function markup(): void {
  document.body.innerHTML = `
    <div id="main-content">
      <div id="find-replace-panel" class="tab-panel">
        <input id="find-input" type="text" />
        <input id="replace-input" type="text" />
        <input id="case-sensitive" type="checkbox" />
        <input id="whole-word" type="checkbox" />
        <button class="button primary" id="search-btn" type="button" disabled></button>
      </div>
      <div class="scope-selector">
        <div class="scope-option selected" data-scope="selection"></div>
        <div class="scope-option" data-scope="page"></div>
      </div>
    </div>
    <div id="results-host"></div>
    <div id="status-host"></div>
  `;
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const searchBtn = () => document.getElementById('search-btn') as HTMLButtonElement;

describe('find & replace wiring', () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    markup();
    initFindReplace(document);
  });

  it('keeps Search disabled until there is something to find', () => {
    expect(searchBtn().disabled).toBe(true);
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    expect(searchBtn().disabled).toBe(false);
  });

  it('disables Search again when the query is cleared', () => {
    input('find-input').value = 'x';
    input('find-input').dispatchEvent(new Event('input'));
    input('find-input').value = '';
    input('find-input').dispatchEvent(new Event('input'));
    expect(searchBtn().disabled).toBe(true);
  });

  it('treats a whitespace-only query as empty', () => {
    input('find-input').value = '   ';
    input('find-input').dispatchEvent(new Event('input'));
    expect(searchBtn().disabled).toBe(true);
  });

  it('posts the query, the scope, and both options', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    input('case-sensitive').checked = true;
    searchBtn().click();
    expect(post).toHaveBeenCalledWith({
      type: 'search',
      query: 'Sign up',
      scope: 'selection',
      caseSensitive: true,
      wholeWord: false,
    });
  });

  it('says so when a search comes back with nothing', () => {
    showResults([]);
    expect(document.getElementById('results-host')?.innerHTML).toBe('');
    expect(document.getElementById('status-host')?.textContent).toContain('No layers');
  });

  it('covers the main screen while results are showing', () => {
    showResults(matches);
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(true);
  });

  it('uncovers it again on close', () => {
    showResults(matches);
    const close = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close')
    )!;
    close.click();
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('results-host')?.innerHTML).toBe('');
  });

  it('posts a navigate when a row asks to be centred', () => {
    showResults(matches);
    document.querySelector<HTMLElement>('[data-navigate]')!.click();
    expect(post).toHaveBeenCalledWith({ type: 'navigate', nodeId: '1:1' });
  });

  it('posts plan-replace with the query and replacement it was searched with', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    input('replace-input').value = 'Get started';
    searchBtn().click();
    showResults(matches);

    const replace = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Replace')
    )!;
    replace.click();

    expect(post).toHaveBeenCalledWith({
      type: 'plan-replace',
      query: 'Sign up',
      replacement: 'Get started',
      targets: [{ nodeId: '1:1', layerName: 'Hero' }],
      scope: 'selection',
      caseSensitive: false,
      wholeWord: false,
    });
  });

  it('offers no replace action when the replacement was left empty', () => {
    input('find-input').value = 'Sign up';
    input('find-input').dispatchEvent(new Event('input'));
    searchBtn().click();
    showResults(matches);
    expect(
      Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.includes('Replace'))
    ).toBe(false);
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/ui/features/find-replace/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 8: Write the wiring module**

Create `src/ui/features/find-replace/index.ts`, following `src/ui/features/review/index.ts` exactly in shape: a `.ts` file using `h()` rather than JSX, mounting into its host, toggling `#main-content`'s `hidden` class, and turning the component's reported decisions into messages.

Requirements the tests pin:

- `initFindReplace(root)` wires the `input` event on `#find-input` to enable `#search-btn` only when the trimmed query is non-empty, and wires the button's click to `post({ type: 'search', … })` reading `getScope()` and both checkboxes.
- The query, replacement and options used for the search are remembered at search time, so the replacement posted later is the one the results were produced from — not whatever the inputs hold when the button is clicked.
- `showResults(matches)`: empty means no render and a status saying no layers matched. Non-empty renders `ResultList` with `canReplace` set from whether the remembered replacement is non-empty, hides `#main-content`, and clears the status the way `openReview` does.
- `onReplace` posts `plan-replace` with the remembered query, replacement, scope and options, then closes the list.
- `onNavigate` posts `navigate`.
- `onCancel` unmounts and uncovers `#main-content`, posting nothing.

- [ ] **Step 9: Route the message**

In `src/ui/index.ts`, add a `search-results` case calling `showResults(message.matches)`, and call `initFindReplace(document)` alongside the other init calls.

- [ ] **Step 10: Run the wiring tests to verify they pass**

Run: `npx vitest run src/ui/features/find-replace/`
Expected: PASS, 21 tests across the two files — 11 in `results.test.tsx`, 10 in `index.test.ts`.

- [ ] **Step 11: Confirm the UI touches no Figma API**

```bash
grep -rn "figma\." src/ui/
```
Expected: no output.

- [ ] **Step 12: Full gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/ui/features/find-replace src/ui.html src/ui/index.ts
git commit -m "feat: search layers and choose what to replace"
```

---

## Task 7: Review reuse — navigation, remount, and invalidation

**Files:**
- Modify: `src/ui/features/review/screen.tsx`, `src/ui/features/review/screen.test.tsx`, `src/ui/features/review/index.ts`, `src/ui/features/review/index.test.ts`, `src/ui/index.ts`, `src/ui.html`

**Interfaces:**
- Consumes: `ChangeSet.scope` from Task 3; the `navigate` variant from Task 3.
- Produces: `invalidateOnSelectionChange()` from `src/ui/features/review/index.ts`, called by the `selection` route in `src/ui/index.ts`.

- [ ] **Step 1: Write the failing tests for the jump action**

Add to `src/ui/features/review/screen.test.tsx`, following the file's existing mount helper and adding `onNavigate` to it:

```tsx
  it('reports which layer to centre when a row asks', () => {
    const { onNavigate } = mount();
    act(() => host.querySelectorAll<HTMLElement>('[data-navigate]')[0].click());
    expect(onNavigate).toHaveBeenCalledWith('1:1');
  });

  it('offers the action on blocked rows too, since they name a node', () => {
    // A blocked row names a node the document could not take. 'missing' has
    // nothing to centre, but 'not-text' does, and the user needs to find it.
    const { onNavigate } = mount({
      changeSet: {
        changes: [],
        blocked: [{ nodeId: '2:2', layerName: 'Shape', reason: 'not-text' }],
        unchangedCount: 0,
        createdAt: 1,
      },
    });
    act(() => host.querySelectorAll<HTMLElement>('[data-navigate]')[0].click());
    expect(onNavigate).toHaveBeenCalledWith('2:2');
  });
```

- [ ] **Step 2: Write the failing tests for remount and invalidation**

Add to `src/ui/features/review/index.test.ts`:

```ts
  it('posts a navigate when a review row asks to be centred', () => {
    openReview({ changes: [change('1:1')], blocked: [], unchangedCount: 0, createdAt: 1 });
    document.querySelector<HTMLElement>('[data-navigate]')!.click();
    expect(post).toHaveBeenCalledWith({ type: 'navigate', nodeId: '1:1' });
  });

  it('does not inherit the previous selection when a second set opens', () => {
    // Two producers exist now, so a set can follow a set. Without a remount the
    // component keeps the state it initialised with and the new rows arrive
    // carrying the old decisions.
    openReview({ changes: [change('1:1'), change('1:2')], blocked: [], unchangedCount: 0, createdAt: 1 });
    const boxes = () => document.querySelectorAll<HTMLInputElement>('[data-change]');
    boxes()[0].click();
    expect(boxes()[0].checked).toBe(false);

    openReview({ changes: [change('9:1'), change('9:2')], blocked: [], unchangedCount: 0, createdAt: 2 });
    expect(Array.from(boxes()).every((b) => b.checked)).toBe(true);
  });

  it('closes a selection-scoped review when the selection changes, and says why', () => {
    openReview({
      changes: [change('1:1')],
      blocked: [],
      unchangedCount: 0,
      createdAt: 1,
      scope: 'selection',
    });
    invalidateOnSelectionChange();
    expect(document.getElementById('review-host')?.innerHTML).toBe('');
    expect(document.getElementById('main-content')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-host')?.textContent).toContain('selection changed');
  });

  it('leaves a page-scoped review alone when the selection changes', () => {
    openReview({
      changes: [change('1:1')],
      blocked: [],
      unchangedCount: 0,
      createdAt: 1,
      scope: 'page',
    });
    invalidateOnSelectionChange();
    expect(document.getElementById('review-host')?.innerHTML).not.toBe('');
  });

  it('leaves an import review alone, which has no scope at all', () => {
    openReview({ changes: [change('1:1')], blocked: [], unchangedCount: 0, createdAt: 1 });
    invalidateOnSelectionChange();
    expect(document.getElementById('review-host')?.innerHTML).not.toBe('');
  });

  it('is safe to call with no review open', () => {
    expect(() => invalidateOnSelectionChange()).not.toThrow();
  });
```

Add a `change` helper to that file if it has none:

```ts
const change = (nodeId: string): ProposedChange => ({
  nodeId,
  layerName: `Layer ${nodeId}`,
  before: 'old',
  after: 'new',
  source: 'import',
  accepted: true,
});
```

- [ ] **Step 3: Run both files to verify they fail**

Run: `npx vitest run src/ui/features/review/`
Expected: FAIL — `onNavigate` is not a prop, `invalidateOnSelectionChange` is not exported, and the remount test finds the old selection preserved.

- [ ] **Step 4: Add the jump action to the screen**

In `src/ui/features/review/screen.tsx`, add `onNavigate(nodeId: string): void` to `ReviewProps`, and give both change rows and blocked rows an element carrying `data-navigate` that calls it. Match the results list's control from Task 6 so the action reads the same on both surfaces.

Add the styling to `src/ui.html`. If the rule is identical to the results list's, group the selectors rather than duplicating the declarations — that was the resolution to Phase 1's CSS finding.

- [ ] **Step 5: Force a remount per change set**

In `src/ui/features/review/index.ts`, pass `key: changeSet.createdAt` in the `h(ReviewScreen, …)` call. `createdAt` is already produced, validated and otherwise unused; a new set carries a new key, so Preact mounts a fresh component rather than reconciling one holding the previous selection.

- [ ] **Step 6: Implement invalidation**

In `src/ui/features/review/index.ts`, add a module-level variable holding the open
set's scope, following the shape `scope.ts` already uses for its `chosen` state:

```ts
/** The scope of the set currently under review, if any. */
let openScope: Scope | undefined;
```

Set it from `changeSet.scope` in `openReview`, and add:

```ts
/**
 * A selection-scoped set names nodes that were in the selection when it was
 * built. Changes apply by nodeId, so applying it against a different selection
 * would write to layers the user never reviewed. Spec 3.1 requires the set be
 * invalidated; it closes with a reason rather than vanishing, because a screen
 * that disappears unexplained reads as a crash.
 */
export function invalidateOnSelectionChange(): void {
  if (openScope !== 'selection') return;
  closeReview();
  showStatus('Review closed: the selection changed. Search again.', 'info');
}
```

Clear the remembered scope in `closeReview` so a closed review cannot be invalidated twice.

- [ ] **Step 7: Route it**

In `src/ui/index.ts`, the `selection` case currently calls `setSelectionPresent`. Add `invalidateOnSelectionChange()` to it. Both belong there: the sandbox sends one message when the selection changes and two things react.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/ui/features/review/`
Expected: PASS.

- [ ] **Step 9: Prove the remount key bites**

Remove `key: changeSet.createdAt`. Run the review tests.
Expected: "does not inherit the previous selection when a second set opens" fails. Restore it and confirm green. Record both outputs.

- [ ] **Step 10: Full gate and commit**

```bash
npm test && npm run typecheck && npm run build
git add src/ui/features/review src/ui/index.ts src/ui.html
git commit -m "feat: centre a layer from review, and drop a stale selection's set"
```

---

## Task 8: Documentation and parity

**Files:**
- Modify: `README.md`, `CHANGELOG.md`
- Create: `docs/verification/phase-2-parity.md`

- [ ] **Step 1: Update the README**

Add Find & Replace to the feature list and the usage steps, describing the two-step flow: search lists matching layers, and replacing goes through the same review screen import uses. Note that leaving the replacement empty searches without replacing. Add the new paths to the project-structure block and verify every path in it still exists.

- [ ] **Step 2: Write the CHANGELOG entry**

Under `## [Unreleased]`, in the existing `### Added` section (or create one if this file's `[Unreleased]` block has none), in plain prose:

- Find & Replace searches the current page or the selection and lists every layer the query occurs in, with its text and an occurrence count.
- Replacing routes through the same review screen import uses; nothing is written until it is applied there.
- Leaving the replacement empty searches without replacing.
- Matching offers case sensitivity and whole word. A query is matched literally — regular expressions are not supported.
- Replacement is per layer: a layer with several matches is one row, accepted or refused whole.
- Any row in the results or the review can centre its layer in the viewport.
- Extract and Find & Replace are now separate tabs.

Under `### Changed`, note that a review built from a selection now closes when the selection changes, because changes apply by layer id and a stale set could otherwise be applied against different layers.

- [ ] **Step 3: Write the parity checks**

Create `docs/verification/phase-2-parity.md` in the same style as `docs/verification/phase-1-parity.md` — read it first and follow its structure for headings, steps and expected results, noting at the top that these need the Figma desktop app. Cover:

- searching a term that appears in several layers lists each one with the right per-layer count, and the header totals match
- searching with the replacement left empty offers no replace action, only Close
- whole word on excludes a layer where the term appears only inside a longer word, and off includes it
- case sensitive on excludes a layer differing only in case
- replacing from the results list opens review with the same layers, and applying changes exactly those
- unchecking a row in the results list keeps that layer out of the review entirely
- a layer whose text already equals the replacement is counted as unchanged rather than listed
- deleting a matched layer after searching but before replacing shows it under "Cannot apply"
- the jump action centres the right layer from both the results list and the review, and does not change the selection
- with **Selection** scope and a frame selected, searching finds only that frame's layers
- selecting something else while a selection-scoped review is open closes the review with a message, and an import review is left alone by the same action
- switching tabs preserves each tab's inputs

- [ ] **Step 4: Full gate**

```bash
npm ci && npm test && npm run typecheck && npm run build && npm audit
```
Expected: clean install, all tests pass, no type errors, build succeeds, zero vulnerabilities.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: describe find & replace and how to verify it"
```

---

## What Phase 2 does not do

- **No regular expressions.** Excluded in spec 3.4, with reasons: invalid-pattern reporting, a decision about capture references, and backtracking that can hang the sandbox.
- **No per-occurrence replacement.** `ProposedChange` holds one `before` and one `after` per node, so a layer is accepted whole. Spec 3.4 records this as following from reusing the change set.
- **No chunked traversal.** `collectTextLayers` stays synchronous recursion. The freeze risk on very large pages is real and pre-existing — extract already has it — and the fix changes `traverse.ts`'s contract for all three producers at once, so spec 8 assigns it its own cycle.
- **No match highlighting.** The results list shows a layer's text as it stands and a count. Positions would only be needed to highlight, which is why `search.ts` returns counts.
- **No all-pages search.** Spec 3.1 excludes it: it needs `figma.loadAllPagesAsync()` under `documentAccess: dynamic-page`.
- **No spell check, no AI, no network.** Phase 3. `manifest.json` is untouched.
- **The format selector stays decorative.** Unchanged from Phase 0 and 1; wiring or removing it is its own behaviour decision.
- **`app.tsx` is not built.** Tabs switch panels by class toggle; spec 3.3 records why.

---

## Self-review

**Spec coverage.** Section 3's one-builder generalisation → Task 2. Section 3.1's `ChangeSet.scope` and `selectionchange` invalidation → Tasks 3 and 7. Section 3.3's tab bar → Task 5. Section 3.4's two-step flow → Tasks 4 and 6; its matching rules, scanning implementation, Unicode word boundary, and the exclusions → Task 1. Section 3.5's zoom-without-select → Task 4, and the action on rows → Tasks 6 and 7. Section 6's testing list → Tasks 1, 2 and 3 (search matching and replacement, change-set construction per producer, invalidation). Section 8's deferred chunking → recorded above, built nowhere.

**Type consistency.** `MatchOptions` and `SearchMatch` are defined once in Task 1 and imported after. `ChangeTarget` and `buildChangeSet`'s five-parameter signature come from Task 2 and are called with that shape in Task 4's two producers. `ReplaceTarget` is defined in Task 3 and is what Task 6's `onReplace` reports and Task 4's handler consumes. `TabName` appears only in Task 5. `countMatches`, `replaceAll` and `matchingLayers` keep the names Task 1 gives them; `matchingLayers` and `replaceAll` are the two Task 4 uses.

**Known rough edges.** Task 6 gives the component and wiring module as asserted behaviours plus a props interface rather than finished code, because the markup should follow the existing stylesheet and the review feature's shape — the tests are the specification. This is deliberate and matches how Phase 1's review screen was planned. Task 1's `occurrences` advances differently depending on whether the boundary check rejected a match; that branch is the one most likely to be got wrong, which is why Step 6 requires proving it bites. Task 3 adds union members without handlers, which Step 7 verifies keeps the build green rather than assuming it — Phase 1's equivalent task deliberately broke the build, and this one should not.
