# Copydesk Self-Test (development only)

Runs Copydesk's **real sandbox code** — the same `createHandler` the plugin uses
(`src/main/handler.ts`) — against a real Figma document, with the same messages
Copydesk's UI sends. It checks both the answers and what happened to the
document, then removes everything it made. Never published.

It covers what unit tests cannot reach: the Figma API itself — walking pages,
hidden layers and instances, loading fonts (mixed fonts too), writing text,
cloning frames, exporting PDF, switching pages, `clientStorage` and plugin data.
What it cannot reach is Copydesk's UI (another plugin can't drive it); that part
is `docs/verification/manual-checklist.md`.

## Run it

```bash
npm ci
npm run build:self-test      # writes tools/self-test/dist/code.js
```

1. Figma desktop → **Plugins → Development → Import plugin from manifest…** →
   `tools/self-test/manifest.json` (once).
2. Open any file you can edit — a scratch file is best — and run **Copydesk
   Self-Test (dev only)**.
3. Press **Run tests**. It adds one temporary page ("Copydesk self-test") and a
   temporary frame far off-canvas on the page you started from, runs 24 tests,
   and removes both. Takes about a minute.

   Figma's Starter plan allows **3 pages per file**, so the file needs room for
   one more page — a new file is simplest.
4. Every line should read ✓. If any read ✗, copy the report from the text box
   at the bottom and send it along.

**Performance (5,000 layers)** builds a 5,000-layer page, times extract, search
and check through Copydesk's handler, and removes it. It reports timings rather
than pass/fail; watch whether the canvas keeps responding while it runs.

## Run it from a terminal (or Claude Code)

With the Self-Test window open in Figma desktop, a terminal can start the run
and read the result, so nobody has to press the button or copy the report:

```bash
npm run self-test:remote            # the 24 tests
npm run self-test:remote -- perf    # the 5,000-layer timing run
```

The window polls `http://localhost:3847` (its status line reads **Remote:
connected** while the command waits). The command prints each ✓/✗ line and the
summary as they arrive, then exits:

| Exit | Meaning |
| ---- | ------- |
| 0 | every test passed |
| 1 | at least one test failed — the lines above say which |
| 2 | no window connected, or no report before the timeout (`--timeout N` seconds; default 300, perf 900) |

- The first time, Figma may ask to allow the plugin to reach **local network**
  devices. Allow it, or the window never connects.
- The window loads its code once. After `npm run build:self-test`, close and
  reopen the window; the command warns when Figma ran an older build.
- Only the development build can reach localhost (`devAllowedDomains`); the
  self-test is never published anyway.

## What it leaves untouched

Your Copydesk settings, snippets and the file's glossary are saved before the
run and restored after it, and your current page and selection are put back.
The test pages are removed even when a test fails.

## Rebuild after changing Copydesk

The bundle compiles `src/main` and `src/shared` from the working tree, so run
`npm run build:self-test` again after pulling or editing them. `npm run
typecheck` checks the self-test too.
