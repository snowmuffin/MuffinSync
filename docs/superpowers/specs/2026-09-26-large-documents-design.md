# Large Documents — Design

**Date:** 2026-09-26
**Status:** Approved 2026-09-26 — §9 decided as recommended
**Scope:** Stage C of `docs/superpowers/plans/2026-09-26-remaining-roadmap.md`.
Spec `2026-09-19-copy-qa-design.md` §8 assigned this its own spec and plan cycle.

---

## 1. Problem

Every path that touches the document does all of its work in one go:

| Path | Where | Shape of the work |
|---|---|---|
| Extract | `collectTextLayers` in `src/main/traverse.ts` | Synchronous recursion over every node under the roots |
| Search | the same walk, then `matchingLayers` | Synchronous walk, then a synchronous scan |
| Plan (import, replace) | `buildChangeSet` in `src/main/plan.ts` | One `getNodeByIdAsync` per row, in sequence |
| Apply | `applyTextChanges` in `src/main/apply.ts` | One lookup and one font load per row, in sequence |
| Result list, review | `results.tsx`, `screen.tsx` | Every row rendered at once |

On a page with thousands of text layers this can hold the plugin for seconds.
The plugin sandbox runs on Figma's main thread, so a long synchronous stretch
likely stalls the editor too, not just the panel — part of what §3 measures.
Stage A made the wait legible (a `progress` status that stays up) but did not
shorten or break it up.

**Goal:** on a page with 20,000 text layers, every path stays responsive —
the canvas and panel keep repainting, the user sees how far along the work is,
and read-only work can be stopped.

**Non-goals:** all-pages search (excluded by the main spec); changing what is
collected (hidden layers and instance children stay included — see §9.1).

---

## 2. Principles

1. **Measure before choosing.** The costs below are hypotheses. Nothing past
   §3 is built until the fixture numbers are in.
2. **One contract for every producer.** Extract, search and plan share the
   walk today; they keep sharing it. No producer gets its own chunking.
3. **Read-only work can stop; writes cannot half-stop.** Extract, search and
   plan are cancellable. Apply is not (§6).
4. **Logic stays testable.** The chunking, progress and cancellation rules live
   in pure modules with the Figma calls injected, as `plan.ts` and `apply.ts`
   already do.

---

## 3. Measurement first (C0)

### 3.1 A fixture plugin

A second, development-only plugin under `tools/fixture/` with its own
`manifest.json`, never published. One command: create a page with N text
layers (N = 1,000 / 5,000 / 20,000), spread across nested frames and a few
component instances, using one font so loading is not the variable. It exists
because nobody can build a 20,000-layer page by hand, and the checks in
`docs/verification/` need one.

### 3.2 What to time

For each N, in the Figma desktop app, with timings logged from the sandbox:

- the walk alone (current recursion) vs. `findAllWithCriteria({ types: ['TEXT'] })`
- reading `id`, `name`, `characters` off every found node
- `postMessage` of the full row list
- `buildChangeSet` over N rows
- `applyTextChanges` over N rows, with and without a font cache (§6)
- rendering the result list and the review with N rows

### 3.3 What the numbers decide

- Whether `findAllWithCriteria` replaces the recursion (§4.1).
- The chunk size (§4.2): the largest that keeps a chunk under ~50 ms.
- Whether list rendering needs a cap (§7) — only if a render exceeds ~200 ms.

Results go in `docs/status.md`.

---

## 4. Traversal

### 4.1 Finding text nodes

Hypothesis: the recursion is slow because every `children` access crosses from
the sandbox into Figma and allocates an array, once per node. Figma's
`findAllWithCriteria({ types: ['TEXT'] })` does the walk natively and returns
only text nodes. If §3 confirms it, each root is searched with it (plus the
root itself when the root is a text layer), in the same depth-first order the
recursion produces today, so extract output does not reorder.

`figma.skipInvisibleInstanceChildren` stays `false`, so the set of layers found
is unchanged (§9.1).

### 4.2 Reading in chunks

Finding nodes is one native call; reading `name` and `characters` from each is
per-node work. That loop runs in chunks: after every chunk the sandbox yields
(`await` a zero-delay timer) so Figma can repaint and deliver messages, reports
progress, and checks for cancellation.

A node removed between being found and being read (the canvas stays live) is
skipped, not an error.

### 4.3 The new contract

```ts
interface TaskControl {
  /** Called after each chunk. */
  onProgress(done: number, total: number): void;
  /** True once the user has asked to stop. */
  isCancelled(): boolean;
  /** Hands control back to Figma between chunks. Injected so tests run instantly. */
  yieldToHost(): Promise<void>;
}

collectTextLayers(
  roots: ReadonlyArray<TextSourceRoot>,
  control: TaskControl,
  chunkSize: number
): Promise<TextLayerData[] | 'cancelled'>
```

`TextSourceRoot` is the slice of Figma the function needs (`findAllWithCriteria`
and the root's own fields), so tests pass plain objects as today. The one
generic piece — run `work` over items in chunks, yield, report, stop on
cancel — is its own function, `runChunked`, and the plan and apply loops use
it too.

---

## 5. Progress and cancellation

### 5.1 Messages

Added to `src/shared/messages.ts`, validated with accept and reject tests like
every other variant:

- sandbox → UI: `{ type: 'progress', task, done, total }`, where `task` is
  `'extract' | 'search' | 'plan' | 'apply'`. Sent once per chunk, not per node.
- UI → sandbox: `{ type: 'cancel-task' }`.
- sandbox → UI: `{ type: 'task-cancelled', task }`.

### 5.2 What the user sees

The existing `progress` status gains a count: "Searching text layers… 4,200 of
20,000". While extract, search or plan runs, it also shows a **Stop** button.
Stopping ends the task with nothing produced — no partial extract file, no
partial result list, no partial review — and says "Stopped. Nothing was
changed."

### 5.3 One task at a time

Yielding means a second request could interleave with the first. The sandbox
runs one task at a time and answers any request that arrives meanwhile with
an error ("Another task is still running."). The UI also disables Extract,
Import and Search while a task runs, so the error is a backstop, not the
normal path.

---

## 6. Plan and apply

Both already `await` per row; they gain `runChunked` for progress and
yielding. Plan is read-only and cancellable like the walk.

**Apply is not cancellable.** A stop halfway through would leave some layers
written and others not, and the review that justified the batch would no
longer describe the document. It reports progress and runs to the end.

**Font cache.** `loadFonts` calls `figma.loadFontAsync` for every row, even
when a thousand rows share one font. Apply keeps the set of fonts it has loaded
in this run (keyed by family and style) and skips repeats. Expected to be the
largest apply win; §3 confirms.

---

## 7. Long lists in the UI

> **Measured 2026-09-26 — the cap is needed.** Rendering in headless Chromium
> (Preact production build, no stylesheet, so a lower bound): result list
> 234 / 817 / 2,415 ms and review 197 / 920 / 4,050 ms at 1k / 5k / 20k rows.
> Both are over the ~200 ms budget from about 1,000 rows. C4 is in scope.

The result list and the review render every row. If §3 shows a render over
~200 ms, both render the first 200 rows with a "Show N more" button.
Select-all and the Replace/Apply counts must still cover every row, rendered or
not — the checkbox state lives in the component's state, not in the DOM, so
that holds without extra work, but it gets a test. If §3 shows rendering is
fast enough, this section is dropped.

---

## 8. Testing

**Unit tests** (vitest, no Figma):

- `runChunked`: every item processed once, in order; `onProgress` once per
  chunk with correct counts; stops at the next chunk boundary when cancelled;
  a final partial chunk; an empty input.
- `collectTextLayers` on fake roots: same rows and order as today's recursion
  on the same tree; a root that is itself text; a node removed mid-run is
  skipped; cancellation returns `'cancelled'`.
- The busy guard: a second task while one runs is refused.
- Apply's font cache: one load per distinct font; a failed load is not cached.
- Message variants: accept and reject cases for the three new messages.
- If §7 applies: select-all and counts include unrendered rows.

**Manual checks** (`docs/verification/stage-c-parity.md`), on fixture pages:

- the canvas repaints and the count advances during a 20,000-layer search;
- Stop ends a search and an extract with nothing produced;
- Extract, Import and Search are disabled while a task runs;
- apply over thousands of rows completes and reports progress;
- a layer deleted on the canvas mid-search does not break the search.

---

## 9. Decisions

All three decided 2026-09-26 as recommended below.

1. **Hidden layers and instance children.** Today every text layer is
   collected, visible or not. Setting `skipInvisibleInstanceChildren` would be
   much faster on component-heavy files but changes what extract and search
   return. **Recommend:** keep current behaviour in Stage C; offer "skip hidden
   layers" as an option later if asked for.
2. **Stop button scope.** **Recommend:** extract, search and plan only; apply
   runs to completion (§6).
3. **List cap.** **Recommend:** decide from §3's numbers rather than now.

---

## 10. Phases

| Phase | Contents | Done when |
|---|---|---|
| **C0** | Fixture plugin; timings for every path at 1k / 5k / 20k | Numbers recorded in `docs/status.md`; §4.1, chunk size and §7 decided |
| **C1** | `runChunked`, async `collectTextLayers`, `progress` message, count in the status | Extract and search report progress on a 20k page and the canvas keeps repainting |
| **C2** | `cancel-task`, Stop button, busy guard, disabled buttons | Stop ends extract and search with nothing produced; a second task is refused |
| **C3** | Plan and apply through `runChunked`; font cache | Import and replace over thousands of rows report progress; apply loads each font once |
| **C4** | List cap, only if C0 calls for it | Long lists render within the budget; counts cover unrendered rows |

C0 needs the maintainer in the Figma desktop app: the fixture runs there and
the timings are read from its console.
