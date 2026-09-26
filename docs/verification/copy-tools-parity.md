# Copy tools manual checks

What `docs/superpowers/specs/2026-09-26-copy-tools-design.md` (1.3.0) added that
only a running plugin shows. Rules, parsing, path matching, settings parsing and
messages are unit tested.

Setup: `npm ci && npm run build`, import `manifest.json` into Figma desktop.

## Settings and menu

1. Switch to Find, choose All pages, untick Include hidden layers, tick Case
   sensitive, close the plugin and reopen it with **Open Copydesk**. Expected:
   it opens on Find with those choices.
2. With nothing selected, choose Selection, close and reopen. Expected: Current
   page is chosen (Selection is not available).
3. Run each menu entry — Extract & import, Find & replace, Check copy, Generate,
   Snippets. Expected: each opens on its tab, whatever was remembered.

## Clipboard and statistics

4. Extract a few frames. Expected: a line with layers, words and characters,
   and a "By frame" table when there are several frames.
5. **Copy JSON**, paste into a chat or editor, change a text, copy it back,
   **Paste to import**, **Check what would change**. Expected: the review shows
   that one change. If the copy is refused, the status says so.

## Context columns and path matching

6. Tick Add context columns and download CSV. Expected: `path` and `length`
   columns after `characters`.
7. Duplicate the file (File → Duplicate). In the copy, import the CSV from
   check 6 with one text changed. Expected: the row is found, marked
   "matched by path" in review, and applies. A layer whose path is shared by
   several layers (e.g. many layers named `Text` in one frame) is listed as
   "several layers share its path".

## Check

8. Make layers reading `Sign  up`, ` Hello `, `Wait , what`, `the the end`,
   `Lorem ipsum`, and an empty text layer. Run check on the page. Expected: each
   is listed with the issue highlighted; Lorem ipsum and the empty layer have no
   checkbox. Fix, and the review shows the fixed texts.
9. Add a glossary entry `log in → sign in`, and a layer `Log in now`. Run check.
   Expected: a glossary finding; fixing gives `Sign in now`.
10. Close and reopen the file as another collaborator (or reopen the plugin in
    another session). Expected: the glossary is still there. In a view-only
    file, saving the glossary reports that it is read-only.
11. Export the glossary as CSV, delete the entries, import the CSV. Expected:
    the entries come back.
