# Phase 2 manual parity checks

> **Superseded.** Before a release, run `tools/self-test` and
> `docs/verification/manual-checklist.md` instead. This document is kept as the
> record of what was checked for its phase; some steps describe behaviour that
> has since changed.

These checks exercise behavior that only exists inside the Figma desktop
app — the plugin sandbox (`figma.*`), a real document, and a real UI iframe.
None of them can run in CI or under vitest; run them by hand after
`npm run build` and before shipping a Phase 2 build.

Setup: `npm install && npm run build`, then import `manifest.json` into
Figma (**Plugins → Development → Import plugin from manifest…**). Open a
document with a frame containing several text layers, and at least one other
text layer outside that frame. For the checks below you will want:

- at least two text layers whose text contains a common word, e.g. "hello",
  with different surrounding text and different match counts (one layer with
  the word once, another with it twice).
- a layer whose text contains the word as part of a longer word, e.g.
  "helloworld", with no standalone occurrence of "hello" elsewhere in it.
- a layer whose text differs from another only in case, e.g. one layer reading
  "Hello there" and another reading "hello there".

## 1. Searching a term that appears in several layers lists each one with the right per-layer count, and the header totals match

1. Open the plugin, switch to the **Find & Replace** tab.
2. Type a word into **Find** that occurs in at least two layers, with
   different counts in each (e.g. once in one layer, twice in another). Leave
   **Replace with** empty or filled — either way the count check is the same.
3. Choose **Current page** as scope and click **Search**.

Expected: the results list shows one row per layer the word occurs in. Each
row's name is followed by its match count in parentheses, e.g.
`Body Text (2)`, and shows that layer's current text below the name. The
summary line above the rows reads `N matches in M layers`, where N is the sum
of every row's count and M is the number of rows (using the singular `match`
and `layer` when either is 1).

## 2. Searching with the replacement left empty offers no replace action, only Close

1. Clear **Replace with** so it is empty, keep **Find** filled with a term
   that matches at least one layer.
2. Click **Search**.

Expected: the results list shows the matching rows, each with its text and
count, but with no checkbox next to any row and no "Replace" button below the
list. The only button under the list is **Close**, and it is set off from the
last row by the same gap the **Replace** button gets when there is one — it
does not sit flush against the row above it. Clicking a row's **Show**
button still centres that layer in the viewport. Clicking **Close** returns to
the Find & Replace form without changing anything in the document.

## 3. Whole word on excludes a layer where the term appears only inside a longer word, and off includes it

1. Type a short word into **Find** that also appears as a substring of a
   longer word elsewhere in the document (e.g. "hello" as a whole word in one
   layer, and inside "helloworld" in another, with no other occurrence of
   "hello" in that second layer).
2. Check **Whole word**, choose **Current page**, and click **Search**.
3. Note the layers listed. Uncheck **Whole word** and search again with the
   same term and scope.

Expected: with **Whole word** checked, the layer containing only
"helloworld" does not appear in the results (its count would be zero if it
has no other occurrence). With **Whole word** unchecked, that layer appears,
with a count for the substring match inside "helloworld".

## 4. Case sensitive on excludes a layer differing only in case, and off includes it

1. Type a term into **Find** matching the case used in one layer but not the
   case used in another (e.g. "Hello" where one layer reads "Hello there" and
   another reads "hello there").
2. Check **Case sensitive**, choose **Current page**, and click **Search**.
3. Note the layers listed. Uncheck **Case sensitive** and search again with
   the same term and scope.

Expected: with **Case sensitive** checked, only the layer matching the exact
case appears. With **Case sensitive** unchecked, both layers appear.

## 5. Replacing from the results list opens review with the same layers, and applying changes exactly those

1. Fill **Find** and **Replace with**, choose **Current page**, and click
   **Search** so at least two layers appear in the results.
2. Leave every row checked and click **Replace N layers**.
3. In the review screen, note the layer names listed, then click **Apply**.

Expected: the review screen lists exactly the layers that were checked in the
results list (same layer names), each showing its before/after text with the
replacement applied. After clicking **Apply**, those layers' text in the
Figma document reflects the replacement, and no other layer's text has
changed.

## 6. Unchecking a row in the results list keeps that layer out of the review entirely

1. Repeat the search from check 5 so at least two layers appear in the
   results.
2. Uncheck one row's checkbox, leaving at least one other checked, then click
   **Replace N layers** (N should reflect only the checked rows).

Expected: the review screen does not list the unchecked layer at all — not as
a change, not as blocked, and it is not counted in the review's totals. Only
the layers that were checked in the results list appear in the review.

## 7. A layer whose text already equals the replacement is counted as unchanged rather than listed

Fixture: one text layer whose text is exactly `Hello there`, and nothing else
selected.

1. On the **Find & Replace** tab, choose **Current page** as scope and check
   **Case sensitive**.[^case]
2. Type `Hello` into **Find** and `Hello` into **Replace with**, then click
   **Search**.
3. The results list shows the layer with one match. Leave its row checked and
   click **Replace 1 layer**.

Expected: the review screen lists no change rows at all. Its instruction line
reads `No changes to apply (1 unchanged)`, **Apply** is disabled, and
**Cancel** is the only way out. Clicking **Cancel** closes the review and the
status banner reads "Review cancelled. Nothing was changed." — it names the
screen, not a producer, because no import was run here.

4. Repeat steps 2–3 with **Replace with** set to `Howdy` instead.

Expected: the same layer now produces one normal change row, reading
`− Hello there` and `+ Howdy there`. That contrast is the point: "unchanged"
is decided by the text replacing would produce, not by the layer.

[^case]: Without **Case sensitive**, a match differing in case from the query
    (e.g. a layer reading `hello there`) would be rewritten with the query's
    casing and so count as a change — which is correct behaviour, but it is
    not what this check is about.

## 8. Deleting a matched layer after searching but before replacing shows it under "Cannot apply"

1. Search for a term that matches at least two layers.
2. Without closing the results list, go to the Figma canvas and delete one of
   the matched layers.
3. Back in the plugin, leave all rows checked (including the deleted one) and
   click **Replace N layers**.

Expected: the review screen lists the deleted layer under a "Cannot apply"
section with the reason "layer no longer exists", using the name it had at
search time. That row has no checkbox. The other, still-existing layer
appears as a normal change row. Clicking **Apply** updates only the row that
still exists; the deleted layer is not reported as an error since it was
already excluded before applying.

## 9. The jump action centres the right layer from both the results list and the review, and does not change the selection

1. Search for a term matching a layer that is off-screen or zoomed away from
   in the current viewport. Before clicking anything, note (or clear) the
   current canvas selection.
2. Click that row's **Show** button in the results list.
3. Repeat: run a replace so the review screen opens with that layer listed,
   and click its **Show** button there too.

Expected: each click recentres and zooms the viewport on that exact layer.
In both cases, the canvas selection is exactly what it was before clicking
**Show** — clicking it does not select the layer, only navigates the view to
it.

## 10. With Selection scope and a frame selected, searching finds only that frame's layers

1. In the Figma canvas, select one frame that contains a text layer matching
   your search term, while another matching layer exists outside that frame.
2. In the plugin's Find & Replace tab, choose **Selection** as scope (it
   should be enabled since something is selected) and search for the term.

Expected: the results list contains only the layer(s) inside the selected
frame. The layer outside the frame, even though its text matches, does not
appear.

## 11. Selecting something else while a selection-scoped review is open closes the review with a message, and an import review is left alone by the same action

1. With a frame selected, search with **Selection** scope, and replace to
   open the review screen.
2. Without applying or cancelling, click a different layer or frame on the
   canvas so the selection changes.

Expected: the review screen closes on its own, and the status banner reads
"Review closed: the selection changed. Search again." Nothing in the document
was changed.

3. Now extract and import a file to open an import-based review screen (see
   `docs/verification/phase-1-parity.md`, check 1), or search with **Current
   page** scope and replace to open a page-scoped review.
4. While that review is open, change the canvas selection the same way.

Expected: the review screen stays open and unaffected — an import review has
no associated scope, and a page-scoped review is not selection-scoped, so
neither is invalidated by a selection change.

## 12. Switching tabs preserves each tab's text and matching options; the scope choice is shared

The Find & Replace panel keeps its own **Find**/**Replace with** text and its
own checkboxes.
The scope choice (**Selection** / **Current page**) is not per-tab — by
design, per spec 3.1, it is one choice with two visible copies, one in each
panel — so switching tabs never resets it, and changing it in either panel is
expected to change what the other panel shows too.

1. On the **Extract** tab, choose a non-default format (e.g. click **JSON**).
   Note the scope currently selected (**Selection** or **Current page**).
2. Switch to the **Find & Replace** tab, type something into **Find** and
   **Replace with**, check one of the option checkboxes (**Case sensitive** or
   **Whole word**), and choose the scope option *different* from the one
   noted in step 1.
3. Switch back to the **Extract** tab.

Expected: the **Extract** tab still shows the format you chose in step 1, and
its scope selector now shows the **same** scope you picked on the Find &
Replace tab in step 2 — not the one you started with. This is the intended
result of the two panels sharing one scope: they are two views of a single
choice, and picking a scope in either one is picking it for both.

4. Switch to **Find & Replace** again.

Expected: **Find**, **Replace with**, and both checkboxes still hold what you
entered in step 2 — text and matching options are per-tab and were never
touched by switching away and back.
