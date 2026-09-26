# Remaining Work — Roadmap

**Date:** 2026-09-26
**Starts from:** `main` at `7b05019` — Phases 0–2 merged, 232 tests, no CI.
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
| **B** | Phase 3: AI provider layer and Spell Check | B0 spike passing | Large |
| **C** | Chunked traversal for large documents | — | Medium, own spec |
| **R2** | Release with Spell Check | B, C | Manual |

Rationale for releasing before Phase 3: everything in Phases 0–2 is useful
without an API key, and Phase 3 adds the first network access and the first
third-party data flow. Shipping them separately means a problem found in
review of the AI feature does not hold back the rest.

**Constraint that replaces CI:** there is no CI any more. Every commit must
pass `npm run typecheck && npm test && npm run build` locally, and a release is
built from a clean `git pull && npm ci`.

---

## Stage A — Deferred cleanups

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
updated for A1–A5 (user-visible), 232+ tests passing.

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

## Stage B — Phase 3: AI provider layer and Spell Check

Spec §4 and §7. Built in this order; each step is independently mergeable.

### B0 — Network spike (gate for everything else)

The spec leaves one thing unverified: whether Figma's runtime lets the UI iframe
reach the provider once `manifest.json` allows it.

- Add the provider domain to `networkAccess.allowedDomains` (with the
  `reasoning` field Figma asks for when domains are listed).
- A throwaway button that sends one minimal request with a test key and shows
  status + response.
- **Run it in Figma desktop.** Pass = a 200 from the provider. This needs the
  maintainer; it cannot be checked from here.

If it fails, stop: Phase 3's design depends on browser-direct calls.

### B1 — Settings storage

- `src/main/storage.ts`: thin `figma.clientStorage` wrapper (not unit tested,
  per spec §6).
- Messages: `get-settings`, `set-settings`, `settings` — validated with accept
  and reject tests like every other variant.
- Stored: provider, API key, model. The key is never logged, never included in
  a status message, never sent anywhere but the chosen provider.

### B2 — Provider layer

- `src/ui/ai/provider.ts`: the `AiProvider` interface from spec §4.1.
- `src/ui/ai/anthropic.ts`: the adapter, using `@anthropic-ai/sdk` with
  `dangerouslyAllowBrowser: true` (the plugin is the user's own client holding
  the user's own key — the case that option exists for).
  - Structured output via `output_config.format` (JSON schema), so the
    response shape is enforced by the API, and still validated on arrival.
  - Typed SDK errors mapped to user-facing reasons: bad key (401), rate limit
    (429), provider down (5xx), network blocked.
- `src/ui/ai/parse.ts`: response → `Suggestion[]`. Pure, tested against
  malformed responses (spec §6).
- **Default model: `claude-opus-5`**, the current general default. Spell
  checking short strings is a cheap task; the settings screen lets the user
  pick a cheaper model (`claude-haiku-4-5`, `claude-sonnet-5`). **Open:**
  whether the default should be the cheap one — the user pays.

### B3 — Batching and cost estimate

- Chunk layer texts into requests of bounded size.
- Before any spend, show an estimate: input tokens from
  `messages.countTokens`, output bounded by `max_tokens`, priced from a small
  per-model table in the code. The user confirms before the run starts
  (spec §4.4).

### B4 — The Spell Check producer

- `Suggestion` = `{ nodeId, original, corrected, reason }`. `original` is the
  text the model saw.
- New message `plan-spellcheck` carries the chosen suggestions; the sandbox
  builds the set with the existing `buildChangeSet`:
  `after: (current) => current === original ? corrected : current`.
  A layer edited since the check therefore lands in `unchangedCount` instead
  of having newer text overwritten — the same guarantee apply already gives.
- Review screen: render `ProposedChange.reason` under the before/after lines
  (the field exists; nothing displays it yet).

### B5 — UI

- Settings screen: provider, key (masked), model, and the disclosure from
  spec §4.5 at the point of entry.
- Spell Check tab: **hidden entirely with no key**; visible with an error when
  the key exists but a call fails (spec §4.4).
- Flow: scope → estimate → confirm → progress → suggestions → review.

### B6 — Docs and verification

- `docs/verification/phase-3-parity.md`: key save/clear, tab hidden without
  key, disclosure visible, estimate shown before spend, a failing key reported,
  a layer edited during the check not overwritten, every other tab unaffected
  with the network blocked.
- README, CHANGELOG, `docs/status.md`.

**Scope decision — OpenAI.** The spec names Anthropic and OpenAI. Recommend
shipping Anthropic only in Phase 3 and adding OpenAI behind the same interface
later if asked for: one adapter halves the error-mapping and verification
surface, and the spec's only open question (default provider when both keys
exist) disappears. **Needs a decision.**

**Done when:** spec §7's Phase 3 row holds — spell check suggestions reach the
document only through review, and the `networkAccess` behaviour is verified in
Figma.

---

## Stage C — Chunked traversal

Spec §8 assigns this its own spec and plan cycle; this roadmap only schedules
it. `collectTextLayers` becomes async and yields between chunks, so a page with
thousands of layers does not freeze the panel. It changes the contract for
extract, search, and spell check at once, which is why it follows B rather
than sitting in the middle of it. Needs a generated test document with
thousands of text nodes.

---

## R2 — Release with Spell Check

As R1, plus `phase-3-parity.md`, and a note in the Community listing that
Spell Check is optional and sends text to the chosen provider.

---

## Decisions needed before starting

1. **A1** — format selector: wire it, or remove it?
2. **A2** — duplicate ids in an import: reject the file, or keep the last row?
3. **B2** — default model: `claude-opus-5` (quality) or `claude-haiku-4-5` (cost)?
4. **B** — Anthropic only for Phase 3, or Anthropic and OpenAI as the spec says?
5. **R1** — release Phases 0–2 before Phase 3, or ship everything together?
