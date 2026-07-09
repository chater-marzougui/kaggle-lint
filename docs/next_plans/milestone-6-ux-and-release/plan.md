# Milestone 6: UX Polish & Release Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A releasable extension: overlay is idiomatic React, popup fails gracefully, docs are honest, the legacy folder is gone, and a tagged release ships a working zip.

**Architecture:** Final pass. Overlay drops its verbatim-ported DOM manipulation for React state + CSS transitions. Popup detects the content script by pinging it rather than sniffing URLs. `old-linter/` is deleted (M4 Task 2 removed the last build dependency — verify before deleting). README is rewritten against reality.

**Tech Stack:** React 18, CSS transitions, Chrome extension APIs, GitHub Actions release workflow.

**Fixes findings:** F11 (full), F12, F24, F25 (already gone in M2 — verify), F27, F28, F29, F30, F31 (documented decision). Depends on: Milestones 1–5.

## Global Constraints

- Every task ends with `npm run lint && npm run type-check && npm run build && npm test` green.
- No new dependencies.
- The standalone demo (`old-linter/test/linter-demo.html`) disappears with the folder; its replacement is out of scope — note it as a possible future milestone in the roadmap README when deleting.

---

### Task 1: React-pure Overlay (F11 full)

**Files:**
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx`, `packages/ui-components/src/Overlay/Overlay.css`

- [ ] **Step 1:** Replace the minimize/expand imperative block (`Overlay.tsx:135-176` — direct `style.width/right/bottom/opacity` writes and nested setTimeouts) with a `kaggle-lint-minimized` class toggled from the existing `isMinimized` state, and move all geometry/opacity/transition rules into `Overlay.css`.
- [ ] **Step 2:** Convert dragging to state-lite React: keep the mousemove math but write position into a `useRef`-held style application on the root via `transform: translate(…)`; reset position on minimize so the panel docks bottom-right (current UX). Dragging must not re-render per mousemove (perf) — ref-based style writes inside the existing listeners are fine; the point is removing *stateful* UI (visibility, size, minimize) from imperative code, not banning refs.
- [ ] **Step 3:** Type the error props: replace `onErrorClick?: (error: any)` and ContentApp's `errors: any[]` / `error: any` (F29) with the shared `NotebookError`-based types from core (M4 Task 4 exported them).
- [ ] **Step 4: Verify** — build; manual: minimize/expand animates, drag works, click-to-scroll works.
- [ ] **Step 5: Commit** — `refactor(ui): overlay state and animation via React + CSS; typed error props`

---

### Task 2: Debug logging gate (F27)

**Files:**
- Create: `packages/extension/src/utils/log.ts` (`export const debug = process.env.DEBUG === 'true' ? console.log.bind(console, '[Kaggle Linter]') : () => {};`)
- Modify: all `console.log` call sites in `packages/extension/src` and `packages/ui-components/src`; `KaggleDomParser.DEBUG` and `CodeMirrorManager.DEBUG` read the same flag; keep `console.error`/`console.warn` as-is.

- [ ] **Step 1:** Sweep: `grep -rn "console.log" packages/extension/src packages/ui-components/src` → route each through `debug(...)`. Webpack already defines `process.env.DEBUG` (`webpack.config.js:48`).
- [ ] **Step 2: Verify** — production build produces a console-quiet extension (spot-check on a notebook); `DEBUG=true npm run build` chatty.
- [ ] **Step 3: Commit** — `chore(extension): gate debug logging behind DEBUG flag`

---

### Task 3: Popup robustness (F12)

**Files:**
- Modify: `packages/extension/src/popup/PopupApp.tsx`

- [ ] **Step 1:** Replace URL sniffing with a ping: on mount, `chrome.tabs.sendMessage(tabId, { type: 'ping' })` — content script answers `{ pong: true }` (add the branch to ContentApp's message listener). No answer / `chrome.runtime.lastError` → show the existing "Not in Kaggle Notebook" panel (reword to "Open a Kaggle notebook in edit mode"). This is truthful on kaggle.com pages that aren't notebooks.
- [ ] **Step 2:** Wrap all three `sendMessage` call sites with a callback that checks `chrome.runtime.lastError` and, on failure, flips the popup into the not-connected panel instead of failing silently.
- [ ] **Step 3: Verify** — build; manual: popup on kaggle.com home shows the guidance panel; on a notebook edit page all buttons work.
- [ ] **Step 4: Commit** — `fix(popup): detect content script via ping; surface messaging failures`

---

### Task 4: Honest documentation (F24)

**Files:**
- Modify: `README.md`; Verify: `docs/architecture.md` still accurate after M1–M5 (update the flaw callouts that are now fixed)

- [ ] **Step 1:** README: remove links to the deleted `EXTENSION_USAGE.md`/`IMPLEMENTATION_SUMMARY.md`/`MIGRATION.md`; point "Additional Documentation" at `docs/`. Replace the false "21 unit tests / all rules tested" with the real numbers from M5 (count them). Update the standalone-demo section per Task 5's deletion. Fix Node version per M4. Describe the offscreen-document Flake8 architecture in the Architecture section (replace the in-page description).
- [ ] **Step 2:** Update `docs/architecture.md`: rewrite the sections that documented F1/F2/F3-era behavior (isolated-world diagram, "dead code" callouts) to describe the fixed system; keep `docs/review-findings.md` untouched as the historical record but add a one-line "resolved in M<n>" annotation per finding in its summary table.
- [ ] **Step 3: Commit** — `docs: truthful README and refreshed architecture doc`

---

### Task 5: Delete old-linter (F30)

**Files:**
- Delete: `old-linter/` (entire folder)

- [ ] **Step 1:** Preconditions — all must hold, else stop: `grep -rn "old-linter" packages/ turbo.json .github/ --include="*.{js,json,yml,ts,tsx}"` → only doc mentions; M4 Task 2 landed (popup.css moved); M2 landed (pageInjection.js logic ported).
- [ ] **Step 2:** `git rm -r old-linter` (this also removes the committed `.env`, F30). Add a "Standalone demo (future)" line to `docs/next_plans/README.md` noting the demo page went with it.
- [ ] **Step 3: Verify** — full pipeline green from a clean checkout: `npm ci && npm run lint && npm run type-check && npm run build && npm test`.
- [ ] **Step 4: Commit** — `chore: remove legacy old-linter implementation`

---

### Task 6: Release pipeline honesty + ship (F28)

**Files:**
- Modify: `.github/workflows/release.yml:37-68`

- [ ] **Step 1:** Replace the hardcoded release-notes heredoc with generated notes: `gh api` / `softprops/action-gh-release`'s `generate_release_notes: true` (drop `body_path`), keeping the installation instructions as a static prefix via `body`.
- [ ] **Step 2:** Bump version to `2.1.0` in the root `package.json` (single source per M4 Task 3; sync workspace package.json versions in the same commit).
- [ ] **Step 3:** Final manual gate (the full E2E from M1/M2/M3 verification tasks, condensed): fresh unpacked install → notebook edit page → built-in lint on load/edit/shortcut → Flake8 switch works offline → popup controls work → overlay drag/minimize/close.
- [ ] **Step 4:** Tag `v2.1.0`, push, confirm the release workflow publishes a zip; download the zip, load it unpacked, smoke-test once.
- [ ] **Step 5: Commit/tag** — `release: v2.1.0` (ask the user before pushing the tag — releasing is outward-facing).

---

## Deferred (documented, not planned)

- **F31 / Flake8 configuration UI** (ignore-codes list, severity mapping) — add only if users ask.
- **Standalone demo page** replacement after old-linter deletion.
- **Chrome Web Store publication** (listing assets, privacy policy) — separate effort with user involvement; the zip release covers sideloading.
