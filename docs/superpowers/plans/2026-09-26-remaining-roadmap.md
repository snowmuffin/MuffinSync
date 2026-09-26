# Remaining Work — Roadmap

**Date:** 2026-09-26
**Starts from:** `main` at `7b05019` — Phases 0–2 merged, 230 tests, no CI.
**Spec:** `docs/superpowers/specs/2026-09-19-copy-qa-design.md`
**Status snapshot:** `docs/status.md`

This is a roadmap, not a task-level plan. Each stage below gets its own detailed
plan in this directory (in the style of the Phase 0–2 plans) when it starts.

---

## Order

| Stage | Contents | Depends on | Size |
|---|---|---|---|
| **A** | Deferred cleanups from Phases 0–2 | — | Small, one branch |
| **R1** | First release of what exists (Phases 0–2 + A) | A, manual parity checks | Manual |
| **C** | Chunked traversal for large documents | — | Medium, own spec |

**Phase 3 (AI provider layer, Spell Check) is dropped** as of 2026-09-26 — see
the note at the top of the spec. The plugin stays offline:
`networkAccess.allowedDomains` remains `["none"]`.

**Constraint that replaces CI:** there is no CI any more. Every commit must
pass `npm run typecheck && npm test && npm run build` locally, and a release is
built from a clean `git pull && npm ci`.

---

## Stage A — Deferred cleanups

**Done 2026-09-26.** A1 removed the selector; A2 rejects the file. Results are
recorded in `docs/status.md` → *Resolved in Stage A*.

All items are listed in `docs/status.md` → *Known deferred items*. One branch,
one commit per item, each with a test where the item is testable.

| # | Item | Change | Needs a decision |
|---|---|---|---|
| A1 | Format selector is decorative | Either wire the CSV/JSON selector to a single download button, or delete the selector and keep the two buttons | **Yes** — wire or remove |
| A2 | Duplicate `id` rows in an import share a checkbox, last write wins | Reject the file at parse time, naming the duplicated ids (same treatment as a missing column) | **Yes** — reject, or keep the last row and say so |
| A3 | Enter does not submit Find | Wrap the Find form in a `<form>`; submit runs the same path as the Search button, respecting its disabled state | No |
| A4 | Tab bar has no ARIA | `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls`; arrow-key switching | No |
| A5 | `info` statuses auto-hide after 3 s even while work is running | In-progress statuses stay until replaced; only completion statuses auto-hide (`src/ui/status.tsx`) | No |
| A6 | Review remount key is `createdAt` (ms) | Key on a per-UI monotonically increasing counter assigned when a `change-set` arrives | No |
| A7 | `isOnCurrentPage` is untestable inside `navigate.ts` | Make it pure over `(node, page)`, move it next to `traverse.ts`, test it | No |
| A8 | `initTabs` / `initScope` add a listener per call | Make both idempotent (guard or remove-then-add) | No |

Left alone on purpose: `search-results.scope` stays transported-but-unread (the
status doc explains why).

**Done when:** all eight closed, `docs/status.md` updated, README/CHANGELOG
updated for A1–A5 (user-visible), 230+ tests passing.

---

## R1 — First release

Manual, by the maintainer:

1. Run `docs/verification/phase-{0,1,2}-parity.md` in Figma desktop and record
   results in `docs/status.md`. Any failure becomes a fix before release.
2. Bump `package.json`, move `[Unreleased]` in `CHANGELOG.md` to the version.
3. Decide the plugin name (spec §9) — or explicitly defer it again.
4. `git pull && npm ci && npm run typecheck && npm test && npm run build`,
   then publish from Figma desktop.

---

## Stage C — Chunked traversal

Spec §8 assigns this its own spec and plan cycle; this roadmap only schedules
it. `collectTextLayers` becomes async and yields between chunks, so a page with
thousands of layers does not freeze the panel. It changes the contract for
extract and search at once. Needs a generated test document with
thousands of text nodes.

---

## Decisions needed before starting

1. **A1** — format selector: wire it, or remove it?
2. **A2** — duplicate ids in an import: reject the file, or keep the last row?
