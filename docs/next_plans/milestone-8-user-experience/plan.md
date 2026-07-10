# Milestone 8: User-Experience Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the linter feel like a product a Kaggle user keeps enabled: instant results on open (ruff default), problems visible *at the line* in the editor, one-click muting of noisy codes, a glanceable count when the panel is tucked away, and a panel that stays where you put it.

**Architecture:** Task 1 is the overlay React rewrite **moved here from Milestone 6 Task 1** (see the note added there) so every feature in this milestone builds on the clean React overlay instead of extending the imperative-DOM pattern. Everything else layers on M7's plumbing: errors carry `uuid` + exact line, and the bridge/scroll machinery already exists.

**Tech Stack:** React 18, CSS, chrome.storage, chrome.action badge API.

**Fixes findings:** F11 (full, via Task 1) plus pure feature work (no F-ids — this milestone came out of the 2026-07-10 "think as a user" review, not the original findings). Depends on: Milestone 7. Runs before Milestones 4/5/6 in the recommended order (user-visible value first; M4/M5 are hygiene).

## Global Constraints

- Every task ends with `npm run type-check && npm run build && npm test` green (Git Bash, repo root).
- Settings storage **shape** stays `{ linterEngine, flake8IgnoreCodes, ruffIgnoreCodes }` — Tasks 2 and 4 change *values/defaults* only, never keys or types.
- New UI is React-state + CSS only; no new imperative style-writing (refs for drag geometry are fine — see Task 1).
- No new runtime dependencies.

---

### Task 1: React-pure Overlay (moved from M6 Task 1; F11 full)

Scope identical to `../milestone-6-ux-and-release/plan.md` Task 1 — executed here instead:

**Files:**
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx`, `packages/ui-components/src/Overlay/Overlay.css`

- [ ] **Step 1:** Replace the minimize/expand imperative block (direct `style.width/right/bottom/opacity` writes and nested setTimeouts in `handleToggleMinimize`) with the `kaggle-lint-minimized` class driven by `isMinimized` state; all geometry/opacity/transition rules move into `Overlay.css`.
- [ ] **Step 2:** Dragging stays ref-based (no re-render per mousemove) but writes `transform: translate(...)` on the root; reset position on minimize so the pill docks bottom-right.
- [ ] **Step 3:** Type the error props end-to-end: kill `onErrorClick?: (error: any)` and ContentApp's `errors: any[]` (F29) using core's `LintError` + the inline `cellIndex`/`cellLine`/`uuid`/`element` extensions (read `packages/ui-components/src/types/index.ts` for the current shape — M7 Task 2 added `uuid`).
- [ ] **Step 4: Verify** — build; manual: minimize/expand animates, drag works, click-to-scroll (M7 path) works.
- [ ] **Step 5: Commit** — `refactor(ui): overlay state and animation via React + CSS; typed error props`

---

### Task 2: Ruff as the default engine

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx` (`DEFAULT_SETTINGS`), `packages/extension/src/popup/PopupApp.tsx` (its default + engine labels)

- [ ] **Step 1:** Default `linterEngine: 'ruff'` in both DEFAULT_SETTINGS objects. Rationale: ruff-wasm initializes in milliseconds; flake8's first Pyodide load is ~30 s — a first-run user should see results before they wonder if the extension works. Users with saved settings are untouched (defaults only apply when `linterSettings` is absent).
- [ ] **Step 2:** Popup copy: label Ruff "(recommended — instant)" and Flake8 "(slower first load)". No shape change, no migration.
- [ ] **Step 3: Verify** — clear extension storage (fresh-profile or `chrome.storage.sync.clear()` from the popup's inspector), reload notebook: ruff runs, results well under 5 s.
- [ ] **Step 4: Commit** — `feat(extension): default new installs to the ruff engine`

---

### Task 3: In-editor line markers (the flagship)

**Files:**
- Create: `packages/extension/src/content/lineMarkers.ts`
- Modify: `packages/extension/src/content/ContentApp.tsx`, `packages/extension/public/content.css`

- [ ] **Step 1:** Approach (decided — don't re-litigate): content-script DOM tagging, **not** CM6 decorations. Injecting CodeMirror StateEffects from our bundle into the page's editor instances is a cross-instance trap, and `cmView` is unreachable on Kaggle's build regardless (see `pageExtractor.ts`'s doc comment). Instead: after each lint, for every error whose line is currently rendered, add a severity class (`kaggle-lint-line-error|warning|info`) and a `title="<code>: <msg>"` to the `.cm-line` element; styles in `content.css` (wavy underline or subtle background tint, both themes).
- [ ] **Step 2:** The hard part is line→element mapping under virtualization: in long cells, `.cm-line` children correspond to the *rendered viewport*, not document lines 1..N, so `children[line-1]` is wrong exactly where markers matter most. Probe live for a usable anchor (line-number gutter text within the same cell is the most promising isolated-world signal). If no reliable isolated-world mapping exists, extend the bridge (additive, M7 conventions) with a `LINE_GEOMETRY`-style request answered from the Jupyter editor API. Start with the cheapest path that survives a 200+ line cell test; record the chosen mechanism in `notes.md`.
- [ ] **Step 3:** Refresh markers on: lint completion, and a debounced scroll/mutation pass (virtualization mounts/unmounts lines; reuse the existing MutationObserver's debounce pattern, and make sure marker churn doesn't trigger the auto-relint observer — markers must not mutate anything the observer treats as an edit... note the observer only schedules when the mutated cell has focus, but verify).
- [ ] **Step 4:** Remove markers for errors that disappear on the next lint; full clear on overlay close/disable.
- [ ] **Step 5: Verify** — manual: markers on short cells; markers correct in a 200+ line cell at multiple scroll positions; editing clears/re-adds within ~1 s of the auto-relint; no relint storm from marker writes.
- [ ] **Step 6: Commit** — `feat(extension): in-editor severity markers on error lines`

---

### Task 4: One-click ignore from an error item

**Files:**
- Modify: `packages/ui-components/src/ErrorItem/ErrorItem.tsx`, `packages/ui-components/src/types/index.ts` (`onIgnoreCode?: (code: string) => void` threaded Overlay → ErrorList → ErrorItem), `packages/extension/src/content/ContentApp.tsx`

- [ ] **Step 1:** ErrorItem: a small mute button (visible on hover, `title="Ignore <code> everywhere"`), rendered only when `error.code` exists; clicking it calls `onIgnoreCode(error.code)` and does **not** trigger the row's scroll-to click.
- [ ] **Step 2:** ContentApp handler: append the code (deduped) to the active engine's ignore string, write the whole settings object back to `chrome.storage.sync` under `linterSettings` (same keys the popup writes), update local state, re-lint. The popup's ignore-codes input shows it next time it opens (it already reads storage on mount).
- [ ] **Step 3: Verify** — mute `E501`-class noise → those errors vanish and stay gone after reload; popup shows the code; deleting it from the popup brings the errors back.
- [ ] **Step 4: Commit** — `feat: one-click ignore of a violation code from the error list`

---

### Task 5: Glanceable status (minimized pill + toolbar badge)

**Files:**
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` + `Overlay.css` (minimized pill shows `❌ n  ⚠️ m`, worst-severity accent color), `packages/extension/src/content/ContentApp.tsx` (post lint stats), `packages/extension/src/background/index.ts` (badge)

- [ ] **Step 1:** Minimized state currently shows only the title — render the error/warning counts in the pill (they exist in `stats`), colored by worst severity present.
- [ ] **Step 2:** After each lint, content script sends `{ type: 'lintStats', errors: n, warnings: m }`; background sets `chrome.action.setBadgeText({ tabId, text })` (total count, empty string when 0) + `setBadgeBackgroundColor` (red if any error, else amber). Badge resets automatically on navigation (per-tab badge text does); verify, don't assume.
- [ ] **Step 3: Verify** — badge matches panel totals; clears on 0 errors; doesn't bleed across tabs.
- [ ] **Step 4: Commit** — `feat: error counts on minimized pill and toolbar badge`

---

### Task 6: Overlay state persistence

**Files:**
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (accept initial state + change callback), `packages/extension/src/content/ContentApp.tsx` (load/save)

- [ ] **Step 1:** Persist `{ position, isMinimized }` to `chrome.storage.local` (per-machine UI state — deliberately not `sync`, and deliberately **not** `visible`: a user who closed the panel should get it back on the next notebook, a persisted-closed overlay looks like a broken extension). Debounce writes (drag-end, not per-mousemove).
- [ ] **Step 2:** Restore on mount; clamp restored position into the viewport (window sizes change between sessions).
- [ ] **Step 3: Verify** — drag + minimize, reload page: position and minimized state survive; close, reload: panel visible again.
- [ ] **Step 4: Commit** — `feat(ui): remember overlay position and minimized state`

---

### Task 7: USER-GATE — manual verification

Fresh profile, unpacked install, real notebook:

- [ ] First open ever: ruff results appear in < 5 s with zero configuration.
- [ ] Error lines are marked in the editor; markers track scrolling in a 200+ line cell and update after edits.
- [ ] Mute a code from the list → gone, persists across reload, visible in popup.
- [ ] Minimize → pill shows counts; toolbar badge matches; both hit 0/blank on a clean notebook.
- [ ] Drag the panel somewhere, minimize, reload → same place, still minimized; close, reload → visible again.
- [ ] Switch to flake8 in popup → still works (loading message during first Pyodide load).

---

## Deferred (documented, not planned)

- **Grouping errors by cell / severity filter chips** — the list is already severity+position sorted with per-cell locations; add only if real notebooks feel unnavigable after Task 3's markers land (markers may make panel-grouping moot).
- **Quick-fixes / autofix (ruff `--fix`)** — would need write access to the notebook model via the bridge; a different risk class, own milestone if ever.
- **Settings migration UI for existing flake8-default users** — defaults only affect fresh installs; not worth a migration.
