# Milestone 7: Single-Frame Mount & Precise Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exactly one overlay, mounted in the frame that actually hosts the notebook; clicking an error lands on the exact line even in long/virtualized cells; deleting a cell removes its errors on the next lint.

**Architecture:** All three fixes ride infrastructure M2 already built. F32 is a runtime mount gate in `content/index.tsx` (the manifest can't express "the frame with the notebook in it"). F33 and F34 extend the MAIN-world bridge (`bridgeProtocol.ts` / `pageExtractor.ts`) — the same `window.jupyterapp` object that made extraction reliable also owns virtualization-aware scrolling and the authoritative cell list. Live-probing the Jupyter API shapes on a real notebook is expected and has precedent (M2's `jupyterapp` discovery, recorded in `milestone-2-reliable-code-extraction/notes.md`); record what you find in this milestone's `notes.md`.

**Tech Stack:** Chrome MV3 content scripts, window.postMessage bridge, JupyterLab 4 widget/editor APIs, React 18.

**Fixes findings:** F32, F33, F34 (see the second addendum in `../../review-findings.md`). Depends on: nothing outstanding — M1–M3 and the lint-engine-consolidation project are merged; this runs before M4/M5/M6/M8.

## Global Constraints

- Every task ends with `npm run type-check && npm run build && npm test` green from repo root (Git Bash).
- Settings storage shape (`{ linterEngine, flake8IgnoreCodes, ruffIgnoreCodes }` under `linterSettings`) stays untouched.
- Bridge protocol changes are additive only (new message types / new optional fields) — an updated content script against a stale-cached page script must degrade to current behavior, not break.
- No DOM elements or page expandos cross the postMessage/runtime boundary — plain JSON only.

---

### Task 1: Mount only in the notebook frame (F32)

**Files:**
- Modify: `packages/extension/src/content/index.tsx`

- [ ] **Step 1:** Replace the unconditional `init()` with a gate: mount only once `.jp-Notebook` exists in *this frame's* DOM. Initial check first; if absent, a `MutationObserver` on `document.documentElement` (childList+subtree) waits for it, and disconnects after mounting. No timeout-then-mount-anyway — a frame where the notebook never appears (the outer kaggle.com shell, and the CDN match until M4 Task 1 deletes it) must never mount: no overlay, no keydown listeners, no chrome.runtime message listener.
- [ ] **Step 2:** Keep the existing `#kaggle-linter-root` re-entry guard (covers double injection *within* a frame). Keep manifest matches as-is — the notebook lives in the `kkb-production.jupyter-proxy.kaggle.net` iframe today, but the outer-page match stays harmless-by-construction if Kaggle ever inlines the notebook.
- [ ] **Step 3:** Record two intentional behavior notes in `notes.md`: (a) popup `chrome.tabs.sendMessage` broadcasts to all frames — after this change exactly one frame answers, which is what M6 Task 3's ping design assumes; (b) Ctrl+Shift+L/H now only fire with focus inside the notebook iframe — which is where typing happens anyway.
- [ ] **Step 4: Verify** — build; on a live notebook, DevTools console per frame: `document.querySelectorAll('#kaggle-linter-root').length` → 1 in the notebook iframe, 0 in the top frame. (If no browser, hand this to the user with Task 5's gate.)
- [ ] **Step 5: Commit** — `fix(extension): mount only in the frame that hosts the notebook (F32)`

---

### Task 2: Errors carry the cell uuid

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx`, `packages/ui-components/src/types/index.ts`

- [ ] **Step 1:** `cellsForLinting` already comes from the store, which keys by uuid — carry `uuid` on each entry, and when re-attaching `element` to returned errors by `cellIndex`, attach `uuid: string | null` too. Add `uuid?: string | null` to `OverlayProps['errors']`'s inline element type.
- [ ] **Step 2:** No UI change — this is plumbing for Tasks 3–4 (uuid is the stable identifier for a cell across virtualization; `cellIndex` is the fallback).
- [ ] **Step 3: Verify** — type-check/build/test green.
- [ ] **Step 4: Commit** — `feat(extension): thread cell uuid onto lint errors`

---

### Task 3: Scroll to the exact line via the MAIN-world bridge (F33)

**Files:**
- Modify: `packages/extension/src/page/bridgeProtocol.ts`, `packages/extension/src/page/pageExtractor.ts`, `packages/extension/src/utils/KaggleDomParser.ts` (or a small new bridge-client util), `packages/extension/src/content/ContentApp.tsx`, `packages/ui-components/src/Overlay/Overlay.tsx`

- [ ] **Step 1:** Protocol: add `SCROLL_TO_CELL_LINE` request `{ requestId, uuid: string | null, cellIndex: number, line: number }` and a `{ requestId, ok: boolean }` response to `bridgeProtocol.ts`.
- [ ] **Step 2:** MAIN-world handler in `pageExtractor.ts`: locate the cell widget by `model.id === uuid` (fallback: `widgets[cellIndex]`), then use Jupyter's own virtualization-aware machinery — expected shape (live-probe and adjust, JupyterLab 4): scroll the notebook to the cell (`content.scrollToItem(i)` / setting `content.activeCellIndex`), then reveal the line inside the cell via the editor abstraction (`widget.editor.setCursorPosition({ line: line - 1, column: 0 })` / `widget.editor.revealPosition(...)`). Do **not** import or dispatch CodeMirror state/effects — cross-instance CM6 is a known trap and `cmView` is unreachable on Kaggle's build anyway (see the doc comment in `pageExtractor.ts`). Answer `ok: false` if no `jupyterapp`/widget found.
- [ ] **Step 3:** Content side: on error click, send the bridge request (reuse the request/response-with-timeout pattern from `KaggleDomParser.requestFromPage`, ~1500 ms). On `ok: false` or timeout, fall back to the current `element.scrollIntoView` but with `behavior: 'auto'` — instant scroll can't drift while virtualization reflows.
- [ ] **Step 4:** Single scroll path: `Overlay.tsx` currently calls its own `scrollToError` *and* invokes `onErrorClick`, and ContentApp's `handleErrorClick` scrolls again — two scrolls per click. Delete Overlay's internal scroll; scrolling is the app's job via `onErrorClick`. Keep the highlight, and when the target `.cm-line` is rendered after the scroll settles, highlight the line rather than (or in addition to) the whole cell.
- [ ] **Step 5: Verify** — build; manual (or defer to Task 5's gate): in a 200+ line cell, click an error near the bottom from a scroll position far above → lands with the line visible; click an error in a cell scrolled far out of view → correct cell and line.
- [ ] **Step 6: Commit** — `fix(extension): scroll to exact error line via Jupyter APIs in MAIN world (F33)`

---

### Task 4: Model-authoritative store reconciliation (F34)

**Files:**
- Modify: `packages/extension/src/page/bridgeProtocol.ts` (`ExtractResponseMessage` gains `source: 'model' | 'dom'`), `packages/extension/src/page/pageExtractor.ts`, `packages/extension/src/utils/KaggleDomParser.ts`, `packages/extension/src/utils/CodeMirrorManager.ts` (add `clear()` or `replaceCells()` if missing), `packages/extension/src/content/ContentApp.tsx`

- [ ] **Step 1:** `pageExtractor.extractAllCells()` reports which path produced the cells: `'model'` (from `extractViaJupyterModel` — sees every cell, rendering-independent) or `'dom'` (fallback walk). Treat a missing `source` field as `'dom'` (additive-protocol rule).
- [ ] **Step 2:** `KaggleDomParser` surfaces it (extend `getLastExtractionSource()` to `'model' | 'dom' | 'dom-scrape'` or similar).
- [ ] **Step 3:** ContentApp: when the source is `'model'`, **replace** the store (clear + sync) instead of merging — the model result is the complete truth, so deleted cells drop out. Keep merge-only for both DOM paths (they still can't see virtualized-out cells). Rewrite the long "Never clear() the store here" comment to describe the new rule and why the model path is exempt.
- [ ] **Step 4:** If M5 Task 3's extension jsdom infra exists by now, add a small unit test for the replace-vs-merge decision; otherwise cover it in Task 5's manual gate (delete a cell → its errors disappear on next lint).
- [ ] **Step 5: Commit** — `fix(extension): model-sourced extraction replaces the cell store; deleted cells shed their errors (F34)`

---

### Task 5: USER-GATE — manual verification

Requires real Chrome + logged-in Kaggle, a notebook with 10+ cells including one 200+ line cell. The executor prints this checklist and stops — never claims it passed.

- [ ] Exactly one overlay on the page; DevTools per-frame check from Task 1 Step 4 confirms 0 mounts in the top frame.
- [ ] Popup buttons (re-lint, toggle) still work; Ctrl+Shift+L / Ctrl+Shift+H work with focus in the notebook.
- [ ] Click an error deep in the long cell from far away → exact line visible, highlighted, no drift.
- [ ] Click an error in a cell scrolled way out of view (virtualized out) → correct cell + line.
- [ ] Delete a cell that had errors → after the next lint (edit or Ctrl+Shift+L), its errors are gone from the panel.
- [ ] M2/M3 regressions: error count stable across repeated relints at different scroll positions; both engines still lint.
