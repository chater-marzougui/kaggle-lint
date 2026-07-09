# Milestone 2: Reliable Code Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract complete, accurate cell code from Kaggle's virtualized CodeMirror 6 notebook — including off-screen cells and unrendered lines — and re-lint automatically when the user edits.

**Architecture:** Reintroduce the MAIN-world script the migration dropped (F1's sibling, F3): a page script registered with `"world": "MAIN"` in the manifest reads CodeMirror state directly (`EditorView.findFromDOM` / `cmView.view.state.doc`) and answers extraction requests over `window.postMessage`. The content script's `KaggleDomParser` asks the bridge first and falls back to DOM scraping. Extracted cells merge into the existing `CodeMirrorManager` store (currently write-only, F7) keyed by cell UUID, so cells Kaggle unloads keep their last-known code. A debounced MutationObserver triggers re-lint on edit (F8).

**Tech Stack:** TypeScript, Chrome MV3 `content_scripts` with `world: "MAIN"` (Chrome ≥ 111), `window.postMessage` bridge, MutationObserver. Reference implementation: `old-linter/src/pageInjection.js` (extraction + indexing logic) — port its intent, not its style.

**Fixes findings:** F3, F7, F8, F25. Depends on: Milestone 1.

## Global Constraints

- Node >= 22.19.0; run commands from repo root; every task ends with `npm run type-check && npm run build` green.
- The MAIN-world script runs in Kaggle's page context: it must not leak globals beyond one namespaced marker, must ignore messages whose `source !== window` or that lack the message-type constants below, and must never `eval` or inject remote code.
- Message type constants (exact strings, used by both worlds): `'KAGGLE_LINT_EXTRACT_REQUEST'`, `'KAGGLE_LINT_EXTRACT_RESPONSE'`. Payloads must be JSON-serializable (no DOM elements across the bridge — resolve elements on the content-script side by UUID/index).
- Cell identity: prefer the `data-uuid`-style attribute on `.jp-Cell` when present (verify the exact attribute name on a live notebook — old-linter used `data-uuid`); fall back to notebook-order index.

---

### Task 1: MAIN-world extractor script

**Files:**
- Create: `packages/extension/src/page/pageExtractor.ts` (new webpack entry `pageExtractor`)
- Modify: `packages/extension/webpack.config.js` (add entry), `packages/extension/public/manifest.json` (register second content script with `"world": "MAIN"`, same `matches` as the existing one, `"run_at": "document_idle"`)

**Interfaces:**
- Produces (bridge protocol, consumed by Task 2):

```ts
// request (content script → page):  window.postMessage({ type: 'KAGGLE_LINT_EXTRACT_REQUEST', requestId: string }, '*')
// response (page → content script): window.postMessage({
//   type: 'KAGGLE_LINT_EXTRACT_RESPONSE',
//   requestId: string,
//   cells: Array<{ code: string; cellIndex: number; uuid: string | null }>,
// }, '*')
```

- [ ] **Step 1:** Implement `pageExtractor.ts`: a message listener that, on `KAGGLE_LINT_EXTRACT_REQUEST`, walks `document.querySelectorAll('.jp-Cell')` to build an index map (all cells, code or not — indices must match notebook order exactly as `old-linter/src/pageInjection.js:28-37` does), then for each `.jp-CodeCell .cm-editor` extracts the **full** document text via the CM6 view (`(editor as any).cmView?.view?.state?.doc?.toString()` — in MAIN world this works; also try the `EditorView.findFromDOM(editor)` static if the `pyodide`-era expando is absent, feature-detecting `window.CodeMirror`-less setups), falling back to `.cm-line` textContent join for that editor only. Post the response with the same `requestId`.
- [ ] **Step 2:** Add webpack entry `pageExtractor: './src/page/pageExtractor.ts'` and manifest registration:

```json
{
  "matches": ["https://www.kaggle.com/code/*/*/edit", "https://kkb-production.jupyter-proxy.kaggle.net/*"],
  "js": ["pageExtractor.js"],
  "world": "MAIN",
  "run_at": "document_idle",
  "all_frames": true
}
```

- [ ] **Step 3: Verify** — build passes; `packages/extension/dist/pageExtractor.js` exists; manifest in dist contains the MAIN-world block.
- [ ] **Step 4: Commit** — `feat(extension): MAIN-world CodeMirror extractor with postMessage bridge`

---

### Task 2: Bridge client in KaggleDomParser

**Files:**
- Modify: `packages/extension/src/utils/KaggleDomParser.ts`

**Interfaces:**
- Produces: `extractCells(): Promise<CodeCell[]>` (signature unchanged) — now tries the bridge with a 1500 ms timeout, then falls back to the current DOM scrape. `CodeCell.uuid` is now populated when available.
- Consumes: bridge protocol from Task 1.

- [ ] **Step 1:** Add a private `requestFromPage(): Promise<PageCell[] | null>`: generate `requestId` (`crypto.randomUUID()`), post the request, resolve on the matching response, resolve `null` on timeout (1500 ms) — always removing the listener.
- [ ] **Step 2:** In `extractCells()`, call `requestFromPage()` first. On success, map to `CodeCell[]`, resolving `element` per cell on the content-script side: locate by uuid attribute if present, else by walking `.jp-Cell` order to the same `cellIndex` (elements may legitimately be `null` for virtualized-out cells). On `null`, log and run the existing DOM-scrape path unchanged.
- [ ] **Step 3:** Delete the now-dead "Method 1: CM6 API" block (`KaggleDomParser.ts:160-171`) and the `forceRenderCell` scroll hack — the bridge replaces both. Delete placeholder `scrollToLine` (F25); cell-level scroll via `element.scrollIntoView` in the overlay already covers navigation.
- [ ] **Step 4: Verify** — type-check + build. `grep -n "cmView\|forceRenderCell\|scrollToLine" packages/extension/src/utils/KaggleDomParser.ts` → no matches.
- [ ] **Step 5: Commit** — `feat(extension): extraction goes through MAIN-world bridge with DOM fallback`

---

### Task 3: Merge extraction into the cell store (fix write-only CodeMirrorManager, F7)

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx` (runLinter), `packages/extension/src/utils/CodeMirrorManager.ts` (only if a method signature needs `element` passthrough)

**Interfaces:**
- Consumes: `CodeMirrorManager.syncCells / getAllCells` (existing).
- Produces: `runLinter` now lints the union — `getAllCells()` (store) enriched with live `element` references from the current extraction.

- [ ] **Step 1:** In `runLinter`, after `syncCells(cells)`, build the lint input from `codeMirrorManager.getAllCells()` (sorted by `cellIndex`), attaching `element` from the just-extracted `cells` when the same uuid/index is present (else `element: null`). Cells that scrolled out of the DOM now still lint with their last-known code.
- [ ] **Step 2:** Add store invalidation: on `settingsChanged` engine switch nothing changes, but when extraction returns a *full* bridge result (bridge success), call `clear()` before `syncCells` so deleted cells don't linger; keep stale entries only in the DOM-fallback path (where partial views are expected).
- [ ] **Step 3: Verify** — type-check + build; `grep -n "getAllCells" packages/extension/src/` shows the store is read.
- [ ] **Step 4: Commit** — `feat(extension): lint from cell store so virtualized-out cells keep coverage`

---

### Task 4: Auto re-lint on edit (F8)

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx`

**Interfaces:**
- Consumes: `runLinterRef` from Milestone 1 Task 1.

- [ ] **Step 1:** Add an effect (deps `[settingsLoaded]`) that creates a debounced trigger (800 ms trailing) wrapping `runLinterRef.current()`, and a `MutationObserver` on `document.body` filtered to mutations inside `.cm-content` (check `mutation.target` ancestry; ignore mutations inside `#kaggle-linter-root`). Disconnect + cancel pending debounce in cleanup.
- [ ] **Step 2:** Guard against self-triggering: the lint run itself must not mutate `.cm-content` (it doesn't today — overlay renders in its own root; keep it that way).
- [ ] **Step 3: Verify** — type-check + build.
- [ ] **Step 4: Commit** — `feat(extension): debounced auto re-lint on cell edits`

---

### Task 5: Manual verification gate

- [ ] **Step 1:** Build, reload unpacked extension, open a Kaggle notebook with **> 30 cells** (enough for virtualization) in edit mode.
- [ ] **Step 2:** Acceptance checks:
  - Console shows extraction via bridge (add a one-line log in `requestFromPage` success path if needed).
  - Introduce `undefined_var` in the **first** cell, scroll to the **bottom** so the first cell unloads, hit Ctrl+Shift+L → the error still appears (store coverage, Task 3).
  - Type `x = untrue` in a cell and stop typing → a lint runs within ~1 s without any shortcut (Task 4), and only one lint per pause (debounce works).
  - A cell with 200+ lines lints its full content (bridge returns full doc, not just rendered lines).
- [ ] **Step 3:** If the Kaggle DOM/attribute assumptions failed (e.g. no `data-uuid`), adapt per the constraint section and record the actual selectors in `docs/next_plans/milestone-2-reliable-code-extraction/notes.md`.
- [ ] **Step 4: Commit** fixes and notes; milestone complete.
