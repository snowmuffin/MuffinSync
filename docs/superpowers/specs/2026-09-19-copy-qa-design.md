# Copy QA — Design

**Date:** 2026-09-19
**Status:** Approved, pending implementation plan
**Scope:** MuffinSync v2 — build foundation plus the Copy QA feature set

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
│   ├── navigate.ts       # select and zoom a node
│   └── storage.ts        # figma.clientStorage wrapper
├── shared/
│   ├── messages.ts       # typed message contract, imported by both sides
│   └── types.ts          # TextLayerData, ProposedChange, ...
└── ui/                   # iframe. DOM and network.
    ├── index.tsx         # Preact mount
    ├── app.tsx           # tab shell
    ├── features/
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

The v1 UI has four tabs, a search result list, a diff table with per-row
selection, and a settings screen. That is stateful list rendering — the case
where hand-rolled DOM manipulation produces the most bugs. Preact is ~4 KB, so
the bundle cost is negligible, and it uses the React API, so the knowledge
transfers.

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

type ChangeSet = {
  changes: ProposedChange[];
  createdAt: number;
};
```

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

### 3.1 Applying a change set

`apply.ts` receives only accepted changes. For each:

1. `figma.getNodeByIdAsync(nodeId)` — required by `documentAccess: dynamic-page`
2. Skip and report if missing or not a `TEXT` node
3. Load every font the node uses, including the `figma.mixed` case, via the
   existing `loadNodeFonts()`
4. Assign `characters`

Per-change failures are collected and reported; one bad node does not abort the
batch. This matches the current import behaviour and should be preserved.

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

**What gets tested:** pure functions, which is why logic is pushed out of the
Figma-facing modules.

- CSV serialize and parse, including multi-line values, embedded quotes, commas
- JSON serialize and parse
- Change-set construction from each of the three producers
- Search matching and replacement, including case sensitivity
- AI response parsing into `Suggestion[]`, including malformed responses

**What does not get unit tested:** direct Figma API calls. `main/` modules stay
thin wrappers so that little logic is trapped behind an un-mockable API.

---

## 7. Phases

Each phase ends with a working plugin.

| Phase | Contents | Done when |
|---|---|---|
| **0** | Build pipeline, bundle inlining, module split, vitest | **No behaviour change.** Existing extract and import work exactly as before, now with tests |
| **1** | Change Set model, Diff Review UI, import retrofitted onto it | Import routes through review instead of overwriting |
| **2** | Find & Replace, Layer Navigation | Complete without any network access |
| **3** | AI provider layer, Spell Check | Figma runtime `networkAccess` verified here |

Phase 0 changes no user-visible behaviour by design. That is what makes it
safe: any regression is unambiguous.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Figma runtime blocks provider requests | Server-side CORS already cleared. Remaining surface is `allowedDomains`, which we control. Verified in Phase 3; failure disables one tab, not the plugin |
| Bundle inlining proves awkward | Confirmed first, in Phase 0, before anything depends on it |
| Large documents freeze the UI | `findTextNodes()` is synchronous recursion today. Traversal must chunk and yield. Needs a document with thousands of text nodes to test against |
| LLM flags correct text as wrong | Structural: suggestions cannot bypass Diff Review |
| Scope creep from later tiers | Each tier gets its own spec and plan cycle |

---

## 9. Naming

The plugin is called MuffinSync. "Sync" describes the round-trip extract/import
workflow accurately, and Tier 1 does not strain it. It stops fitting at Tier 2,
where document generation is publishing, not syncing.

A rename is **not** decided here. Two reasons to defer: the right name depends
on how far the product actually goes, and Figma preserves the plugin ID and
existing installations across a rename, so there is no cost to deciding later.
Revisit before the v1 Community release.

---

## 10. Open questions

None blocking. Two items to settle during implementation:

1. Which AI provider is the default in the UI when a user has keys for both
2. Whether Phase 2's Find & Replace searches the current page only, or offers
   the current selection as a scope — the existing `extractTextLayers()` already
   prefers selection over page, and consistency argues for matching it
