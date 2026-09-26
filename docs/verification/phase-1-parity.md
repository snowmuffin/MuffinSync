# Phase 1 manual parity checks

> **Superseded.** Before a release, run `tools/self-test` and
> `docs/verification/manual-checklist.md` instead. This document is kept as the
> record of what was checked for its phase; some steps describe behaviour that
> has since changed.

These checks exercise behavior that only exists inside the Figma desktop
app — the plugin sandbox (`figma.*`), a real document, and a real UI iframe.
None of them can run in CI or under vitest; run them by hand after
`npm run build` and before shipping a Phase 1 build.

Setup: `npm install && npm run build`, then import `manifest.json` into
Figma (**Plugins → Development → Import plugin from manifest…**). Open a
document with at least one frame containing more than one text layer, and at
least one other text layer outside any frame.

## 1. Importing an edited file shows the review with the right counts and only the edited rows listed

1. Extract a file with several rows (**Current page**, either format).
2. Edit the file: change the `characters` value of two or three rows, and
   leave the rest untouched.
3. Import the file (**Select File to Import**).

Expected: the main screen is replaced by a "Review changes" screen before
anything is written to the document. Only the rows you edited appear as
individual rows, each separated from the one above by a horizontal rule and
showing a before line (prefixed `−`, in red) and an after line (prefixed `+`,
in green) in a monospace face, with the layer name in bold above them. The
instruction line above the list reads `N of T layers changed` where N is the
number of edited rows and T is the total row count in the file. `M unchanged`
reads on the right of the toolbar row, on the same line as the **Select all**
checkbox and greyed, where M is the count of rows whose text you left alone —
those rows are never listed individually.

## 2. Unchecking a row leaves that layer untouched while the others apply

1. Repeat the import from check 1, so the review screen shows at least two
   changed rows.
2. Uncheck the checkbox on one of the changed rows, leaving the rest checked.
3. Click **Apply**.

Expected: the button label before clicking reads `Apply N changes`, where N
excludes the row you unchecked (`Apply 1 change` when one row is left). After
clicking, the review screen closes, the status banner says it is applying,
and then reports the smaller count as updated. In Figma, the unchecked
layer's text is unchanged from before the import; the still-checked layers
show their new text.

## 3. Cancelling applies nothing

1. Import a file with at least one changed row so the review screen opens.
2. Click **Cancel** instead of **Apply**.

Expected: the review screen closes, the status banner reads something like
"Review cancelled. Nothing was changed.", and every text layer in the
document is exactly as it was before you chose the file — including the rows
that were checked when you cancelled.

## 4. A file with an id that no longer exists shows it under "Cannot apply" before applying, and the rest still apply

1. Extract a file with several rows.
2. Edit the file: change one row's `id` to a value that does not correspond
   to any node in the document (e.g. append `999` to it). Change that row's
   `characters` value too, so you can visually confirm it did not apply.
   Change the `characters` value of one or two other rows normally.
3. Import the file.

Expected: before you click Apply, the review screen shows a "Cannot apply"
section listing the row with the bad id, with the reason "layer no longer
exists". That row has no checkbox and cannot be selected. Click **Apply**:
the other, valid rows update normally, and the status banner's updated count
does not include the unresolvable row. The layer that the bad id would have
pointed at (if any) is unaffected, and no error is reported for it after
applying — it was already excluded before applying.

To exercise the other "Cannot apply" reason, repeat with a row whose `id`
belongs to a real node that is not a text layer (e.g. a frame or rectangle
id) instead of a nonexistent id: the review screen should list that row under
"Cannot apply" with the reason "layer is no longer a text layer".

## 5. Importing an unmodified file says there is nothing to apply

1. Extract a file.
2. Without editing it, import that same file back.

Expected: the review screen opens showing `No changes to apply (N unchanged)`
where N is the row count, no individual changed rows, and no "Cannot apply"
section (assuming no ids were altered). The Apply button is disabled (there
is nothing selected to apply). Clicking Cancel closes the review with no
changes to the document; there is no way to apply anything because there is
nothing to select.

## 6. Selecting a frame and choosing Selection extracts only that frame; choosing Current page extracts the page

1. In the Figma canvas, select one frame that contains text layers (and make
   sure other text layers exist outside that frame).
2. In the plugin, the scope control should show **Selection** already
   chosen. Click **Extract Text Layers**.
3. Open the downloaded file: only the text layers inside the selected frame
   should appear.
4. With the same frame still selected, click **Current page** in the scope
   control, then click **Extract Text Layers** again.
5. Open the second downloaded file.

Expected: the file from step 3 contains only rows for text layers inside the
selected frame. The file from step 5 contains rows for every text layer on
the page, including ones inside the frame and ones outside it.

## 7. Deselecting everything disables the Selection option

1. With a frame or layer selected, confirm the **Selection** option in the
   scope control is enabled and selectable.
2. Click on empty canvas (or press Escape) so nothing is selected.

Expected: the **Selection** option becomes visually disabled and cannot be
clicked. If **Selection** was the chosen option, the control's chosen option
switches to **Current page** on its own. Clicking **Extract Text Layers** now
extracts the whole page. Selecting something again re-enables **Selection**,
but does not by itself change which option is currently chosen.

## 8. Opening the plugin with nothing selected starts on Current page

1. Click on empty canvas (or press Escape) so that nothing is selected.
2. Open the plugin — a cold open, not a reload of an already-open panel.
3. Look at the scope control **without clicking anything**.

Expected: **Selection** is disabled and **Current page** is the chosen
option, from the first frame the panel is visible. It must not show
**Selection** as chosen and only correct itself once you click on the canvas:
that state would send `scope: 'selection'` on Extract, which resolves to the
whole page anyway, and the file would not match what the control said.

Repeat with something selected: **Selection** is enabled and chosen.

## 9. A layer edited during the review is not overwritten

1. Import an edited file so the review screen opens with at least two changed
   rows, and note the layer name on one of them.
2. Leave the review open. In the Figma canvas, edit that layer's text by hand
   to something different from both its before and its after text.
3. Return to the plugin panel, leave every row checked, and click **Apply**.

Expected: the layer you edited by hand keeps the text you typed — it is not
replaced by the file's version. The status banner reports one error naming
that layer and saying it changed since review, and the other rows apply
normally.
