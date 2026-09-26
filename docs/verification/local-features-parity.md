# Local features manual checks

What `docs/superpowers/specs/2026-09-26-local-features-design.md` added that only
a running plugin shows. Matching, file building, parsing and message rules are
unit tested.

Setup: `npm ci && npm run build`, import `manifest.json` into Figma desktop, and
use a scratch file with two pages, each with a few frames of text.

## Find & Replace

1. **Regex.** Find `(\w+)@(\w+)`, Replace `$2 at $1`, tick Regular expression,
   Search on a layer reading `ana@home`. Expected: the review shows
   `home at ana`. Then Find `(` with Regular expression ticked: an error reading
   "Invalid regular expression…" and no search.
2. **Highlights and occurrences.** Search a word that occurs twice in one layer.
   Both are highlighted. Click the second: it is struck through and the row's
   checkbox shows a dash. Replace, and in review only the first occurrence
   changes.
3. **Changed since search.** Repeat check 2, but before pressing Replace edit
   that layer on the canvas. Expected: the review lists it under "Cannot apply —
   text changed since the search".
4. **Select all.** With several result rows, untick Select all: Replace is
   disabled; tick it: every row returns.

## Scope

5. **All pages.** Choose All pages and search a word on the other page. The
   results include it; **Show** switches to that page and centres the layer.
6. **Hidden layers.** Hide a frame, untick Include hidden layers, extract: none
   of that frame's text is in the file. Tick it again: it is.

## Export

7. **Documents.** Extract, then download Excel, Word, Markdown and EPUB. Each
   opens in its app (Excel/Numbers, Word/Pages, a text editor, Apple Books or
   another reader) with text grouped under frame names.
8. **PDF.** Select two frames, Export frames as PDF: a ZIP with two PDFs.
   Select one: a single PDF. Select nothing: every top-level frame on the page.

## Snippets

9. Save a snippet, close and reopen the plugin: it is still listed. Select two
   text layers and Apply to selection: the review shows both. Add as layer:
   a new text layer appears in the middle of the view.

## Generate

10. **Data merge.** Make a frame with texts `Hello {{Name}}` and
    `{{Plan}} plan`, select it, and choose a CSV with columns Name, Plan and
    three rows. Expected: three copies beside the template, named after each
    Name, with the tags filled. A tag misspelled as `{{Nmae}}` stays as written
    and is listed in the status.
11. **Localized copies.** Extract a frame to CSV, add columns `ko` and `ja` with
    translations for some rows, select the frame, choose the file. Expected: two
    copies named `Frame — ko` and `Frame — ja` to its right, translated where a
    translation exists; the status counts the rest.
12. **Stop.** Start a data merge with a few hundred rows and press Stop. Expected:
    "Stopped. Nothing was changed." and no copies left on the canvas.
