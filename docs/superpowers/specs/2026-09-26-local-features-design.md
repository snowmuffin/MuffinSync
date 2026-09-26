# Local Features — Design

**Date:** 2026-09-26
**Status:** Approved (maintainer: "implement everything that needs no external integration")
**Scope:** every deferred feature that runs entirely inside Figma and the plugin
iframe. Builds on the Copy QA spec (2026-09-19) and the large-documents spec
(2026-09-26).

---

## 1. What is in, what is out

| Feature | In | Why |
|---|---|---|
| Regular expressions in Find & Replace | Yes | Local |
| Match highlighting | Yes | Local |
| Per-occurrence replacement | Yes | Local |
| Select all on search results | Yes | Local |
| All-pages scope | Yes | Local (`loadAllPagesAsync`) |
| Include / skip hidden layers | Yes | Local |
| Text export: XLSX, DOCX, Markdown, EPUB | Yes | Files built in the iframe; no library, no service |
| Frames to PDF | Yes | Figma's own `exportAsync` |
| Snippet library | Yes | `figma.clientStorage`, per user, on the device |
| Data merge (`{{column}}` tags from a CSV) | Yes | Local file |
| Localized frame copies | Yes | Local file |
| Comment export | **No** | The plugin API cannot read comments; the REST API needs a personal token and a network call |
| Google Sheets | **No** | Needs a backend (unchanged) |

`manifest.json` keeps `networkAccess: ["none"]`.

Three earlier exclusions are reversed here, with their reasons addressed:

- **Regular expressions** were excluded for catastrophic backtracking. They are
  now an explicit opt-in checkbox, off by default. A pathological pattern can
  still stall the plugin; the README says so. Literal search keeps its
  `indexOf` scan.
- **Per-occurrence replacement** was excluded as UI cost. It is now done by
  clicking highlighted matches in a result row, which costs no extra rows.
- **All-pages search** was excluded for load time. It is now a third scope,
  never the default, and runs inside the Stage C task machinery (progress,
  Stop).

---

## 2. Find & Replace

### 2.1 One matcher, shared

`src/main/search.ts` moves to `src/shared/match.ts` so the UI can compute the
same match ranges the sandbox does — for highlighting and per-occurrence
choice — without a second implementation.

`MatchOptions` gains `regex: boolean`. `findMatches(text, query, opts)` returns
`{ start, end, groups }[]`:

- literal: today's scan, unchanged;
- regex: `new RegExp(query, 'gu' + (caseSensitive ? '' : 'i'))`; whole word
  wraps the pattern in Unicode-aware lookarounds, matching the literal rule;
  zero-length matches are skipped.

`checkQuery(query, opts)` returns an error message for an invalid pattern, so
the UI can say so before searching.

Replacement in regex mode expands `$&`, `$1`–`$99`, `$<name>` and `$$`, like
`String.prototype.replace`.

### 2.2 Per-occurrence choice

Each result row renders its text with every match highlighted. Clicking a match
toggles it; the row checkbox is checked, unchecked or indeterminate to match.
`ReplaceTarget` gains `occurrences?: number[]` (the chosen match indices) and
`expected?: string` (the text searched). When only some occurrences are chosen
and the layer's text has changed since the search, the indices no longer name
the same matches, so the row is blocked with a new reason, `changed` ("text
changed since the search"), instead of guessing.

### 2.3 Select all

The result list gets the same Select all control the review has.

---

## 3. Scope and hidden layers

- `Scope` gains `'document'` ("All pages"). The sandbox calls
  `figma.loadAllPagesAsync()` and walks every page. Extract honours it too.
- Navigation to a layer on another page now switches to that page and centres
  it, instead of reporting "That layer is on another page."
- An **Include hidden layers** checkbox (on by default, today's behaviour) sits
  under each scope control; like scope, both panels share one value. When off,
  a layer is skipped if it or any ancestor is hidden, and
  `skipInvisibleInstanceChildren` is set for the walk.

---

## 4. Export

After extracting, the download row offers CSV, JSON, XLSX, DOCX, Markdown and
EPUB. Extracted rows gain `frame` — the name of the layer's top-level frame —
so the document formats can group text under a heading per frame. CSV and JSON
keep exactly `id, name, characters`, so round-tripping is unchanged.

- **XLSX, DOCX, EPUB** are ZIP containers of XML. `src/ui/format/zip.ts` writes
  an uncompressed ZIP with CRC-32; no dependency.
- **Markdown**: `## Frame` headings, one paragraph per layer.
- **Frames to PDF**: a button on the Extract tab exports the selected frames
  (or every top-level frame on the page) with `exportAsync({ format: 'PDF' })`,
  one PDF per frame, zipped when there is more than one.

---

## 5. Snippets

A **Snippets** tab: save a name and a text; list, delete; and for each snippet,
**Apply to selection** (every text layer in the selection gets the snippet's
text — through the review screen, source `snippet`) or **Add as layer** (a new
text layer at the viewport centre, Inter Regular). Stored in
`figma.clientStorage` under `snippets`, so they follow the user across files on
this device and never leave it.

---

## 6. Generate

A **Generate** tab with two tools that both clone frames. Creating frames is
additive and undoable with Figma's undo, so they do not go through review. Both
run as a task (progress, Stop); a stopped run deletes what it created.

### 6.1 Data merge

Select one template frame whose text contains `{{Column}}` tags. Choose a CSV
(or JSON array of objects). One copy per row, laid out in a grid beside the
template, each named after the row's first column. Every tag with a matching
column is replaced; tags without one are left in place and listed in the
summary.

### 6.2 Localized copies

Select one or more frames. Choose a file with an `id` column plus one column per
locale (any column other than `id`, `name`, `characters`) — Extract's CSV with
columns added. For each frame and locale, one copy beside the original, named
`Frame — ko`. Layers in the copy are matched to the original by position in the
tree (a clone keeps the structure), and each gets its translation. Layers with
no translation keep the source text; the summary counts them.

---

## 7. Messages

New or changed, each validated with accept and reject tests:

- `search`, `plan-replace`: `regex: boolean`; `plan-replace` targets may carry
  `occurrences` and `expected`.
- `extract`, `search`: `includeHidden: boolean`.
- `Scope` accepts `'document'`.
- `TaskKind` gains `'generate'` and `'export'`.
- `ProposedChange.source` gains `'snippet'`; `BlockedChange.reason` gains `'changed'`.
- UI → sandbox: `export-pdf`, `get-snippets`, `save-snippets`, `plan-snippet`,
  `add-snippet-layer`, `merge`, `localize`.
- Sandbox → UI: `pdf-exported`, `snippets`, `generated`.

---

## 8. Tabs

Four tabs: **Extract** (extract, export, import), **Find** (find & replace),
**Generate**, **Snippets**. "Find & Replace" is shortened to fit four tabs in the
panel's 360 px.
