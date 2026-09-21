# Phase 0 manual parity checks

These checks exercise behavior that only exists inside the Figma desktop
app — the plugin sandbox (`figma.*`), a real document, and a real UI iframe.
None of them can run in CI or under vitest; run them by hand after
`npm run build` and before shipping a Phase 0 build.

Setup: `npm install && npm run build`, then import `manifest.json` into
Figma (**Plugins → Development → Import plugin from manifest…**). Open a
document with at least one frame containing more than one text layer, and at
least one other text layer outside any frame.

## 1. Extract downloads a named file, both formats

1. Open the plugin. Leave the format selector on **CSV** (the default).
2. Click **Extract Text Layers**.
3. Repeat with **JSON** selected.

Expected: each click downloads one file. The CSV file is named
`figma-text-layers-<epoch-ms>.csv` and the JSON file
`figma-text-layers-<epoch-ms>.json`, where `<epoch-ms>` is the download time
in milliseconds since epoch (e.g. `figma-text-layers-1758266400000.csv`).

## 2. Leading whitespace in `characters` survives a round trip

1. Extract as CSV.
2. Open the file and change one row's `characters` value to a string with
   **leading spaces**, e.g. `"   Hello there"` (keep the value quoted, or add
   quotes if your editor stripped them).
3. Save, then import the file back (**Select File to Import**).

Expected: the status banner reports the correct updated count for the file
(e.g. `Updated N text layers.`). In Figma, the corresponding text layer's
content now begins with the leading spaces exactly as typed — they are not
trimmed away.

This is the round-trip fix from the CSV work reaching the user: a field that
arrives quoted is preserved verbatim on import, whitespace included.

## 3. Selecting a single frame scopes extraction to it

1. In the Figma canvas, select one frame that contains text layers (and make
   sure other text layers exist outside that frame).
2. Click **Extract Text Layers**.
3. Open the downloaded file.

Expected: only the text layers inside the selected frame appear in the
file — no rows from layers outside it.

## 4. Selecting nothing searches the whole page

1. Click on empty canvas so nothing is selected (or press Escape).
2. Click **Extract Text Layers**.
3. Open the downloaded file.

Expected: every text layer on the current page appears, including ones that
were inside the frame used in check 3 and ones outside it.

## 5. A missing layer id is reported without blocking the rest of the batch

1. Extract a file with several rows.
2. Edit the file: change one row's `id` to a value that does not correspond
   to any node in the document (e.g. append `999` to it), and change that
   row's `characters` value so you can visually confirm whether it applied.
   Leave the other rows alone, and change their `characters` values too so
   you can confirm they applied.
3. Import the file.

Expected: the status banner reports one error (e.g.
`Updated N text layers. (1 errors)`) with a detail line naming the bad id,
such as `No layer found with id <id> (<name>).`. All other rows still update
their layers in Figma — one bad row does not stop or roll back the batch.

## 6. Multiple bad rows: message format and error list layout

1. Repeat check 5 but corrupt several rows in different ways — e.g. one with
   a nonexistent id, one pointing at a non-text layer's id if available.
2. Import the file.

Expected: the status message reads exactly
`Updated N text layers. (M errors)` (N = successful updates, M = failed
rows), with the error banner colored as an error. Beneath the message, each
error appears on its own line — the detail lines are separate elements, not
text appended to the status string, so the first error line is never glued
onto `(M errors)` on the same line.

## 7. Transient vs. persistent status

1. Click **Extract Text Layers** and immediately watch the status banner.
2. Separately, trigger an error status (e.g. import a non-CSV/JSON file, or
   run check 5 above to get an error status).

Expected: the info status shown during extraction (`Extracting text
layers...`) disappears on its own after about three seconds. An error (or
success) status does not auto-hide — it remains on screen until the next
status replaces it.
