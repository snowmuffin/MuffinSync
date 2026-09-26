# Stage C manual checks

> **Superseded.** Before a release, run `tools/self-test` and
> `docs/verification/manual-checklist.md` instead. This document is kept as the
> record of what was checked for its phase; some steps describe behaviour that
> has since changed.

Large-document behaviour from `docs/superpowers/specs/2026-09-26-large-documents-design.md`
that only a running plugin shows. The slicing, stop, busy and paging rules are
unit tested; these check that Figma actually stays responsive.

Setup: `npm ci && npm run build`, import `manifest.json`, and also import the
fixture plugin (`tools/fixture/README.md`). In a scratch file run **Copydesk
Fixture → Create page with 20,000 text layers** and work on that page.

## 1. A search on a huge page keeps Figma responsive and counts up

1. Copydesk → **Find & Replace**, Find `Sign up`, scope **Current page**, Search.

Expected: the status reads "Searching text layers... N of 20,xxx" and N rises.
While it runs you can pan the canvas and the panel repaints. Results arrive
with a "Show 200 more" button at the bottom.

## 2. Stop ends a search and an extract with nothing produced

1. Start the search from check 1 and press **Stop** while it counts.
2. Repeat on the **Extract** tab with **Extract Text Layers**.

Expected: "Stopping..." then "Stopped. Nothing was changed." No results list,
no download buttons.

## 3. A second task cannot start while one runs

1. Start an extract; while it counts, switch to Find & Replace and press
   Search (and Enter in the Find field).

Expected: Search looks disabled and does nothing. The extract finishes normally.

## 4. Apply over thousands of rows reports progress and finishes

1. Search `Sign up`, replace with `Join`, **Replace N layers**, then **Apply**.

Expected: "Applying changes... N of M" counts up with no Stop button, then
"Updated M text layers." Spot-check a few layers on the canvas.

## 5. Paging keeps counts honest

1. In the review from check 4, before applying, untick **Select all**.

Expected: **Apply 0 changes** is disabled, even though only 200 rows are
rendered. Tick it again: the count returns to the full number.

## 6. Deleting a layer mid-search does not break it

1. Start a search on the fixture page and, while it counts, delete a frame on
   the canvas.

Expected: the search finishes; the deleted layers are simply absent.
