# Manual checklist (UI only)

Before a release, run **`tools/self-test`** first (see its README) — it covers
everything that touches the document. This list is what it cannot reach:
Copydesk's own panel. About 20 minutes.

Setup: `npm ci && npm run build`, import `manifest.json`, open a scratch file
with a few frames of text on two pages.

## Panel and tabs
- [ ] The tab bar shows **Extract, Find, Check, Generate, Snippets** with no
      label cut off; clicking each shows its panel.
- [ ] With a tab focused, ←/→/Home/End move between tabs.
- [ ] With nothing selected, **Selection** is greyed out and **Current page** is
      chosen; selecting a frame makes Selection available again.
- [ ] Close and reopen the plugin: the last tab, scope and options come back.
- [ ] Each menu entry (Plugins → Copydesk → Extract & import / Find & replace /
      Check copy / Generate / Snippets) opens its tab.

## Extract and import
- [ ] Extract shows the counts line, and "By frame" when there are several frames.
- [ ] Each download button (CSV, JSON, Excel, Word, Markdown, EPUB) saves a file
      that opens in its app.
- [ ] **Copy JSON**, paste it somewhere, edit one text, copy it back, **Paste to
      import** → **Check what would change**: the review shows that one change.
- [ ] Import a file: the review lists before/after, Select all works, **Apply**
      writes, **Cancel** changes nothing.
- [ ] Export frames as PDF saves a PDF (one frame) or a ZIP (several).

## Find
- [ ] Type a query: Search enables; Enter in either field searches.
- [ ] Results highlight each match; clicking one strikes it through and the row
      checkbox shows a dash.
- [ ] Tick Regular expression and search `(`: an error, no search.
- [ ] **Show** centres the layer, switching page if it is on another one.

## Check, Generate, Snippets
- [ ] Rule checkboxes and the glossary form work; a glossary entry survives
      closing and reopening the plugin.
- [ ] Run check: findings are highlighted per layer; Fix goes to the review.
- [ ] Choosing a data file shows its rows and columns and a "Generate N copies"
      button; a translation file shows its languages.
- [ ] Save a snippet, reopen the plugin: it is still there.

## Long tasks
- [ ] On a big page (Self-Test → Performance, or `tools/fixture`), a search
      counts up in the status line, the canvas keeps responding, and **Stop**
      ends it with "Stopped. Nothing was changed."
- [ ] While a task runs, Extract / Import / Search / Run check look disabled.
