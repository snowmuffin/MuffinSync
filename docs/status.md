# Project status

**As of 2026-09-26, after Stage A.** 255 tests across 16 files; typecheck clean
on both configs; build green; `npm audit` clean.

This is a snapshot, not a plan. The plan for each phase lives in
`docs/superpowers/plans/`, and the design they argue from is
`docs/superpowers/specs/2026-09-19-copy-qa-design.md`.

---

## Phases

Section 7 of the spec defines four phases. Three are merged; the fourth was dropped.

| Phase | Contents | State |
|---|---|---|
| **0** | Build pipeline, bundle inlining, module split, vitest | Merged. No behaviour change by design |
| **1** | Change Set model, Diff Review UI, import retrofitted onto it, shared scope selector, DOM test environment | Merged |
| **2** | Find & Replace, Layer Navigation, the tab bar, one change-set builder for every producer, `ChangeSet.scope` and `selectionchange` invalidation | Merged |
| **3** | AI provider layer, Spell Check | **Dropped** (2026-09-26). The plugin makes no network calls |

### What the plugin does today

Extract text layers to CSV or JSON, scoped to the current page or the selection.
Edit the file outside Figma and import it back: every row is compared against the
document and shown as a reviewable change set — rows that differ are listed with
their before and after, rows that already match are counted, and rows the document
cannot take are listed as blocked before anything is applied. Nothing is written
until the review is accepted, and applying re-reads each layer so an edit made on
the canvas during review is never silently overwritten.

Find & Replace searches the chosen scope and lists every layer the query occurs
in, with its current text and an occurrence count. Leaving the replacement empty
searches without replacing. Chosen rows route through the same review screen.
Matching offers case sensitivity and whole word; queries are matched literally.
Any row naming a layer still in the document can centre it in the viewport.

---

## Manual verification

`docs/verification/` holds the parity checks for each phase: 7 for Phase 0, 9 for
Phase 1, 12 for Phase 2. They need the Figma desktop app and cover what no unit
test can reach.

**Status: started, not complete.** What has been observed in Figma so far:

| Check | Result |
|---|---|
| Plugin imports and opens from `manifest.json` | Pass |
| Tab bar renders; switching between Extract and Find & Replace works | Pass |
| Cold open with nothing selected: **Selection** disabled, **Current page** chosen | Pass — this is the one that would fail if the `ui-ready` handshake dropped the sandbox's first selection report |
| Both panels' **Selection** options disable together | Pass — confirms the fix for a defect where only the first was disabled |
| Both panels show the same scope | Pass — the two controls are two views of one choice, per spec 3.1 |

Everything else in all three parity documents is **unrun**. The checks that matter
most, because nothing else can reach them:

- A layer edited on the canvas while a review is open is not overwritten.
- A selection-scoped review closes with a stated reason when the selection changes.
- Navigating to a layer on another page reports that, rather than a generic error.
- A whitespace-only replacement — collapsing a double space to a single one — is
  visible in the review's before/after lines. This is why `white-space: pre-wrap`
  is set on those lines; without it HTML collapses the runs and the two lines
  render identically.

### Found by running the plugin

One defect so far, fixed in `ed26e20`: the stylesheet had no `:disabled` rule, so
the Search button — which ships disabled until a query is typed — was pixel-identical
to a live one. It read as pressable, and pressing it did nothing, which reads as a
hang. No unit test could catch this: the assertion that matters is that the state is
*visible*, and the stylesheet is a raw `<style>` block in `src/ui.html` that the test
environment does not apply.

That blind spot is general. Anything whose correctness is "the user can see X" is
outside the test suite's reach, and the parity documents are the only net.

---

## Stage C0 measurements

Design: `docs/superpowers/specs/2026-09-26-large-documents-design.md`.

**List rendering** (measured here, headless Chromium, no stylesheet — a lower
bound):

| Rows | Result list | Review |
|---|---|---|
| 1,000 | 234 ms | 197 ms |
| 5,000 | 817 ms | 920 ms |
| 20,000 | 2,415 ms | 4,050 ms |

Over the ~200 ms budget from about 1,000 rows, so the list cap (C4) is in scope.

**Sandbox paths** (walk, find, read, postMessage, lookup, apply): pending — they
need the Figma desktop app. Run `tools/fixture/` per its README and record the
JSON here.

---

## Resolved in Stage A (2026-09-26)

Eight items this list used to carry, closed on `claude/zen-sagan-zay4p6` per
`docs/superpowers/plans/2026-09-26-remaining-roadmap.md`:

- The decorative CSV/JSON format selector is removed; the download buttons decide.
- An import file naming one layer id twice is rejected, with the ids named.
- Enter in the Find panel searches.
- The tab bar has ARIA tab semantics and arrow/Home/End key switching.
- In-progress statuses stay up until answered (a new `progress` status kind).
- The review screen remounts per `openReview` call, not per millisecond.
- The other-page check is pure (`isWithin` in `traverse.ts`) and tested.
- `initTabs` / `initScope` detach the previous call's listeners.

Manual checks for the visible ones: `docs/verification/stage-a-parity.md`.

---

## Known deferred items

Each was found in review, judged non-blocking, and left deliberately.

**Correctness and robustness**

- **Traversal does not chunk or yield.** `collectTextLayers` is synchronous
  recursion, so a page with thousands of text layers can freeze the panel during an
  extract or a search. Pre-existing; the fix changes the contract for all three
  producers at once, so spec section 8 assigns it its own cycle. The in-progress
  status messages make a freeze legible, but do not prevent it.

**Contract and tests**

- **`search-results.scope` and `ChangeSet.createdAt` are validated and transported
  but never read.** `createdAt` was the review's remount key until Stage A replaced
  it with a counter. Both are kept: dropping a field is a contract change, and
  neither costs anything to carry.
- **No test pins the `action` class opt-in** that the action-bar spacing depends on
  in the stylesheet — only the class's presence in the two components is asserted,
  not that the spacing follows.

**UI**

- The navigate action is offered on blocked rows whose reason is `not-text`, which
  is useful, and withheld from `missing` rows, which is correct. It is not offered
  anywhere else.

**Process**

- Identical CSS declarations were duplicated in `src/ui.html` four times across two
  phases, every instance caught only in review. The convention adopted in response:
  *action-bar spacing belongs to a class the markup opts into, never to a list of
  host ids that grows by one per producer.* Plans should also stop specifying
  literal CSS blocks per task — a block handed to a task is a block that gets pasted.

---

## Not in this tier

The feature set this project was decomposed from spans roughly twenty independent
subsystems. Spec section 1 scopes the current tier to build pipeline, Find &
Replace, Diff Review, Layer Navigation, and AI Spell Check; AI Spell Check was
since dropped, and the plugin makes no network calls. Deferred to later
tiers, with reasons:

- Document export (PDF/DOCX/XLSX/EPUB) and Frame-to-document conversion — these are
  publishing, not syncing, and are large enough to need their own spec.
- Localization workflows and locale frame generation.
- Spreadsheet data binding, merge tags, and auto-repeat.
- External content sources. **Google Sheets OAuth is excluded outright**: it cannot
  work without a backend, and the free Community release rules that out.
- Comment archiving and export.
- A text snippet library.

Also excluded within this tier, each with its reason recorded in the spec: regular
expressions in Find & Replace, per-occurrence replacement, match highlighting, and
all-pages search.

---

## Before a release

- Run the three phase parity documents and `stage-a-parity.md` in Figma desktop
  and record the results.
- ~~Decide the plugin's name.~~ Decided 2026-09-26: **Copydesk** (spec §9). The
  repository was renamed to `snowmuffin/Copydesk` the same day; GitHub redirects
  the old URL, so an existing clone keeps working without changing its remote.
- ~~Settle the format selector.~~ Removed in Stage A.
- Upload `icon-128.png` as the Community icon when publishing: it was redrawn for
  the rename, and the listing still shows the old muffin until it is replaced.
