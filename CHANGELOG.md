# Changelog

All notable changes to Copydesk (formerly MuffinSync) will be documented in this file.

## [Unreleased]

## [1.2.0] - 2026-09-26

First release as **Copydesk** (formerly MuffinSync).

### Added
- **Regular expressions** in Find & Replace, opt-in, with `$1`/`$&`/`$<name>`
  in the replacement; an invalid pattern is reported before searching.
- **Matches are highlighted** in the results, and clicking one leaves that
  occurrence alone, so a layer can be partly replaced. **Select all** on the
  results list.
- **All pages** scope for extract and search; **Show** switches to the
  layer's page.
- **Include hidden layers** option (on by default).
- **Export text to Excel, Word, Markdown and EPUB**, grouped by frame, and
  **frames to PDF** with Figma's own export.
- **Snippets** tab: a personal text library stored on this device; apply to
  the selection through review, or add as a new layer.
- **Generate** tab: **data merge** (`{{Column}}` tags, one copy per CSV/JSON
  row) and **localized copies** (one copy per frame and language column).
- Find & Replace searches the selection, the current page or every page and
  lists every layer the query occurs in, with its text and an occurrence count.
- Replacing routes through the same review screen import uses; nothing is
  written until it is applied there.
- Leaving the replacement empty searches without replacing.
- Matching offers case sensitivity and whole word. A query is matched
  literally unless Regular expression is ticked.
- Any row naming a layer still in the document — in the results or the
  review — can centre it in the viewport.
- Extract, Find, Generate and Snippets are separate tabs.
- `.editorconfig`.
- A test suite (vitest), where there was none, covering CSV and JSON handling,
  the message contract, layer traversal, scope resolution, and text
  application. Run it with `npm test`.
- **Large pages stay responsive.** Extract, search, planning and apply run in
  short time slices and hand control back to Figma between them, with a
  running count in the status line ("Searching text layers... 4,200 of
  20,000").
- A **Stop** button on extract, search and planning; stopping produces
  nothing. Apply reports progress but always runs to the end.
- Result and review lists show 200 rows at a time with "Show more"; counts,
  select-all, Replace and Apply cover every row. Rendering 20,000 rows went
  from about 4 seconds to about 20 ms.

### Changed
- A review built from a selection now closes when the selection changes,
  because changes apply by layer id and a stale set could otherwise be
  applied against different layers.
- Import now shows what would change and applies only what is accepted,
  instead of applying to the document the moment a file is chosen.
- Rows the document cannot take — because the layer id no longer exists, or
  the node is no longer a text layer — are listed under "Cannot apply" before
  anything is applied, rather than being reported as errors afterwards.
- Rows whose text already matches the document are counted, not listed, so
  the review screen only spells out what would actually change.
- The extraction scope (current page or selection) is now a visible choice in
  the UI rather than something inferred from what happens to be selected.
- **An edit made on the canvas while the review is open is no longer
  overwritten.** Applying re-reads each layer and skips any whose text no
  longer matches what the review was built against, reporting that row rather
  than silently replacing the newer text.
- Build toolchain updated: webpack 5.111, TypeScript 5.9, ts-loader 9.6,
  html-webpack-plugin 5.6.8, `@figma/plugin-typings` 1.138. This clears all 11
  known advisories previously reported by `npm audit` (all in dev tooling; the
  shipped plugin bundle was never affected).
- Node 22 is now the supported version, in `engines` (Node 18 is
  end-of-life).
- Console logging is gated behind a `DEBUG` flag instead of always running.
- `ui.html` is now minified in production builds, cutting it from 22.7 KiB to
  12.6 KiB. `code.js` is 1.84 KiB.
- **The UI is bundled instead of being one inline script**, so it can use npm
  packages. The build still inlines the compiled bundle into `ui.html` at
  build time, so the output remains the single self-contained file Figma
  requires.
- **Source is split into `src/main/`, `src/ui/`, and `src/shared/`**, each
  with its own TypeScript config (`tsconfig.main.json`, `tsconfig.ui.json`,
  both extending the shared `tsconfig.json`). DOM types are unreachable from
  sandbox code and Figma types are unreachable from UI code — enforced by the
  compiler, not by convention.
- **Messages between the sandbox and the UI are now validated**, not just cast
  on the message type. `unwrapUiMessage` / `unwrapMainMessage` check every
  payload field before a message is accepted.
- **Status detail lines are rendered as structured markup** (a Preact
  component) instead of being concatenated into an HTML string. Those lines
  can include text-layer names read from an imported file, so the old
  approach was an injection path fed by document content.
- The CSV/JSON selector above the Extract button is gone. It was never
  read: the format has always been decided by which download button is
  pressed after extracting, so the user chose twice and only the second
  choice counted.
- **Renamed from MuffinSync to Copydesk.** The plugin does more than sync
  text now, and "Copydesk" leaves room for what comes next. The Figma plugin
  id is unchanged, so existing installations carry over.
- Text layers are found with Figma's native `findAllWithCriteria` instead of
  a recursive walk in the plugin, and apply loads each font once per run
  instead of once per layer.
- Only one long task runs at a time; Extract, Import and Search are
  unavailable until it finishes.

### Fixed
- The manual-copy download fallback no longer builds its markup from the file
  content, so layer text containing HTML can't inject elements into the panel.
- **Mixed-font import**: text layers using more than one font across character
  ranges failed to import. Every font in the range is now loaded via
  `getRangeAllFontNames()` before the text is replaced.
- **CSV round-trip preserved exactly.** Leading and trailing whitespace, tab
  indentation, and carriage returns were silently lost or truncated on export
  and re-import. Values that need protection are now quoted on export, and a
  field that arrived quoted is never trimmed on the way back in.
- **Malformed import files are now rejected instead of silently mangled.**
  `fromCSV` rejects a file whose header is missing a required column, and
  `fromJSON` rejects entries without string `id`, `name`, and `characters`.
  Previously both were accepted, blanking layers or reporting "Updated 0 text
  layers" with no explanation of why.
- **An import file naming the same layer twice is rejected**, listing the
  repeated ids. Both rows used to become review entries sharing one
  checkbox, and whichever was applied last silently won.
- Pressing Enter in the Find or Replace field now searches, as the Search
  button does.
- The tab bar is a proper ARIA tab list: the selected tab is announced as
  selected rather than shown by colour and weight alone, and the arrow keys,
  Home and End switch tabs.
- "Searching…", "Checking what would change…", "Extracting…" and
  "Applying changes…" now stay on screen until the result replaces them.
  They used to disappear after 3 seconds, so a slow run on a large page went
  silent and looked stalled.

### Removed
- Unused `css-loader` / `style-loader` dependencies and their webpack rule — the
  project has no `.css` files; the UI styles are inline in `ui.html`.
- Dead `src/global.d.ts` and `src/ui.ts`, plus stray macOS `._*` metadata files
  and a 1.3 MB unused `icon.png`.

## [1.0.0] - 2025-08-08

### Added
- Initial release of MuffinSync plugin
- Text layer extraction functionality
- Support for CSV and JSON export formats
- Text layer import and update capabilities
- Multi-line content support in CSV parsing
- Enhanced error handling and user feedback
- Comprehensive documentation
- Automated build system with Webpack
- TypeScript support for better code quality

### Features
- 🧁 **Text Extraction**: Extract all text layers from selected frames or entire page
- 📄 **Multiple Formats**: Support for both CSV and JSON export/import
- ✏️ **External Editing**: Edit text content outside of Figma
- 🔄 **Seamless Import**: Update Figma text layers with edited content
- 🛡️ **Robust Parsing**: Handle multi-line text and special characters
- 🎯 **Smart Font Loading**: Automatic font loading for updated text layers

### Technical Details
- Built with TypeScript and Webpack
- Optimized bundle size (22.9 KiB UI, 2.38 KiB code)
- Character-by-character CSV parsing for complex content
- Multiple download fallback methods for browser compatibility
- Comprehensive error handling and user feedback

### Supported Features
- Text layer extraction from selected frames or entire page
- CSV and JSON format support
- Multi-line text content handling
- Font loading and text updates
- Error reporting and status feedback
- Debug logging for development

---

### How to Use This Version
1. Install the plugin in Figma
2. Select frames or use on entire page
3. Extract text layers in your preferred format
4. Edit the downloaded file externally
5. Import back to update Figma text layers

For detailed instructions, see [README.md](README.md)
