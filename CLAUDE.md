# Copydesk — notes for Claude Code

Figma plugin. Sandbox code is in `src/main`, the UI in `src/ui`, and the
messages between them in `src/shared/messages.ts`.

## Checks

```bash
npm run typecheck   # main, ui and the self-test
npm test            # vitest
npm run build       # dist/ for the plugin
```

## Testing against real Figma

Unit tests can't reach the Figma API. `tools/self-test` is a dev-only plugin
that drives the real handler in a real file (see its README). Once the user has
the **Copydesk Self-Test (dev only)** window open in Figma desktop, you can run
it yourself:

```bash
npm run build:self-test                        # after changing src/main or src/shared
npm run self-test:remote                       # exit 0 pass, 1 failed, 2 no window/timeout
```

- After a rebuild, ask the user to close and reopen the Self-Test window. The
  command prints a WARNING when Figma ran an older build; rerun after reopening.
- Exit 2 with "No Self-Test window connected": ask the user to open the window
  (and allow local network access if Figma asks). Don't retry in a loop.
- The self-test cannot drive Copydesk's UI. For UI changes, point the user to
  `docs/verification/manual-checklist.md`.
