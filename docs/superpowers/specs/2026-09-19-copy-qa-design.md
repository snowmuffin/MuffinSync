# Copy QA — Design

**Date:** 2026-09-19
**Status:** Approved, pending implementation plan
**Scope:** MuffinSync v2 — build foundation plus the Copy QA feature set

> **Amended 2026-09-26: AI Spell Check and the AI provider layer are dropped.**
> Phase 3 will not be built. Section 4, the `spellcheck` producer, and every
> other AI reference below are kept as the record of what was designed, not as
> planned work. The code no longer carries `'spellcheck'` as a change source or
> the `reason` field that existed for it, and `networkAccess` stays `["none"]`.

---

## 1. Context

MuffinSync today is two files: `src/code.ts` (190 lines) holding all sandbox
logic, and `src/ui.html` (801 lines) holding the entire UI as one inline
`<script>`. It does two things — extract text layers to CSV/JSON, and import an
edited file back.

A much larger feature set was proposed (document export, localization
workflows, spreadsheet data binding, external content sources). That set spans
roughly twenty independent subsystems and cannot be specified as one project.
It was decomposed into tiers; this spec covers the first release only.

**Goal for the product:** free release on the Figma Community. This rules out
any component that requires us to run and pay for a server indefinitely.

### In scope

- **Tier 0** — build pipeline, module boundaries, test infrastructure
- **Find & Replace** — search text layers on the current page, replace selectively
- **Diff Review** — review proposed changes before they touch the document
- **Layer Navigation** — jump to and zoom a layer from any result list
- **AI Spell Check** — optional, requires a user-supplied API key

### Out of scope (deferred to later tiers)

Document export (PDF/DOCX/XLSX/EPUB), Frame-to-document conversion, merge tags
and spreadsheet auto-repeat, localization frame generation, comment archiving,
and AI translation. Google Sheets OAuth is excluded outright: it cannot work
without a backend, which the free-release constraint forbids.

### Source material note

The feature table this decomposition came from had two corrupted rows. The
"Export Figma Frames" row contained a fragment describing a snippet library,
and the "Spell Check" row's purpose column contained text belonging to a
comment-export feature. Two features — **Text Snippet Library** and **Export
Figma Comments** — appear to have been lost in transcription. Neither is in
this release; both should be reconsidered when planning later tiers.

---

## 2. Architecture

### 2.1 Module layout

```
src/
├── main/                 # Figma sandbox. No DOM, no network.
│   ├── index.ts          # message router
│   ├── traverse.ts       # text node collection
│   ├── apply.ts          # write text, load fonts
│   ├── search.ts         # find matches
│   ├── navigate.ts       # centre a node in the viewport; see 3.5
│   └── storage.ts        # figma.clientStorage wrapper
├── shared/
│   ├── messages.ts       # typed message contract, imported by both sides
│   └── types.ts          # TextLayerData, ProposedChange, ...
└── ui/                   # iframe. DOM and network.
    ├── index.tsx         # Preact mount
    ├── features/
    │   ├── tabs.ts       # panel switching; see 3.3
    │   ├── extract/      # existing export, unchanged behaviour
    │   ├── find-replace/
    │   ├── spellcheck/
    │   └── review/       # shared diff review
    ├── ai/
    │   ├── provider.ts   # Anthropic / OpenAI adapter
    │   └── key-store.ts  # clientStorage bridge over messages
    ├── format/
    │   ├── csv.ts        # extracted from ui.html, now testable
    │   └── json.ts
    └── components/       # small Figma-styled primitives
```

### 2.2 The two invariants

1. **The sandbox never touches the network.** Figma's plugin sandbox has no
   `fetch`; all network work belongs to the UI iframe.
2. **The UI never touches Figma nodes.** It has no access to the document API.

Everything crossing that boundary goes through the typed contract in
`shared/messages.ts`.

This replaces a real defect. `src/code.ts:33-39` currently sniffs three
possible envelope shapes to find the message payload:

```ts
if ((event as any).pluginMessage) { ... }
else if (event.data && event.data.pluginMessage) { ... }
else { msg = event as any as UIMessage; }
```

That defensiveness exists because there is no shared contract. With one, the
envelope shape is known and the casts disappear.

### 2.3 Framework choice

**Preact + TypeScript**, wired into the existing webpack build.

The v1 UI has a search result list and a diff table with per-row selection.
That is stateful list rendering — the case where hand-rolled DOM manipulation
produces the most bugs. Preact is ~4 KB, so the bundle cost is negligible, and
it uses the React API, so the knowledge transfers.

The lists are the whole of the argument. The tab bar and the settings screen are
not reasons to reach for a framework, and 3.3 does not use one for the tabs.

`@create-figma-plugin` was considered and rejected. It would supply
Figma-styled components and typed messaging out of the box, but requires
replacing webpack with its esbuild-based convention and restructuring the
project around it. Its last release was 2025-08-22, roughly a year before this
spec. Delegating build, structure, and messaging to a toolkit that may lag
Figma API changes is the wrong trade for a plugin meant to be maintained for
years. The components we actually need number about ten.

---

## 3. Core concept: the Change Set

**Find & Replace, Spell Check, and Re-Import all produce the same thing:** a
list of proposed text changes. Diff Review consumes it. Modelling that
explicitly is the centre of this design.

```ts
type ProposedChange = {
  nodeId: string;
  layerName: string;
  before: string;
  after: string;
  source: 'import' | 'find-replace' | 'spellcheck';
  reason?: string;        // spellcheck explains itself; others do not
  accepted: boolean;      // user's decision in review
};

/** A row that names a target the document cannot offer. Not a proposal. */
type BlockedChange = {
  nodeId: string;
  layerName: string;      // as written in the source; the document has no node to ask
  reason: 'missing' | 'not-text';
};

type ChangeSet = {
  changes: ProposedChange[];   // only rows whose text actually differs
  blocked: BlockedChange[];    // cannot be applied; shown, never selectable
  unchangedCount: number;      // rows that matched; counted, not listed
  scope?: Scope;          // set when produced by a traversal; see 3.1.
                          // absent for 'import', whose targets come from the file
  createdAt: number;
};
```

Blocked rows are a separate array rather than a status on `ProposedChange`, so
that `ProposedChange` keeps one meaning: something the user can accept. The
apply path filters on `accepted` alone, and a row the document cannot take has
no way to reach it.

Unchanged rows are counted, not listed. A re-imported file usually differs in a
handful of rows out of hundreds; listing the rest buries the ones that matter.

Three producers, one review UI, one apply path (`main/apply.ts`).

What this buys:

- **Spell check cannot auto-apply.** An LLM will flag brand names, product
  terms, and deliberate styling as errors. Routing every suggestion through
  review makes that structurally impossible rather than a rule someone must
  remember.
- **Import gains review for free.** Today `importTextLayers()` overwrites
  unconditionally; under this model it produces a change set like any other
  producer.
- **Layer Navigation is one action on a row**, not a feature per surface.

**One builder, not one per producer.** Every producer needs the same four-way
classification: the node is gone, the node is not text, the text already
matches, or the text differs. Writing that per producer is how two definitions
of one rule start to drift. `buildChangeSet` takes what to write as an
argument instead:

```ts
type ChangeTarget = {
  id: string;
  fallbackName: string;            // used only when the node is gone
  after(current: string): string;  // computed from the node's current text
};

buildChangeSet(
  targets: ChangeTarget[],
  source: ProposedChange['source'],
  deps: PlanDeps,
  now?: number
): Promise<ChangeSet>
```

Import passes `after: () => row.characters` — the file is the authority.
Find & replace passes `after: cur => replaceAll(cur, query, replacement, opts)`
— the document's current text is the input. Spell check will pass the
suggestion. The classification, the naming rules, and the `unchangedCount`
accounting all stay in one place.

`fallbackName` exists because a missing node cannot be asked its name. When the
node is present the document is the authority on what the layer is called; a
file, or a search result a moment stale, can carry a name that has since been
edited.

### 3.1 Scope selection

Everything that walks the document needs the same input: a set of root nodes.
That covers **extract, find & replace, and spell check**. Import is the
exception — its targets come from the file being imported, so it has no scope.

Both scopes are offered, chosen explicitly by the user, and resolved in one
place rather than reimplemented per feature.

```ts
type Scope = 'selection' | 'page';
```

`traverse.ts` resolves a `Scope` to roots — `figma.currentPage.selection` or
`figma.currentPage.children` — and recurses from there.

This makes explicit something the code already does implicitly.
`extractTextLayers()` at `src/code.ts:65-73` silently prefers selection when
anything is selected and falls back to the page otherwise. The behaviour is
reasonable; the problem is that **the UI never says which one happened.** A user
who left something selected by accident gets a partial result with no
indication why. Surfacing the choice fixes that.

Two rules follow:

- **Nothing selected** — the `selection` option is disabled and the scope is
  `page`. Better than returning an empty result and leaving the user to guess.
- **Selection changes while the plugin is open** — `figma.on('selectionchange')`
  invalidates any existing change set whose `scope` is `selection`. This is not
  cosmetic: changes apply by `nodeId`, so a stale set produced against one
  selection could otherwise be applied while a different one is active.

**Both of these land in Phase 2, not Phase 1.** Phase 1 built the disabled-option
rule but deliberately left `ChangeSet.scope` unset and invalidation unbuilt,
because import is the one producer with no scope and Phase 1 shipped no other.
Find & replace is the first traversal-produced set, so Phase 2 is where `scope`
becomes load-bearing and invalidation has something to invalidate.

Invalidation closes an open review and says why. It does not silently drop the
set: a review that vanishes with no explanation reads as a crash.

**All pages is deliberately excluded.** Under `documentAccess: dynamic-page`,
reaching other pages requires `figma.loadAllPagesAsync()`, which is expensive on
large files. If it is ever wanted, it is its own piece of work.

### 3.2 Applying a change set

`apply.ts` receives only accepted changes. For each:

1. `figma.getNodeByIdAsync(nodeId)` — required by `documentAccess: dynamic-page`
2. Skip and report if missing or not a `TEXT` node
3. Load every font the node uses, including the `figma.mixed` case, via the
   existing `loadNodeFonts()`
4. Assign `characters`

Per-change failures are collected and reported; one bad node does not abort the
batch. This matches the current import behaviour and should be preserved.

Step 2 stays even though the review already screened for it. The document can
change between review and apply — a layer deleted, a node replaced — so the
check at write time is the one that counts.

### 3.3 Reviewing a change set

**Who builds the set.** The UI parses the file, but it cannot read the
document, so it cannot know the "before" text. It sends the parsed rows to the
sandbox, which reads each node's current `characters` and returns a complete
`ChangeSet`. This keeps the invariants in 2.2 intact: only the sandbox touches
nodes, only the UI touches files.

```
choose file → UI parses → sandbox builds the change set → review → apply
```

**The screen.** Review takes over the whole panel rather than appearing as
another section. The plugin window is 400×500, and a list of changes with a
header and an action bar needs that height. Cancelling returns to the main
screen with nothing applied.

**Tabs arrive in Phase 2**, which is the first phase with a second thing to put
in one: Extract and Find & Replace. Review keeps covering the whole panel,
including the tab bar, so a review cannot be left open behind a tab the user
switched away from.

`features/tabs.ts` switches panel visibility by toggling a class, the shape
`features/scope.ts` and `features/review/index.ts` already use. Earlier drafts
of this spec put a Preact `app.tsx` shell in 2.1's tree instead; that is a
deliberate departure, and 2.1 now names `tabs.ts`. The extract and import
sections are imperative modules that query `ui.html`'s markup, so wrapping them
in a component tree means rewriting both for a result the user cannot see.
Preact is here for stateful list rendering — the review table and the search
results — not for two buttons that hide a div. `app.tsx` is worth building when
something needs it.

Each entry shows the layer name, then the before and after text stacked, not
side by side: at 400px wide, two columns give roughly 170px each, which wraps
or truncates ordinary UI copy badly enough to defeat the purpose.

```
┌─ Review changes ──────────────────┐
│ 3 of 200 layers changed           │
│ [✓ Select all]      197 unchanged │
│───────────────────────────────────│
│ ☑ Hero / Title                    │
│   − Welcome back                  │
│   + Welcome back, friend          │
│───────────────────────────────────│
│ ☐ Footer / Legal                  │
│   − © 2025 Acme                   │
│   + © 2026 Acme                   │
│───────────────────────────────────│
│ Cannot apply (1)                  │
│   Old CTA — layer no longer exists │
│───────────────────────────────────│
│         [Apply 2 changes]         │
└───────────────────────────────────┘
```

Blocked rows sit in their own section at the bottom, with the reason and no
checkbox. They are shown rather than summarised so the user can fix the file or
the document before applying — or ignore them and proceed, which is why they do
not block the button.

**Very large change sets are not virtualised.** Whether hundreds of rows in a
400px panel is actually a problem is a question to answer by measuring, not by
building a windowing layer first.

### 3.4 Find & replace

**Two steps, not one.** Searching and replacing are separated: a query produces
a result list, and replacing from that list produces a change set that goes
through 3.3's review.

```
query → sandbox searches → result list → choose rows
      → sandbox builds the change set → review → apply
```

Collapsing the two would make the review screen the only surface, which reads
tidier and costs the feature its other half: **searching with no replacement.**
"Where does this phrase appear?" is a question worth answering on its own, and a
flow that demands a replacement before it will show anything cannot answer it.
The result list is also where Layer Navigation belongs (3.5).

**The sandbox owns matching.** `main/search.ts` holds pure functions:

```ts
type MatchOptions = { caseSensitive: boolean; wholeWord: boolean };

countMatches(text: string, query: string, opts: MatchOptions): number
replaceAll(text: string, query: string, replacement: string, opts: MatchOptions): string
matchingLayers(rows: TextLayerData[], query: string, opts: MatchOptions): SearchMatch[]

type SearchMatch = {
  nodeId: string;
  layerName: string;
  characters: string;   // the layer's current text
  matchCount: number;
};
```

Counts, not positions. Offsets would only earn their keep if the result list
highlighted matches inside the text, and it does not — it shows the layer's text
as it stands and says how many times the query occurs in it.

**Matching is implemented by scanning, not by building a regular expression.**
Compiling an escaped query would work, and it would put a regex engine on the
path of every search for no gain — including its backtracking behaviour, which
is the thing excluded below. `indexOf` plus a boundary check has neither
problem.

A word boundary is the absence of a word character on either side, where a word
character is `\p{L}`, `\p{N}`, or `_`. Treating letters by Unicode category
rather than as `[A-Za-z]` keeps the rule meaningful in scripts other than Latin.
It also means whole-word matching is close to useless for Chinese, Japanese, and
Korean, which do not delimit words with spaces: `회원` will not match inside
`회원가입` with whole word on. That is the correct reading of the option rather
than a defect — the escape is to turn it off.

The UI sends the query and, later, the chosen node ids; it never computes the
replacement itself. Two reasons. The matching rule stays defined once — the UI
recomputing it is the drift this design keeps ruling against. And the change set
is built by re-reading each node, so its `before` is the document's text at
replace time rather than at search time.

**Case sensitivity and whole word, and nothing else.** Whole word earns its place
because unwanted substring matches are the common failure in exactly the job this
feature is for: renaming a product or unifying a term. Replacing `Pro` with
`Plus` should not touch `Product` or `Profile`.

**Regular expressions are excluded.** They bring a surface the rest of this
feature does not: invalid-pattern reporting, a decision about capture references
in the replacement, and catastrophic backtracking that can hang the sandbox on a
pattern a user typed by accident. If they are ever wanted, they are their own
piece of work. A query is matched literally.

**Replacement is per layer, not per occurrence.** `ProposedChange` holds one
`before` and one `after` for a node, so a layer with three matches is one row
that is accepted or refused whole. The result list says how many matches a layer
holds so the count is not hidden, but "replace the second one only" is not
representable and is not offered. This follows from reusing the change set rather
than being a separate decision, and the alternative — a per-occurrence model —
would fork `ProposedChange` for one producer.

```
┌─ Find & Replace ──────────────────┐
│ Find    [ Sign up              ]  │
│ Replace [ Get started          ]  │
│ Scope   ● Current page ○ Selection│
│ ☐ Case sensitive  ☑ Whole word    │
│           [ Search ]              │
│───────────────────────────────────│
│ 12 matches in 9 layers            │
│ ☑ Hero / CTA button          ⌖ 2  │
│   Sign up free                    │
│ ☑ Pricing / Card 1 / Button  ⌖ 1  │
│   Sign up                         │
│───────────────────────────────────│
│       [Replace 9 selected…]       │
└───────────────────────────────────┘
```

A result row carries the layer name, its current text, a match count, and the
navigate action. Selection here chooses what goes into the change set; the review
screen that follows is still free to veto per row.

**Empty query searches nothing.** The button is disabled rather than returning
every layer.

### 3.5 Layer navigation

One action, available on any row that names a node — search results and review
rows both. `main/navigate.ts` is a thin wrapper over the Figma viewport API and
is not unit tested, per section 6.

**It zooms; it does not select.** Section 2.1 originally described this as
"select and zoom", which is what a jump-to-layer action usually does. It cannot
be that here: setting `figma.currentPage.selection` fires `selectionchange`,
which 3.1 requires to invalidate any `selection`-scoped change set — so pressing
navigate on a review row would close the review the user is reading. Suppressing
self-inflicted events with a flag would work and would be a lie waiting to
desynchronise. `figma.viewport.scrollAndZoomIntoView([node])` alone centres the
layer, answers "where is this", and cannot trip the rule.

**A node can be gone by the time it is clicked.** Navigation reports that and
changes nothing, the same as any other write-time miss.

---

## 4. AI provider layer

### 4.1 Shape

```ts
interface AiProvider {
  checkSpelling(texts: string[], opts: { language?: string }): Promise<Suggestion[]>;
}
```

Anthropic and OpenAI implement it. Tier 3's AI translation will add a `translate`
method to the same interface rather than build a second integration.

### 4.2 Key handling

`figma.clientStorage` is only available in the sandbox, so the UI reads and
writes the key by message through `main/storage.ts`. The key is stored per user,
local to the plugin, and is sent to no destination other than the provider the
user selected.

### 4.3 CORS — verified

The plugin UI iframe has a `null` origin, which raised the question of whether
browser-direct calls to AI providers are possible at all. Preflight requests
were sent to both providers with `Origin: null`:

| Provider | Result |
|---|---|
| `api.anthropic.com` | `access-control-allow-origin: *`, preflight 200, and `anthropic-dangerous-direct-browser-access` explicitly listed in `access-control-allow-headers` |
| `api.openai.com` | `access-control-allow-origin: null` — the null origin is echoed back, i.e. explicitly permitted |

Anthropic returns `access-control-allow-credentials: true` alongside
`allow-origin: *`. Browsers reject that combination only for credentialed
requests; we send the API key as a header and use no cookies, so it does not
apply.

**Server-side CORS is therefore not a blocker.** What remains unverified is
whether Figma's own runtime passes the request. Figma restricts plugin network
access via `manifest.json`'s `networkAccess.allowedDomains`, currently
`["none"]`. That is configuration we control, not an external constraint, but it
cannot be confirmed outside a running Figma instance — `curl` proves nothing
here, because CORS is enforced by browsers alone. **Verification happens in
Phase 3.**

### 4.4 Cost, batching, and failure

- Texts are chunked per request; an estimated cost is shown before any call
- The user pays for their own usage, so the estimate must precede the spend
Two distinct states, deliberately handled differently:

- **No key configured** — the Spell Check tab is **hidden entirely**. A user who
  never opts in is never shown a feature they cannot use, and never wonders why
  it is greyed out.
- **Key configured but the call fails** — network blocked, provider down, quota
  exhausted — the tab **stays visible and reports the error**, because the user
  opted in and needs to know why it did not work.

In both cases every other feature is unaffected. Failure in this layer never
propagates.

### 4.5 Disclosure

Sending text to a provider means design copy leaves the user's machine for a
third party. The UI must state this plainly at the point where the key is
entered, and the key must remain optional.

---

## 5. Build pipeline

Two webpack entries: `main` (`src/main/index.ts` → `dist/code.js`) and `ui`
(`src/ui/index.tsx`).

**Constraint:** a Figma plugin's UI must be a single self-contained HTML file;
it cannot load external scripts. Setting `inject: 'body'` is therefore not
enough — the Preact bundle must be **inlined into `ui.html`**. The current
config sets `inject: false` precisely because nothing was being bundled.
Resolving this is the first task of Phase 0, since every later phase depends on
it.

TypeScript is configured with `jsx: react-jsx` and `jsxImportSource: preact`.
`npm run typecheck` and the existing CI workflow stay as they are.

---

## 6. Testing

**The project currently has zero tests.** This is the most urgent gap, and one
concrete risk makes it clear: the CHANGELOG records a fix for "multi-line
content in CSV parsing", and that character-by-character parser lives today
inside the `ui.html` inline script with no test covering it.

**Runner:** vitest — native TypeScript, fast, no extra build step.

**A DOM environment arrives with Phase 1, not before.** Phase 0 runs vitest
under `environment: 'node'` because every module it tests is pure. The review
screen is the first component whose rendered output is worth asserting, so the
DOM environment comes in alongside it. Two things go in at the same time: the
review's own tests, and a rendering test for the status banner — Phase 0 shipped
a commit where its detail lines ran into the message text, and review caught
that, not a test.

**What gets tested:** pure functions, which is why logic is pushed out of the
Figma-facing modules.

- CSV serialize and parse, including multi-line values, embedded quotes, commas
- JSON serialize and parse
- Change-set construction from each of the three producers, through the one
  `buildChangeSet` they share: that each producer's `after` resolver is applied,
  and that all four classification branches are reachable from each
- Search matching and replacement: case sensitivity, whole word, matches at the
  start and end of a string, adjacent and repeated matches in one layer, a query
  containing regular-expression metacharacters treated literally, and a
  replacement that reproduces the original text landing in `unchangedCount`
- Scope resolution: that `selection` and `page` pick the right roots, and that
  a change set produced under `selection` is invalidated when the selection
  changes
- AI response parsing into `Suggestion[]`, including malformed responses

**What does not get unit tested:** direct Figma API calls. `main/` modules stay
thin wrappers so that little logic is trapped behind an un-mockable API.

---

## 7. Phases

Each phase ends with a working plugin.

| Phase | Contents | Done when |
|---|---|---|
| **0** | Build pipeline, bundle inlining, module split, vitest | **No behaviour change.** Existing extract and import work exactly as before, now with tests |
| **1** | Change Set model, Diff Review UI, import retrofitted onto it, shared scope selector, DOM test environment | Import routes through review instead of overwriting; extract's scope is visible rather than implicit; component output is under test |
| **2** | Find & Replace, Layer Navigation, the tab bar, `buildChangeSet` generalised to serve two producers, and the two rules 3.1 left unbuilt — `ChangeSet.scope` and `selectionchange` invalidation | Searching answers "where does this appear" on its own; replacing routes through the same review import does; a selection-scoped set cannot outlive the selection it was built against |
| **3** | ~~AI provider layer, Spell Check~~ | **Dropped 2026-09-26** — see the note at the top |

Phase 0 changes no user-visible behaviour by design. That is what makes it
safe: any regression is unambiguous.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Figma runtime blocks provider requests | Server-side CORS already cleared. Remaining surface is `allowedDomains`, which we control. Verified in Phase 3; failure disables one tab, not the plugin |
| Bundle inlining proves awkward | Confirmed first, in Phase 0, before anything depends on it |
| Large documents freeze the UI | `collectTextLayers()` is synchronous recursion. Traversal must chunk and yield. Needs a document with thousands of text nodes to test against. **Deliberately not in Phase 2:** the defect predates it, find & replace walks the same tree extract already walks, and the fix changes `traverse.ts`'s contract for all three producers at once. Its own spec and plan cycle |
| LLM flags correct text as wrong | Structural: suggestions cannot bypass Diff Review |
| Scope creep from later tiers | Each tier gets its own spec and plan cycle |

---

## 9. Naming

> **Decided 2026-09-26: the plugin is renamed Copydesk.** A copy desk is where
> a newspaper's copy is edited and checked before print, which covers extract,
> find & replace and review, and leaves room for later tiers. The plugin id is
> unchanged, so installations carry over. The text below is the original
> reasoning for deferring the decision.

The plugin is called MuffinSync. "Sync" describes the round-trip extract/import
workflow accurately, and Tier 1 does not strain it. It stops fitting at Tier 2,
where document generation is publishing, not syncing.

A rename is **not** decided here. Two reasons to defer: the right name depends
on how far the product actually goes, and Figma preserves the plugin ID and
existing installations across a rename, so there is no cost to deciding later.
Revisit before the v1 Community release.

---

## 10. Open questions

None blocking. One item to settle during implementation:

1. Which AI provider is the default in the UI when a user has keys for both
