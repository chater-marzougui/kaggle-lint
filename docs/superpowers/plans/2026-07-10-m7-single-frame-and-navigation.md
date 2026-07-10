# Milestone 7: Single-Frame Mount & Precise Navigation — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exactly one overlay, mounted in the frame that actually hosts the notebook; clicking an error lands on the exact line even in long/virtualized cells; deleting a cell removes its errors on the next lint.

**Architecture:** F32 is a runtime mount gate in `content/index.tsx` — the manifest's `matches`/`all_frames` can't express "the frame with the notebook in it," so the gate waits for `.jp-Notebook` to exist in *this frame's* DOM before mounting anything (overlay, keyboard listeners, `chrome.runtime` listener). F33 and F34 both extend the existing MAIN-world bridge (`bridgeProtocol.ts` / `pageExtractor.ts`, built in Milestone 2) — the same `window.jupyterapp` object that already makes cell-text extraction reliable also owns virtualization-aware scrolling (F33) and the authoritative full-cell-list path (F34, `extractViaJupyterModel()`).

**Tech Stack:** Chrome MV3 content scripts, `window.postMessage` bridge, JupyterLab 4 widget/editor APIs (Task 3's exact API shape is a live-probe target, not verified fact — see Task 3), React 18.

**Fixes findings:** F32, F33, F34 (see the second addendum in `docs/review-findings.md`). Depends on: nothing outstanding — M1–M3 and the lint-engine-consolidation project are merged.

**Source-of-truth check (done 2026-07-10):** every file this plan touches was read in full from the current working tree: `packages/extension/src/content/index.tsx`, `packages/extension/src/content/ContentApp.tsx`, `packages/extension/src/page/bridgeProtocol.ts`, `packages/extension/src/page/pageExtractor.ts`, `packages/extension/src/utils/KaggleDomParser.ts`, `packages/extension/src/utils/CodeMirrorManager.ts`, `packages/extension/src/engine/protocol.ts`, `packages/extension/src/engine/EngineClient.ts`, `packages/extension/public/manifest.json`, `packages/extension/webpack.config.js`, `packages/ui-components/src/Overlay/Overlay.tsx`, `packages/ui-components/src/ErrorList/ErrorList.tsx`, `packages/ui-components/src/ErrorItem/ErrorItem.tsx`, `packages/ui-components/src/types/index.ts`, `packages/core/src/types/index.ts`, `packages/core/src/notebook/severityMapping.ts`, `packages/core/src/notebook/buildNotebookSource.ts`. Every file/line reference the milestone plan (`docs/next_plans/milestone-7-single-frame-and-navigation/plan.md`) makes matched current source:

- `content/index.tsx` is exactly the 43-line file the milestone plan describes (unconditional `init()`, `#kaggle-linter-root` guard, `DOMContentLoaded` gate) — nothing since M2/M3/consolidation touched it.
- `ContentApp.tsx`'s `runLinter` matches the milestone's Task 2/4 description: `cellsForLinting` is built from `codeMirrorManager.getAllCells()` (which already carries `stored.uuid`), an `elementByCellId`/`elementByCellIndex` re-attachment pattern already exists (Task 2 extends it, doesn't invent it), and the store is currently **merge-only** with a long comment block explaining why (`ContentApp.tsx:64-75`) — this is exactly what Task 4 replaces.
- `Overlay.tsx`'s `scrollToError`/`highlightCell` (module-level functions, lines 46-62) and its internal `handleErrorClick` (lines 197-202) both exist verbatim as the milestone plan describes — confirming the "two scrolls per click" bug (`Overlay.tsx` scrolls, then calls `onErrorClick`, which in `ContentApp.tsx` also scrolls).
- `bridgeProtocol.ts`/`pageExtractor.ts`/`KaggleDomParser.ts` match Milestone 2's final (post-correction) shape exactly, including the `extractViaJupyterModel() ?? extractAllCellsViaDom()` fallback chain and `getLastExtractionSource(): 'bridge' | 'dom-scrape'` — note this return type is coarser than what Task 4 needs (it can't currently distinguish "bridge answered via the model" from "bridge answered via its own internal DOM fallback"); Task 4 widens it.
- `ErrorItem.tsx` renders `Cell {(error.cellIndex ?? 0) + 1}:{error.cellLine ?? error.line}` — confirming `cellLine` (1-indexed within the cell, per `mapLineToCell` in `packages/core/src/notebook/buildNotebookSource.ts:160`) is the correct within-cell line number for Task 3's scroll target, not the global concatenated-source `line`.
- Settings shape (`{ linterEngine: 'flake8' | 'ruff', flake8IgnoreCodes, ruffIgnoreCodes }`) is untouched by this plan — no task writes to `chrome.storage.sync`.

No deviations were needed to make the milestone plan's file/line references line up with reality. Task-level implementation decisions the milestone plan left open (exact scroll-fallback code, whether to add line-level vs. cell-level highlighting, the `source` field's optionality for protocol backward-compatibility) are decided in the tasks below and logged in "Deviations" at the end, per `docs/next_plans/README.md` rule 5 — none of them reopen a milestone decision.

## Global Constraints

- Node ≥ 22.19.0; run all commands from repo root unless a task says otherwise; Windows executors use Git Bash for `&&` chains (per `docs/next_plans/DEVELOPER_PROMPTS.md`).
- Every task ends with `npm run type-check && npm run build` passing. Where a task also has `npm test` relevant packages, run it too (this plan touches no `packages/core` files, so `npm test` is unaffected by every task here, but re-run it once at Task 5 to confirm no regression).
- **No test runner for `packages/extension` or `packages/ui-components`** (per `CLAUDE.md`/`docs/architecture.md`: only `packages/core` has Jest). Every task below substitutes `type-check && build` plus a static `grep`/`ls` check for what would otherwise be a failing-test-first step — this mirrors the established convention from `docs/superpowers/plans/2026-07-09-m2-reliable-code-extraction.md`, not a deviation invented here. Do not add a Jest suite for either package; that's Milestone 5's job.
- `tsconfig.base.json` has `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"isolatedModules": true`. The last one matters for Task 3/4: cross-file type-only imports between `bridgeProtocol.ts` and its consumers must use `import { type X }` / `import type { X }`, or `ts-loader` with `transpileOnly: true` (webpack's config) can emit a broken runtime import.
- Settings storage shape (`{ linterEngine, flake8IgnoreCodes, ruffIgnoreCodes }` under `linterSettings`) is frozen — no task touches it.
- Bridge protocol changes are additive only: new message-type constants, new optional fields on existing message shapes. A stale-cached `pageExtractor.js` (old, missing a new field) talking to a freshly-reloaded content script (new, expects the field) must degrade to safe default behavior, not throw or hang. Task 4 specifically must treat a missing `source` field as `'dom'` (the more conservative, merge-only path), never assume `'model'`.
- No DOM elements or page expandos cross the `postMessage`/`chrome.runtime` boundary — plain JSON only (unchanged from Milestone 2).
- Task 3's Jupyter API calls (`content.scrollToItem`, `editor.setCursorPosition`, `editor.revealPosition`) are this plan's **expected shape to live-probe on a real notebook**, not verified fact — they were never confirmed against a live page during this plan's authoring (unlike `extractViaJupyterModel`'s `sharedModel.getSource()`/`model.id`, which Milestone 2's `notes.md` *did* confirm live). Task 3 is written probe-first with a DOM-scroll fallback that must survive the API shape being wrong.

## File Structure

| File | Responsibility after this milestone |
|---|---|
| `packages/extension/src/content/index.tsx` | Gates mounting on `.jp-Notebook` existing in this frame; unmounted frames (the outer `kaggle.com` shell) get no overlay, no keyboard listener, no `chrome.runtime` listener (F32). |
| `packages/extension/src/content/ContentApp.tsx` | `cellsForLinting`/lint-error re-attachment now also carries `uuid`; `handleErrorClick` drives the bridge scroll-to-line request with a DOM fallback (F33); store sync replaces instead of merges when the model path was used (F34). |
| `packages/extension/src/page/bridgeProtocol.ts` | Gains the `SCROLL_TO_CELL_LINE_REQUEST`/`_RESPONSE` message pair (Task 3) and an optional `source: 'model' \| 'dom'` field on `ExtractResponseMessage` (Task 4). |
| `packages/extension/src/page/pageExtractor.ts` | Gains a `scrollToCellLine()` handler using Jupyter's own widget/editor APIs (Task 3); `extractAllCells()` now reports which internal path (`extractViaJupyterModel` vs. the DOM fallback) produced its result (Task 4). |
| `packages/extension/src/utils/KaggleDomParser.ts` | Gains `scrollToCellLine()` (bridge client, same request/timeout pattern as `requestFromPage`); `getLastExtractionSource()` widens from `'bridge' \| 'dom-scrape'` to `'model' \| 'dom' \| 'dom-scrape'`. |
| `packages/ui-components/src/Overlay/Overlay.tsx` | Loses its internal `scrollToError`/`highlightCell` — scrolling is the app's job via `onErrorClick` now (single scroll path). |
| `packages/ui-components/src/types/index.ts` | `OverlayProps['errors']` element type gains `uuid?: string \| null`. |

---

### Task 1: Mount only in the notebook frame (F32)

**Files:**
- Modify: `packages/extension/src/content/index.tsx` (entire 43-line file)
- Create: `docs/next_plans/milestone-7-single-frame-and-navigation/notes.md`

**Interfaces:**
- Produces: nothing consumed by later tasks — this is a self-contained runtime gate.

- [ ] **Step 1: Replace `content/index.tsx`'s unconditional `init()` with a per-frame notebook gate**

Read the current file in full before editing (it's short — 43 lines, already quoted in the source-of-truth check above). Replace its entire contents with:

```tsx
/**
 * Content Script Entry Point
 * Injects React app into Kaggle notebook pages
 *
 * MIGRATION NOTE: Logic from old-linter/src/content.js
 * Only the React mounting is new, core logic preserved
 */

import { createRoot } from 'react-dom/client';
import { ContentApp } from './ContentApp';

const NOTEBOOK_SELECTOR = '.jp-Notebook';

function mount(): void {
  console.log('[Kaggle Linter] Initializing...');

  // Check if already initialized to prevent double mounting
  const existingRoot = document.getElementById('kaggle-linter-root');
  if (existingRoot) {
    console.log('[Kaggle Linter] Already initialized, skipping...');
    return;
  }

  // Create mount point for React app
  const mountPoint = document.createElement('div');
  mountPoint.id = 'kaggle-linter-root';
  mountPoint.style.position = 'fixed';
  mountPoint.style.zIndex = '10000';
  document.body.appendChild(mountPoint);

  // Render React app (without StrictMode to avoid double rendering)
  const root = createRoot(mountPoint);
  root.render(<ContentApp />);

  console.log('[Kaggle Linter] Initialized successfully');
}

/**
 * manifest.json injects this script (all_frames: true) into both the
 * outer kaggle.com shell page and the jupyter-proxy iframe that actually
 * hosts the notebook. A manifest `matches` pattern can't express "only the
 * frame that has a notebook in it," so the gate runs at mount time
 * instead: only the frame where `.jp-Notebook` actually appears in the DOM
 * mounts the overlay (F32). No timeout-then-mount-anyway — a frame where
 * the notebook never appears (the outer shell, and the Pyodide-CDN match
 * until Milestone 4 Task 1 deletes it) must never mount: no overlay, no
 * keydown listener, no chrome.runtime message listener.
 */
function waitForNotebookThenMount(): void {
  if (document.querySelector(NOTEBOOK_SELECTOR)) {
    mount();
    return;
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(NOTEBOOK_SELECTOR)) {
      observer.disconnect();
      mount();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForNotebookThenMount);
} else {
  waitForNotebookThenMount();
}
```

`.jp-Notebook` is the same selector `old-linter/src/content.js` already uses (lines 557, 580, 634) to detect a live notebook container, so this isn't a new/unverified selector guess — it's the pre-migration implementation's own signal for "the notebook is here."

- [ ] **Step 2: Verify — type-check and build**

Run: `npm run type-check && npm run build`
Expected: both exit 0.

- [ ] **Step 3: Verify — the gate compiled into the bundle**

```bash
grep -n "waitForNotebookThenMount\|jp-Notebook" packages/extension/dist/content.js
```

Expected: at least one match for each (webpack bundles/minifies but does not strip these identifiers/strings in a development build; if running a production build makes names unrecognizable, instead confirm via `grep -c "MutationObserver" packages/extension/dist/content.js` returns ≥ 1).

- [ ] **Step 4: Record the two intentional behavior notes**

Create `docs/next_plans/milestone-7-single-frame-and-navigation/notes.md`:

```markdown
# Notes — Milestone 7 (Single-Frame Mount & Precise Navigation)

## Task 1: intentional behavior changes from the F32 mount gate

1. **Popup broadcasts still hit every frame; only one now answers.** `chrome.tabs.sendMessage` (used by the popup for `runLinter`/`toggleOverlay`/`settingsChanged`) has always broadcast to every frame in the tab — that part is unchanged. What changes is that before this fix, *two* content-script instances (outer shell + notebook iframe) both registered a `chrome.runtime.onMessage` listener, so both replied; after this fix, only the frame that actually mounted (the one with `.jp-Notebook`) has a listener at all, so exactly one frame answers. This is the assumption Milestone 6 Task 3's "ping" design for page detection is built on — a response from *any* frame now reliably means "the real notebook frame is listening," not "one of possibly two frames happened to answer."
2. **Keyboard shortcuts now only fire with focus inside the notebook iframe.** Ctrl+Shift+L (re-lint) and Ctrl+Shift+H (toggle overlay) are bound via `document.addEventListener('keydown', ...)` inside `ContentApp`, which now only mounts in the notebook iframe. Previously the outer-shell instance's listener could theoretically catch these keystrokes too (though its lint always ran on zero cells, so pressing the shortcut there was already a no-op in every way that mattered). This is where typing happens anyway, so no behavior a user would notice changes.

## Task 1: manual per-frame verification (see plan Task 5 for the full gate)

DevTools → per-frame console context switch → `document.querySelectorAll('#kaggle-linter-root').length`. Expected: `1` in the `kkb-production.jupyter-proxy.kaggle.net` frame, `0` in the top `www.kaggle.com` frame. Recorded as part of Task 5's USER-GATE checklist, not duplicated here until that gate actually runs.
```

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/content/index.tsx docs/next_plans/milestone-7-single-frame-and-navigation/notes.md
git commit -m "fix(extension): mount only in the frame that hosts the notebook (F32)"
```

---

### Task 2: Errors carry the cell uuid

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx` (the `cellsForLinting` build and the `lintErrors` re-attachment inside `runLinter`, currently lines 86-121)
- Modify: `packages/ui-components/src/types/index.ts` (`OverlayProps['errors']` inline element type, currently lines 20-30)

**Interfaces:**
- Consumes: `CodeMirrorManager.getAllCells()` (existing, already returns `{ code, cellIndex, uuid }` per `CodeMirrorManager.ts:73-86` — `uuid` was already there, just not read this far downstream).
- Produces: `cellsForLinting` entries gain `uuid: string | null`; the errors `ContentApp` hands to `<Overlay>` gain `uuid: string | null` alongside the existing `element`. Consumed by Task 3 (the scroll-to-line request needs a `uuid`).

- [ ] **Step 1: Thread `uuid` through `cellsForLinting`**

In `packages/extension/src/content/ContentApp.tsx`, find (currently lines 86-91):

```tsx
      const cellsForLinting = codeMirrorManager.getAllCells().map((stored) => ({
        code: stored.code,
        cellIndex: stored.cellIndex,
        element:
          elementByCellId.get(codeMirrorManager.getCellId(stored.cellIndex, stored.uuid)) ?? null,
      }));
```

Replace with:

```tsx
      const cellsForLinting = codeMirrorManager.getAllCells().map((stored) => ({
        code: stored.code,
        cellIndex: stored.cellIndex,
        uuid: stored.uuid,
        element:
          elementByCellId.get(codeMirrorManager.getCellId(stored.cellIndex, stored.uuid)) ?? null,
      }));
```

- [ ] **Step 2: Re-attach `uuid` (alongside `element`) to the returned lint errors**

In the same file, find (currently lines 108-127):

```tsx
      let lintErrors;
      try {
        const elementByCellIndex = new Map(
          cellsForLinting.map((cell) => [cell.cellIndex, cell.element])
        );
        const rawErrors = await engineClientRef.lintNotebook(
          settings.linterEngine,
          cellsForLinting.map(({ code, cellIndex }) => ({ code, cellIndex })),
          ignoreCodes
        );
        lintErrors = rawErrors.map((error) => ({
          ...error,
          element: elementByCellIndex.get(error.cellIndex) ?? null,
        }));
        setEngineStatus('ready');
        console.log(`[Linter] ${settings.linterEngine} engine found ${lintErrors.length} errors`);
      } catch (error) {
        setEngineStatus('failed');
        throw error;
      }
```

Replace with:

```tsx
      let lintErrors;
      try {
        const cellByCellIndex = new Map(
          cellsForLinting.map((cell) => [
            cell.cellIndex,
            { element: cell.element, uuid: cell.uuid },
          ])
        );
        const rawErrors = await engineClientRef.lintNotebook(
          settings.linterEngine,
          cellsForLinting.map(({ code, cellIndex }) => ({ code, cellIndex })),
          ignoreCodes
        );
        lintErrors = rawErrors.map((error) => {
          const cell = cellByCellIndex.get(error.cellIndex);
          return {
            ...error,
            element: cell?.element ?? null,
            uuid: cell?.uuid ?? null,
          };
        });
        setEngineStatus('ready');
        console.log(`[Linter] ${settings.linterEngine} engine found ${lintErrors.length} errors`);
      } catch (error) {
        setEngineStatus('failed');
        throw error;
      }
```

No other change in `runLinter` — the rest of the function (ignore-codes split, `setErrors(lintErrors)`, `finally`) already consumes whatever shape `lintErrors` has.

- [ ] **Step 3: Add `uuid` to `OverlayProps['errors']`**

In `packages/ui-components/src/types/index.ts`, find (currently lines 19-30):

```ts
export interface OverlayProps {
  errors: Array<{
    line: number;
    column?: number;
    msg: string;
    severity: 'error' | 'warning' | 'info';
    rule?: string;
    code?: string;
    cellIndex?: number;
    cellLine?: number;
    element?: Element | null;
  }>;
```

Replace with:

```ts
export interface OverlayProps {
  errors: Array<{
    line: number;
    column?: number;
    msg: string;
    severity: 'error' | 'warning' | 'info';
    rule?: string;
    code?: string;
    cellIndex?: number;
    cellLine?: number;
    element?: Element | null;
    uuid?: string | null;
  }>;
```

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run build`
Expected: both exit 0. This step is plumbing only (no UI change), so a clean type-check is the whole test — the new field isn't read by any UI component yet.

```bash
grep -n "uuid" packages/extension/src/content/ContentApp.tsx
```

Expected: at least 4 matches (the `cellsForLinting` entry, the `cellByCellIndex` map, its two reads inside the `lintErrors.map` callback).

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx packages/ui-components/src/types/index.ts
git commit -m "feat(extension): thread cell uuid onto lint errors"
```

---

### Task 3: Scroll to the exact line via the MAIN-world bridge (F33)

**Files:**
- Modify: `packages/extension/src/page/bridgeProtocol.ts` (add new message pair)
- Modify: `packages/extension/src/page/pageExtractor.ts` (add scroll handler; restructure `handleMessage` to dispatch on `data.type`)
- Modify: `packages/extension/src/utils/KaggleDomParser.ts` (add `scrollToCellLine()` bridge client)
- Modify: `packages/extension/src/content/ContentApp.tsx` (`handleErrorClick`, currently lines 334-343)
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (remove internal scroll)

**Interfaces:**
- Consumes: `error.uuid`, `error.cellIndex`, `error.cellLine` from Task 2.
- Produces: `KaggleDomParser.scrollToCellLine(uuid: string | null, cellIndex: number, line: number): Promise<boolean>` — consumed by `ContentApp.handleErrorClick`.

**Live-probe caveat:** Steps 2-3 below sketch `content.scrollToItem(index)` / `content.activeCellIndex = index` / `editor.setCursorPosition(...)` / `editor.revealPosition(...)` as the *expected* JupyterLab 4 widget/editor API shape. This has **not** been confirmed against a live notebook (unlike `extractViaJupyterModel`'s `sharedModel.getSource()`, which Milestone 2 did live-probe and record in its `notes.md`). Implement it as written, but Task 5's manual gate is where it gets checked against reality — if any of these members don't exist or behave differently on the actual page, adapt `pageExtractor.ts`'s `scrollToCellLine()` function to match what DevTools shows (e.g. `console.log(Object.keys(content))` / `Object.keys(widget.editor)` against a real `window.jupyterapp`), keep the request/response contract (`{ requestId, ok }`) unchanged, and record the actual shape found in `docs/next_plans/milestone-7-single-frame-and-navigation/notes.md`. The DOM-scroll fallback in Step 4 below must work regardless of whether the live API matches this sketch — it activates whenever the bridge returns `ok: false` or times out, which covers "the JupyterLab API shape guessed here was wrong" as well as "no `jupyterapp` in this frame."

- [ ] **Step 1: Add the scroll message pair to the protocol**

In `packages/extension/src/page/bridgeProtocol.ts`, append after the existing `ExtractResponseMessage` interface:

```ts
export const SCROLL_TO_CELL_LINE_REQUEST = 'KAGGLE_LINT_SCROLL_TO_CELL_LINE_REQUEST' as const;
export const SCROLL_TO_CELL_LINE_RESPONSE = 'KAGGLE_LINT_SCROLL_TO_CELL_LINE_RESPONSE' as const;

export interface ScrollToCellLineRequestMessage {
  type: typeof SCROLL_TO_CELL_LINE_REQUEST;
  requestId: string;
  uuid: string | null;
  cellIndex: number;
  line: number;
}

export interface ScrollToCellLineResponseMessage {
  type: typeof SCROLL_TO_CELL_LINE_RESPONSE;
  requestId: string;
  ok: boolean;
}
```

- [ ] **Step 2: Implement the MAIN-world scroll handler**

In `packages/extension/src/page/pageExtractor.ts`, update the import line (currently line 11):

```ts
import { EXTRACT_REQUEST, EXTRACT_RESPONSE, type PageExtractedCell, type ExtractResponseMessage } from './bridgeProtocol';
```

Replace with:

```ts
import {
  EXTRACT_REQUEST,
  EXTRACT_RESPONSE,
  SCROLL_TO_CELL_LINE_REQUEST,
  SCROLL_TO_CELL_LINE_RESPONSE,
  type PageExtractedCell,
  type ExtractResponseMessage,
  type ScrollToCellLineResponseMessage,
} from './bridgeProtocol';
```

Then, immediately before the `function handleMessage(event: MessageEvent): void {` line, add:

```ts
/**
 * Locates the cell widget for a uuid/cellIndex pair via the same
 * window.jupyterapp notebook-widget path extractViaJupyterModel() reads.
 * Prefers uuid (stable across virtualization); falls back to positional
 * index if the uuid isn't found (e.g. a stale click target from before a
 * cell was deleted).
 */
function findCellWidget(
  uuid: string | null,
  cellIndex: number
): { content: any; widget: any; index: number } | null {
  const app = (window as any).jupyterapp;
  const content = app?.shell?.currentWidget?.content;
  const widgets = content?.widgets;
  if (!Array.isArray(widgets) || widgets.length === 0) {
    return null;
  }

  if (uuid) {
    const index = widgets.findIndex((w: any) => w?.model?.id === uuid);
    if (index !== -1) {
      return { content, widget: widgets[index], index };
    }
  }

  if (cellIndex >= 0 && cellIndex < widgets.length) {
    return { content, widget: widgets[cellIndex], index: cellIndex };
  }

  return null;
}

/**
 * Scrolls the notebook to a cell and reveals a specific line inside it,
 * using Jupyter's own virtualization-aware widget/editor APIs (expected
 * shape for JupyterLab 4 — live-probe target, see this milestone's
 * notes.md). Never touches CodeMirror state/effects directly: cross-
 * instance CM6 dispatch is a known trap, and the `cmView` expando this
 * file's DOM-fallback extraction path looks for doesn't exist on Kaggle's
 * current build anyway (see extractViaJupyterModel's doc comment above).
 */
function scrollToCellLine(uuid: string | null, cellIndex: number, line: number): boolean {
  try {
    const found = findCellWidget(uuid, cellIndex);
    if (!found) {
      return false;
    }
    const { content, widget, index } = found;

    if (typeof content.scrollToItem === 'function') {
      content.scrollToItem(index);
    } else {
      content.activeCellIndex = index;
    }

    const editor = widget?.editor;
    const position = { line: Math.max(0, line - 1), column: 0 };
    if (editor && typeof editor.setCursorPosition === 'function') {
      editor.setCursorPosition(position);
    }
    if (editor && typeof editor.revealPosition === 'function') {
      editor.revealPosition(position);
    }

    return true;
  } catch {
    return false;
  }
}
```

Then replace `handleMessage` (currently lines 152-167):

```ts
function handleMessage(event: MessageEvent): void {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || data.type !== EXTRACT_REQUEST || typeof data.requestId !== 'string') {
    return;
  }

  const response: ExtractResponseMessage = {
    type: EXTRACT_RESPONSE,
    requestId: data.requestId,
    cells: extractAllCells(),
  };
  window.postMessage(response, '*');
}
```

with:

```ts
function handleMessage(event: MessageEvent): void {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || typeof data.requestId !== 'string') {
    return;
  }

  if (data.type === EXTRACT_REQUEST) {
    const response: ExtractResponseMessage = {
      type: EXTRACT_RESPONSE,
      requestId: data.requestId,
      cells: extractAllCells(),
    };
    window.postMessage(response, '*');
    return;
  }

  if (data.type === SCROLL_TO_CELL_LINE_REQUEST) {
    const ok = scrollToCellLine(
      typeof data.uuid === 'string' ? data.uuid : null,
      typeof data.cellIndex === 'number' ? data.cellIndex : -1,
      typeof data.line === 'number' ? data.line : 1
    );
    const response: ScrollToCellLineResponseMessage = {
      type: SCROLL_TO_CELL_LINE_RESPONSE,
      requestId: data.requestId,
      ok,
    };
    window.postMessage(response, '*');
  }
}
```

(Note: `extractAllCells()` is rewritten by Task 4 to also return a `source` tag — this task's `handleMessage` edit lands first and Task 4 edits the same function again; there is no conflict since Task 4 only changes `extractAllCells`'s return shape and the `EXTRACT_REQUEST` branch, not this task's new `SCROLL_TO_CELL_LINE_REQUEST` branch.)

- [ ] **Step 3: Add the bridge client to `KaggleDomParser`**

In `packages/extension/src/utils/KaggleDomParser.ts`, update the import (currently line 14):

```ts
import { EXTRACT_REQUEST, EXTRACT_RESPONSE, type PageExtractedCell } from '../page/bridgeProtocol';
```

Replace with:

```ts
import {
  EXTRACT_REQUEST,
  EXTRACT_RESPONSE,
  SCROLL_TO_CELL_LINE_REQUEST,
  SCROLL_TO_CELL_LINE_RESPONSE,
  type PageExtractedCell,
} from '../page/bridgeProtocol';
```

Then add a new public method, right after `requestFromPage` (currently ending at line 144, just before the `resolveElements` method):

```ts
  /**
   * Asks the MAIN-world bridge to scroll the notebook to a cell and
   * reveal a specific line inside it, using Jupyter's own virtualization-
   * aware widget/editor APIs (see pageExtractor.ts). Resolves false on
   * timeout, or if pageExtractor couldn't find a matching cell widget —
   * either case means the caller should fall back to a DOM scrollIntoView.
   */
  async scrollToCellLine(uuid: string | null, cellIndex: number, line: number): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        clearTimeout(timeoutId);
      };

      const handleMessage = (event: MessageEvent) => {
        if (settled || event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== SCROLL_TO_CELL_LINE_RESPONSE || data.requestId !== requestId) {
          return;
        }

        settled = true;
        cleanup();
        resolve(Boolean(data.ok));
      };

      window.addEventListener('message', handleMessage);

      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(false);
      }, BRIDGE_TIMEOUT_MS);

      window.postMessage(
        { type: SCROLL_TO_CELL_LINE_REQUEST, requestId, uuid, cellIndex, line },
        '*'
      );
    });
  }
```

- [ ] **Step 4: Single scroll path — `ContentApp.handleErrorClick` drives the bridge, Overlay stops scrolling**

In `packages/extension/src/content/ContentApp.tsx`, find (currently lines 331-343):

```tsx
  /**
   * Handle error click
   */
  const handleErrorClick = (error: any) => {
    if (error.element) {
      error.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight cell
      error.element.classList.add('kaggle-lint-highlight');
      setTimeout(() => {
        error.element.classList.remove('kaggle-lint-highlight');
      }, 2000);
    }
  };
```

Replace with:

```tsx
  /**
   * Handle error click (F33): ask the MAIN-world bridge to scroll via
   * Jupyter's own virtualization-aware APIs and reveal the exact line.
   * Falls back to a plain DOM scrollIntoView only if the bridge can't
   * find the cell (pageExtractor not loaded in this frame, or the live
   * JupyterLab API shape doesn't match what pageExtractor.ts expects) —
   * 'auto' behavior, not 'smooth': an animated scroll can drift once
   * virtualization reflows mid-animation, which is the bug F33 reports.
   */
  const handleErrorClick = async (error: any) => {
    const ok = await domParser.scrollToCellLine(
      error.uuid ?? null,
      error.cellIndex ?? 0,
      error.cellLine ?? error.line ?? 1
    );
    if (!ok && error.element) {
      error.element.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    if (error.element) {
      error.element.classList.add('kaggle-lint-highlight');
      setTimeout(() => {
        error.element.classList.remove('kaggle-lint-highlight');
      }, 2000);
    }
  };
```

`error.element` may be `null` here — for a cell rendered at lint time but virtualized out again before the click, cell-level highlighting is simply skipped, same as today; the bridge scroll itself no longer depends on `error.element` being present at all (an improvement on the pre-fix behavior, which needed the DOM element for scrolling too).

In `packages/ui-components/src/Overlay/Overlay.tsx`, delete the two module-level functions (currently lines 42-62):

```tsx
/**
 * Scrolls to the cell containing an error
 * EXACT COPY from old-linter/src/ui/overlay.js scrollToError function
 */
function scrollToError(error: OverlayProps['errors'][0]): void {
  if (error.element) {
    error.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightCell(error.element);
  }
}

/**
 * Temporarily highlights a cell
 * EXACT COPY from old-linter/src/ui/overlay.js highlightCell function
 */
function highlightCell(element: Element): void {
  element.classList.add('kaggle-lint-highlight');
  setTimeout(() => {
    element.classList.remove('kaggle-lint-highlight');
  }, 2000);
}
```

(Both become dead code once nothing calls `scrollToError`, and `noUnusedLocals` fails the build if they're left in.)

Then find the component's internal `handleErrorClick` (currently lines 196-202):

```tsx
  /**
   * Handle error click
   * EXACT LOGIC from old-linter/src/ui/overlay.js error item click handling
   */
  const handleErrorClick = (error: OverlayProps['errors'][0]) => {
    scrollToError(error);
    if (onErrorClick) {
      onErrorClick(error);
    }
  };
```

Replace with:

```tsx
  /**
   * Handle error click. Scrolling is the app's responsibility now (F33) —
   * ContentApp's onErrorClick drives the MAIN-world bridge scroll with its
   * own DOM fallback; Overlay no longer scrolls on its own, which used to
   * mean every click scrolled twice.
   */
  const handleErrorClick = (error: OverlayProps['errors'][0]) => {
    onErrorClick?.(error);
  };
```

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build`
Expected: both exit 0.

```bash
grep -n "SCROLL_TO_CELL_LINE_REQUEST\|SCROLL_TO_CELL_LINE_RESPONSE" packages/extension/src/page/bridgeProtocol.ts packages/extension/src/page/pageExtractor.ts packages/extension/src/utils/KaggleDomParser.ts
```

Expected: matches in all three files.

```bash
grep -n "scrollToError\|highlightCell" packages/ui-components/src/Overlay/Overlay.tsx
```

Expected: no matches (both functions and their only call site are gone).

```bash
grep -n "scrollIntoView" packages/extension/src/content/ContentApp.tsx packages/ui-components/src/Overlay/Overlay.tsx
```

Expected: exactly one match total, in `ContentApp.tsx` (the fallback path) — confirming the single-scroll-path fix.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/page/bridgeProtocol.ts packages/extension/src/page/pageExtractor.ts packages/extension/src/utils/KaggleDomParser.ts packages/extension/src/content/ContentApp.tsx packages/ui-components/src/Overlay/Overlay.tsx
git commit -m "fix(extension): scroll to exact error line via Jupyter APIs in MAIN world (F33)"
```

---

### Task 4: Model-authoritative store reconciliation (F34)

**Files:**
- Modify: `packages/extension/src/page/bridgeProtocol.ts` (`ExtractResponseMessage` gains optional `source`)
- Modify: `packages/extension/src/page/pageExtractor.ts` (`extractAllCells()` reports its path; `EXTRACT_REQUEST` branch of `handleMessage` includes it)
- Modify: `packages/extension/src/utils/KaggleDomParser.ts` (`getLastExtractionSource()` widens; `requestFromPage()`/`extractCells()` propagate `source`)
- Modify: `packages/extension/src/content/ContentApp.tsx` (replace the merge-only comment/logic in `runLinter`, currently lines 64-75)

**Interfaces:**
- Consumes: `CodeMirrorManager.clear()` (already exists, `CodeMirrorManager.ts:134-137` — no change needed there).
- Produces: `KaggleDomParser.getLastExtractionSource(): 'model' | 'dom' | 'dom-scrape'` (was `'bridge' | 'dom-scrape'`).

- [ ] **Step 1: `ExtractResponseMessage` gains an optional `source`**

In `packages/extension/src/page/bridgeProtocol.ts`, find:

```ts
export interface ExtractResponseMessage {
  type: typeof EXTRACT_RESPONSE;
  requestId: string;
  cells: PageExtractedCell[];
}
```

Replace with:

```ts
export interface ExtractResponseMessage {
  type: typeof EXTRACT_RESPONSE;
  requestId: string;
  cells: PageExtractedCell[];
  // Optional so a stale-cached pageExtractor.js predating this field still
  // produces a valid message — the consumer (KaggleDomParser) treats a
  // missing source as the more conservative 'dom' (merge-only) path.
  source?: 'model' | 'dom';
}
```

- [ ] **Step 2: `pageExtractor.ts` reports which internal path produced the result**

Find `extractAllCells` (currently lines 148-150):

```ts
function extractAllCells(): PageExtractedCell[] {
  return extractViaJupyterModel() ?? extractAllCellsViaDom();
}
```

Replace with:

```ts
function extractAllCells(): { cells: PageExtractedCell[]; source: 'model' | 'dom' } {
  const modelCells = extractViaJupyterModel();
  if (modelCells) {
    return { cells: modelCells, source: 'model' };
  }
  return { cells: extractAllCellsViaDom(), source: 'dom' };
}
```

Then update the `EXTRACT_REQUEST` branch inside `handleMessage` (added/edited by Task 3 — find the current version, which reads):

```ts
  if (data.type === EXTRACT_REQUEST) {
    const response: ExtractResponseMessage = {
      type: EXTRACT_RESPONSE,
      requestId: data.requestId,
      cells: extractAllCells(),
    };
    window.postMessage(response, '*');
    return;
  }
```

Replace with:

```ts
  if (data.type === EXTRACT_REQUEST) {
    const { cells, source } = extractAllCells();
    const response: ExtractResponseMessage = {
      type: EXTRACT_RESPONSE,
      requestId: data.requestId,
      cells,
      source,
    };
    window.postMessage(response, '*');
    return;
  }
```

- [ ] **Step 3: `KaggleDomParser` propagates and widens the source**

In `packages/extension/src/utils/KaggleDomParser.ts`, find the private field and getter (currently lines 27, 79-87):

```ts
  private lastSource: 'bridge' | 'dom-scrape' = 'dom-scrape';
```

and

```ts
  /**
   * Which path the most recent extractCells() call used. ContentApp reads
   * this to decide whether the cell store can be safely cleared before
   * syncing: a bridge result is a full sweep of the notebook, a DOM-scrape
   * result is partial (only currently-rendered cells).
   */
  getLastExtractionSource(): 'bridge' | 'dom-scrape' {
    return this.lastSource;
  }
```

Replace both with:

```ts
  private lastSource: 'model' | 'dom' | 'dom-scrape' = 'dom-scrape';
```

and

```ts
  /**
   * Which path the most recent extractCells() call used. ContentApp reads
   * this to decide whether the cell store can be safely replaced before
   * syncing: 'model' is a complete, rendering-independent sweep of every
   * cell (safe to replace on); 'dom' (the bridge's own internal DOM
   * fallback) and 'dom-scrape' (this class's isolated-world fallback, used
   * when the bridge doesn't respond at all) both only see currently-
   * rendered cells/lines, so they stay merge-only.
   */
  getLastExtractionSource(): 'model' | 'dom' | 'dom-scrape' {
    return this.lastSource;
  }
```

Then find `extractCells` and `requestFromPage` (currently lines 93-144):

```ts
  async extractCells(root: Document = document): Promise<CodeCell[]> {
    const bridgeCells = await this.requestFromPage();
    if (bridgeCells) {
      this.lastSource = 'bridge';
      const resolved = this.resolveElements(bridgeCells, root);
      this.log(`Extracted ${resolved.length} code cells via MAIN-world bridge`);
      return resolved;
    }

    this.lastSource = 'dom-scrape';
    this.log('Bridge extraction unavailable, falling back to DOM scrape');
    return this.extractCellsViaDomScrape(root);
  }

  /**
   * Requests a full extraction from the MAIN-world pageExtractor over
   * window.postMessage. Resolves null on timeout so the caller can fall
   * back to DOM scraping; always removes its listener either way.
   */
  private requestFromPage(): Promise<PageExtractedCell[] | null> {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        clearTimeout(timeoutId);
      };

      const handleMessage = (event: MessageEvent) => {
        if (settled || event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== EXTRACT_RESPONSE || data.requestId !== requestId) return;

        settled = true;
        cleanup();
        resolve(data.cells as PageExtractedCell[]);
      };

      window.addEventListener('message', handleMessage);

      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, BRIDGE_TIMEOUT_MS);

      window.postMessage({ type: EXTRACT_REQUEST, requestId }, '*');
    });
  }
```

Replace with:

```ts
  async extractCells(root: Document = document): Promise<CodeCell[]> {
    const bridgeResult = await this.requestFromPage();
    if (bridgeResult) {
      this.lastSource = bridgeResult.source;
      const resolved = this.resolveElements(bridgeResult.cells, root);
      this.log(
        `Extracted ${resolved.length} code cells via MAIN-world bridge (${bridgeResult.source})`
      );
      return resolved;
    }

    this.lastSource = 'dom-scrape';
    this.log('Bridge extraction unavailable, falling back to DOM scrape');
    return this.extractCellsViaDomScrape(root);
  }

  /**
   * Requests a full extraction from the MAIN-world pageExtractor over
   * window.postMessage. Resolves null on timeout so the caller can fall
   * back to DOM scraping; always removes its listener either way.
   */
  private requestFromPage(): Promise<{ cells: PageExtractedCell[]; source: 'model' | 'dom' } | null> {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        clearTimeout(timeoutId);
      };

      const handleMessage = (event: MessageEvent) => {
        if (settled || event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== EXTRACT_RESPONSE || data.requestId !== requestId) return;

        settled = true;
        cleanup();
        // A stale-cached pageExtractor.js predating the `source` field
        // omits it entirely — treat that as 'dom' (merge-only), never as
        // the authoritative 'model' path, per this plan's additive-
        // protocol constraint.
        resolve({
          cells: data.cells as PageExtractedCell[],
          source: data.source === 'model' ? 'model' : 'dom',
        });
      };

      window.addEventListener('message', handleMessage);

      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, BRIDGE_TIMEOUT_MS);

      window.postMessage({ type: EXTRACT_REQUEST, requestId }, '*');
    });
  }
```

- [ ] **Step 4: `ContentApp.runLinter` replaces the store on a model sweep, merges otherwise**

In `packages/extension/src/content/ContentApp.tsx`, find the comment block and `syncCells` call (currently lines 64-75):

```tsx
      // Never clear() the store here. Both extraction paths are DOM-based:
      // the MAIN-world bridge sees full CodeMirror document text for
      // editors that ARE rendered, but — like the DOM-scrape fallback — it
      // has no visibility into cells Kaggle hasn't mounted a `.cm-editor`
      // for at all (i.e. cells scrolled out of a virtualized notebook). So
      // "bridge succeeded" never means "saw every cell," and clearing on
      // that basis would wipe exactly the virtualized-out coverage this
      // store exists to provide. We only ever merge; a cell the user
      // deletes leaves a stale store entry until the page reloads, which
      // is an accepted tradeoff (extraction can't tell "deleted" apart
      // from "not currently rendered").
      codeMirrorManager.syncCells(cells);
```

Replace with:

```tsx
      // The Jupyter-model path (pageExtractor.ts's extractViaJupyterModel)
      // is rendering-independent — it reads every cell's source straight
      // off the notebook model via sharedModel.getSource(), so it sees
      // cells Kaggle has virtualized out of the DOM just as reliably as
      // ones currently rendered. That result is a complete, authoritative
      // sweep, so the store can safely be replaced: a cell the user
      // deleted simply isn't in the new sweep and drops out (F34). Both
      // DOM-based paths — the bridge's own internal DOM fallback, and this
      // class's isolated-world DOM-scrape fallback used when the bridge
      // doesn't respond at all — only ever see cells/lines Kaggle
      // currently has mounted, so they stay merge-only; replacing on a
      // partial sweep would wipe exactly the virtualized-out coverage this
      // store exists to provide.
      if (domParser.getLastExtractionSource() === 'model') {
        codeMirrorManager.clear();
      }
      codeMirrorManager.syncCells(cells);
```

- [ ] **Step 5: No extension unit test — extension package has no test runner**

`packages/extension` has no Jest (or any) test runner (per `CLAUDE.md`, confirmed unchanged by this milestone — Milestone 5 is where that gets added). The milestone plan's Task 4 Step 4 says to add a unit test for the replace-vs-merge decision "if M5's jsdom infra exists by now" — M5 has not run (Milestone 7 is the very next milestone in the roadmap, M5 comes after M8/M4), so that infra does not exist. This is covered instead by Task 5's manual gate ("delete a cell → its errors disappear on next lint").

- [ ] **Step 6: Verify**

Run: `npm run type-check && npm run build`
Expected: both exit 0.

```bash
grep -n "getLastExtractionSource() === 'model'\|codeMirrorManager.clear()" packages/extension/src/content/ContentApp.tsx
```

Expected: one match each, the `clear()` call guarded by the `=== 'model'` check.

```bash
grep -n "source" packages/extension/src/page/bridgeProtocol.ts packages/extension/src/page/pageExtractor.ts packages/extension/src/utils/KaggleDomParser.ts
```

Expected: matches in all three files (the new field/parameter and its propagation).

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/page/bridgeProtocol.ts packages/extension/src/page/pageExtractor.ts packages/extension/src/utils/KaggleDomParser.ts packages/extension/src/content/ContentApp.tsx
git commit -m "fix(extension): model-sourced extraction replaces the cell store; deleted cells shed their errors (F34)"
```

---

### Task 5: USER-GATE — manual verification

**This task is not delegable to an agentic worker without a real browser.** Requires real Chrome + a logged-in Kaggle session, and a notebook with 10+ cells including at least one 200+ line cell (reuse the fixture noted in Milestone 2's `notes.md` / the "real-notebook test fixture" referenced by commit `c075d58` if one is on hand — otherwise create a scratch notebook with a loop that generates 200+ lines in one cell). Per `docs/next_plans/README.md` rule 4: if you cannot drive a browser, stop and hand the user this checklist — do not claim the milestone done.

- [ ] **Step 1:** From repo root, run `npm run build`. Confirm it exits 0 and `packages/extension/dist/` contains `content.js`, `popup.js`, `pageExtractor.js`, `background.js`, `offscreen.js`, `manifest.json`, `content.css`, `popup.css`, `icons/`, `pyodide/`, `ruff/`.
- [ ] **Step 2:** Reload the unpacked extension at `chrome://extensions` (or load `packages/extension/dist/` fresh if not already loaded). Content-script changes need both an extension reload **and** a page refresh.
- [ ] **Step 3:** Open the test notebook in edit mode: `https://www.kaggle.com/code/<user>/<slug>/edit`.
- [ ] **Step 4 (F32):** Open DevTools, switch the console's frame context to the **top** frame (`www.kaggle.com`) and run `document.querySelectorAll('#kaggle-linter-root').length` → expect `0`. Switch to the `kkb-production.jupyter-proxy.kaggle.net` frame and run the same → expect `1`. Confirm only one overlay is visible on the page.
- [ ] **Step 5:** Confirm the popup's "Re-lint Now" and "Toggle Overlay" buttons still work, and Ctrl+Shift+L / Ctrl+Shift+H work with keyboard focus inside the notebook iframe.
- [ ] **Step 6 (F33):** In the 200+ line cell, introduce an error near the **bottom** of the cell. Scroll the page far away from that cell, then click the error in the overlay. Confirm: the notebook scrolls to that cell, the specific line is visible (not just "somewhere in the cell"), and there's no visible drift/jump once the scroll settles.
- [ ] **Step 7 (F33):** Scroll a cell with an error far out of the viewport (virtualized out of the DOM — confirm via DevTools that its `.cm-editor` isn't currently in the document), then click that error in the overlay. Confirm it still lands on the correct cell and line (this is the case that used to silently do nothing, per finding F33(c)).
- [ ] **Step 8 (F34):** Delete a cell that has at least one active lint error. Trigger a re-lint (edit any cell to trigger the debounced auto-relint, or Ctrl+Shift+L). Confirm the deleted cell's errors are gone from the overlay's list.
- [ ] **Step 9 (regression):** Confirm error count is stable across several repeated re-lints at different scroll positions (this was Milestone 2's own regression class — don't reintroduce it). Confirm both engines (flake8 and ruff, switch via the popup) still lint successfully.
- [ ] **Step 10:** If any check in Steps 4–9 fails, debug with `superpowers:systematic-debugging`. If the failure traces to a wrong assumption about Kaggle's current DOM or the JupyterLab widget/editor API shape sketched in Task 3 (e.g. `content.scrollToItem`/`editor.setCursorPosition`/`editor.revealPosition` don't exist or behave differently), adapt `pageExtractor.ts`'s `scrollToCellLine()` per this plan's *intent* — keep the `{ requestId, ok }` response contract, keep the DOM-scroll fallback as the safety net — and record what was actually found in `docs/next_plans/milestone-7-single-frame-and-navigation/notes.md`, per `docs/next_plans/README.md` rule 5.
- [ ] **Step 11:** Commit any fixes/notes from Step 10. If Step 10 wasn't triggered, no further commit is needed — this closes out Milestone 7.

---

## Deviations from the milestone plan

Per `docs/next_plans/README.md` rule 5, documented here rather than reopening any decision in `docs/next_plans/milestone-7-single-frame-and-navigation/plan.md`. None of these reverse a milestone decision — they fill in implementation details the milestone plan left to this TDD expansion.

1. **`getLastExtractionSource()`'s return type widened in place rather than adding a second getter.** The milestone plan's Task 4 Step 2 says "extend `getLastExtractionSource()` to `'model' | 'dom' | 'dom-scrape'` or similar" — this plan does exactly that (widen, not add a parallel method), since every existing caller (just `ContentApp.runLinter`, one call site) already reads it as a single decision point and a second getter would just be two sources of truth for the same underlying `lastSource` field.
2. **`ExtractResponseMessage.source` made optional, not required.** The milestone plan's own Task 4 Step 1 text says the message "gains `source: 'model' | 'dom'`" without specifying optionality, but the Global Constraints section (both the milestone plan's and this plan's) requires additive-only, backward-degrading protocol changes. Since `pageExtractor.js` and `content.js` are two separately-bundled scripts that can be at different versions after a partial extension reload (a stale cached MAIN-world script talking to a freshly-reloaded isolated-world one), the field must be optional with a safe default (`'dom'`) on the reading side — this plan's Step 1/Step 3 for Task 4 implement that explicitly.
3. **Cell-level highlight kept, no line-level highlight added.** The milestone plan's Task 3 Step 4 says "highlight the line rather than (or in addition to) the whole cell" — explicitly optional phrasing. This plan keeps the existing whole-cell `kaggle-lint-highlight` class toggle (already implemented, no new CSS/DOM-query work needed) rather than adding line-level highlighting, since the milestone's own wording treats it as optional and the core F33 fix (correct scroll position) doesn't depend on it. If a future milestone wants line-level highlighting, `pageExtractor.ts`'s `scrollToCellLine` already resolves the exact widget/editor for the target cell and could be extended to return which DOM line was revealed.
4. **`findCellWidget`'s uuid-miss fallback uses positional `cellIndex` into the live `widgets` array, not a "give up" response.** The milestone plan's Task 3 Step 2 says "fallback: `widgets[cellIndex]`" — this plan implements that literally (`findCellWidget` tries `uuid` first, then `widgets[cellIndex]`), rather than treating a uuid-miss as an automatic `ok: false`. This matches the milestone's own stated fallback order and gives the DOM-scroll fallback (Step 4) a strictly smaller failure surface (only fires when *neither* lookup succeeds, or no `jupyterapp` exists in the frame at all).

No other deviations were found: every file path, line range, and signature named in `docs/next_plans/milestone-7-single-frame-and-navigation/plan.md` matched the current working tree exactly as of 2026-07-10.
