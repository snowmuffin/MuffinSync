# Stage A manual checks

> **Superseded.** Before a release, run `tools/self-test` and
> `docs/verification/manual-checklist.md` instead. This document is kept as the
> record of what was checked for its phase; some steps describe behaviour that
> has since changed.

The Stage A cleanups (`docs/superpowers/plans/2026-09-26-remaining-roadmap.md`)
that only show up in a running plugin. Everything else in Stage A is covered by
unit tests. Run these in the Figma desktop app after `npm run build`, alongside
the Phase 0–2 parity documents, before a release.

Setup: `npm ci && npm run build`, then import `manifest.json` into Figma
(**Plugins → Development → Import plugin from manifest…**). Any document with a
few text layers will do.

## 1. The Extract panel has no format choice before extracting

1. Open the plugin on the **Extract** tab.

Expected: under "1️⃣ Extract Text" there is the scope control (Selection /
Current page) and the **Extract Text Layers** button, and no CSV/JSON selector.
After extracting, **CSV Download** and **JSON Download** each save a file in
their own format.

## 2. An import file naming one layer twice is refused

1. Extract to CSV and open the file in a text editor.
2. Copy one data row and paste it as a second line, changing only its
   `characters` value. Save.
3. Import the file.

Expected: no review screen opens. An error status reads "File reading error:
Each layer may appear only once, but these ids repeat: <the id>." The document
is unchanged.

## 3. Enter in the Find panel searches

1. Switch to **Find & Replace**, type a word that occurs on the page into
   **Find**, and press Enter while the cursor is still in the field.
2. Repeat with the cursor in **Replace with**.

Expected: both times the search runs exactly as clicking **Search** would, and
the panel does not reload or lose what was typed. With **Find** empty, Enter
does nothing.

## 4. The tabs work from the keyboard

1. Press Tab until focus lands on the **Extract** tab.
2. Press → (right arrow), then ←, then End, then Home.

Expected: each key switches the visible panel and moves the focus ring to the
tab it selected. Pressing Tab from a tab moves into the panel, not to the other
tab.

## 5. An in-progress status stays until it is answered

Needs a page large enough that a search takes more than three seconds (a few
thousand text layers; duplicate a frame of text repeatedly).

1. Search that page with **Current page** scope.

Expected: "Searching text layers..." stays visible for the whole wait and is
replaced by the results (or "No layers matched your search."). It must not
disappear after three seconds while the panel is still busy.
