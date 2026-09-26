# Copydesk fixture plugin (development only)

Builds pages with thousands of text layers and times the paths Copydesk runs
over them. Stage C0 of `docs/superpowers/specs/2026-09-26-large-documents-design.md`.
Never published; plain JavaScript, no build step.

## Run it

1. Figma desktop → **Plugins → Development → Import plugin from manifest…** →
   `tools/fixture/manifest.json`.
2. In a scratch file, run **Copydesk Fixture (dev only) → Create page with
   20,000 text layers**. Creating that many layers takes a while; a toast counts
   up. (1,000 and 5,000 are there for smaller runs.)
3. On the new page, run **Measure Copydesk paths on this page**. Keep the
   window open until it says *Done*, then copy the JSON from the text box.

While step 3 runs, note whether the canvas and the Figma UI keep responding —
that is the one thing the numbers cannot say.

Measuring writes every text layer back with its own text (to time apply), so
use the fixture page, not a real file.
