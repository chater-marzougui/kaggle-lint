# Milestone 2: Reliable Code Extraction — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract complete, accurate cell code from Kaggle's virtualized CodeMirror 6 notebook — including off-screen cells and unrendered lines — and re-lint automatically when the user edits.

**Architecture:** Reintroduce the MAIN-world script the migration dropped: a page script registered with `"world": "MAIN"` in the manifest reads CodeMirror state directly and answers extraction requests over `window.postMessage`. The content script's `KaggleDomParser` asks this bridge first (1500 ms timeout) and falls back to the existing DOM-scrape logic. Extracted cells merge into `CodeMirrorManager` (currently write-only) keyed by cell UUID/index, so cells Kaggle unloads keep their last-known code. A debounced `MutationObserver` triggers re-lint on edit.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`/`noUnusedParameters`/`isolatedModules` on — see Global Constraints), Chrome MV3 `content_scripts` with `world: "MAIN"` (Chrome ≥ 111), `window.postMessage` bridge, `MutationObserver`. Reference implementation: `old-linter/src/pageInjection.js` (extraction + indexing logic) — ported for intent, not style.

**Fixes findings:** F3 (CM6 API dead / lossy DOM scrape), F7 (`CodeMirrorManager` write-only), F8 (no re-lint on edit), F25 (`scrollToLine` placeholder). See `docs/review-findings.md`. Depends on: Milestone 1 (merged 2026-07-09, commit `02405e0`).

**Source-of-truth check (done 2026-07-09):** every file this plan touches was read in full from the current working tree — `packages/extension/src/content/ContentApp.tsx`, `packages/extension/src/utils/KaggleDomParser.ts`, `packages/extension/src/utils/CodeMirrorManager.ts`, `packages/extension/webpack.config.js`, `packages/extension/public/manifest.json`, plus `old-linter/src/pageInjection.js` for the `data-uuid` attribute and indexing convention the milestone plan cites. `KaggleDomParser.ts` and `CodeMirrorManager.ts` are untouched by M1 — every line number the milestone plan cites for them (the CM6-API block at lines 160-171, `forceRenderCell` at 144-148, `scrollToLine` at 200-204) matched byte-for-byte. `ContentApp.tsx` **was** rewritten by M1: `runLinter` now guards with `isLintingRef`/`isLintingRef.current` instead of the `isLinting` closure, settings load through a `settingsLoaded` gate, and there's a `runLinterRef` latest-callback ref that every effect/handler calls through — M1's own plan document (`docs/superpowers/plans/2026-07-09-m1-stabilize-content-script.md`) describes this shape exactly, and it matches the file as read today. The milestone plan's Task 3 "Interfaces" section (`Consumes: runLinterRef from Milestone 1 Task 1`) is confirmed valid. No deviations were needed to make the milestone plan's file/line references line up with reality — the "Deviations" section at the end instead covers implementation-level decisions the milestone plan left open (see there).

## Global Constraints

- Node >= 22.19.0; run all commands from repo root unless a task says otherwise; Windows executors use Git Bash for `rm -rf`/`&&` (see `docs/next_plans/DEVELOPER_PROMPTS.md` §6).
- Every task ends with `npm run type-check && npm run build` passing.
- `tsconfig.base.json` has `"noUnusedLocals": true`, `"noUnusedParameters": true`, and `"isolatedModules": true`. The last one matters here: cross-file type-only imports (the bridge protocol types shared between MAIN-world and isolated-world code) must use `import { type X }` or `import type { X }`, not a bare `import { X }`, or a per-file transpiler (ts-loader with `transpileOnly: true`, which webpack uses — `webpack.config.js:24`) cannot tell it's type-only and may emit a broken runtime import.
- Extension package has **no test runner** (per `CLAUDE.md`/`docs/architecture.md`: only `packages/core` has Jest). Verify every task with `type-check && build` plus the static `grep`/`ls` checks each task specifies — do not invent a Jest suite for the extension package; that's Milestone 5's job.
- Do not change the `chrome.storage.sync` settings shape `{ linterEngine: 'handmade' | 'flake8', rules: Record<string, boolean> }`.
- No effect in `ContentApp.tsx` may list `runLinter` (or any callback whose identity changes across renders) in its dependency array — always go through `runLinterRef.current()`. This is the F2 fix from Milestone 1; this milestone's new MutationObserver effect must not reintroduce it.
- The content-script (isolated world) vs. `pageExtractor` (MAIN world) boundary is sacred: messages crossing it must be JSON-serializable — no DOM elements, no functions, no page-JS objects. Elements are resolved by UUID/index on the content-script side after the message arrives (`KaggleDomParser.resolveElements`, Task 2).
- Message type constants (exact strings, used by both worlds): `'KAGGLE_LINT_EXTRACT_REQUEST'`, `'KAGGLE_LINT_EXTRACT_RESPONSE'`.
- Cell identity: prefer the `data-uuid` attribute on `.jp-Cell` (confirmed present in `old-linter/src/pageInjection.js:55` — `cell?.getAttribute("data-uuid")`); fall back to notebook-order index.
- The MAIN-world script must not leak globals beyond one namespaced marker (`window.__kaggleLintPageExtractorLoaded`, used only to guard against double-listener registration from `manifest.json`'s `all_frames: true` + multi-pattern `matches`), must ignore messages whose `event.source !== window` or that lack the message-type constants above, and must never `eval` or fetch/inject remote code.

## File Structure

| File                                                  | Responsibility after this milestone                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension/src/page/bridgeProtocol.ts` (new) | Shared message-type constants (`EXTRACT_REQUEST`, `EXTRACT_RESPONSE`) and payload types (`PageExtractedCell`, `ExtractRequestMessage`, `ExtractResponseMessage`) — the single source of truth for the postMessage bridge shape, imported by both worlds.                                                                                                                                                                |
| `packages/extension/src/page/pageExtractor.ts` (new)  | MAIN-world script. On `EXTRACT_REQUEST`, walks every `.jp-Cell` for notebook-order indices, then every `.jp-CodeCell .cm-editor` for full CM6 document text (with a `.cm-line` fallback per editor), and posts `EXTRACT_RESPONSE`.                                                                                                                                                                                      |
| `packages/extension/webpack.config.js`                | New `pageExtractor` entry so it's emitted as its own bundle (`dist/pageExtractor.js`).                                                                                                                                                                                                                                                                                                                                  |
| `packages/extension/public/manifest.json`             | New second `content_scripts` entry (`"world": "MAIN"`) loading `pageExtractor.js`, alongside the existing isolated-world entry (untouched).                                                                                                                                                                                                                                                                             |
| `packages/extension/src/utils/KaggleDomParser.ts`     | `extractCells()` tries the bridge first via a new private `requestFromPage()` (1500 ms timeout), then falls back to the renamed `extractCellsViaDomScrape()`. Dead CM6-API block, `forceRenderCell` scroll hack, and the `scrollToLine()` placeholder are deleted. New `getLastExtractionSource()` reports which path the last call used.                                                                               |
| `packages/extension/src/utils/CodeMirrorManager.ts`   | `getCellId()` becomes public so `ContentApp` can key into the store with the exact same id formula extraction uses, instead of duplicating it.                                                                                                                                                                                                                                                                          |
| `packages/extension/src/content/ContentApp.tsx`       | `runLinter()` clears the store before syncing only on a full bridge sweep (so deleted cells don't linger), then lints from `codeMirrorManager.getAllCells()` instead of the raw extraction array — this also fixes a latent bug where `cellIndex` was silently reassigned to the filtered array's position instead of the real notebook index. New debounced `MutationObserver` effect re-lints on `.cm-content` edits. |

---

### Task 1: MAIN-world extractor script

**Files:**

- Create: `packages/extension/src/page/bridgeProtocol.ts`
- Create: `packages/extension/src/page/pageExtractor.ts`
- Modify: `packages/extension/webpack.config.js` (add entry, currently `entry: { content: ..., popup: ... }` at lines 8-11)
- Modify: `packages/extension/public/manifest.json` (add second `content_scripts` block; existing block is currently lines 34-46)

**Interfaces:**

- Produces (consumed by Task 2):

```ts
export const EXTRACT_REQUEST = 'KAGGLE_LINT_EXTRACT_REQUEST';
export const EXTRACT_RESPONSE = 'KAGGLE_LINT_EXTRACT_RESPONSE';
export interface PageExtractedCell {
  code: string;
  cellIndex: number;
  uuid: string | null;
}
export interface ExtractRequestMessage {
  type: typeof EXTRACT_REQUEST;
  requestId: string;
}
export interface ExtractResponseMessage {
  type: typeof EXTRACT_RESPONSE;
  requestId: string;
  cells: PageExtractedCell[];
}
```

- [ ] **Step 1: Create the shared protocol module**

Create `packages/extension/src/page/bridgeProtocol.ts`:

```ts
/**
 * Message-bridge protocol shared between the MAIN-world extractor
 * (pageExtractor.ts) and the isolated-world content script
 * (utils/KaggleDomParser.ts). Both worlds run in the same frame, so
 * window.postMessage is used instead of chrome.runtime messaging.
 */

export const EXTRACT_REQUEST = 'KAGGLE_LINT_EXTRACT_REQUEST' as const;
export const EXTRACT_RESPONSE = 'KAGGLE_LINT_EXTRACT_RESPONSE' as const;

export interface ExtractRequestMessage {
  type: typeof EXTRACT_REQUEST;
  requestId: string;
}

export interface PageExtractedCell {
  code: string;
  cellIndex: number;
  uuid: string | null;
}

export interface ExtractResponseMessage {
  type: typeof EXTRACT_RESPONSE;
  requestId: string;
  cells: PageExtractedCell[];
}
```

- [ ] **Step 2: Implement the MAIN-world extractor**

Create `packages/extension/src/page/pageExtractor.ts`:

```ts
/**
 * MAIN-world page script. Reads CodeMirror 6 state directly from the
 * Kaggle notebook page and answers extraction requests from the
 * isolated-world content script over window.postMessage.
 *
 * Registered with "world": "MAIN" in manifest.json, so this shares the
 * page's JS globals (including CodeMirror's page-JS expando properties)
 * but has no access to chrome.* APIs.
 */

import {
  EXTRACT_REQUEST,
  EXTRACT_RESPONSE,
  type PageExtractedCell,
  type ExtractResponseMessage,
} from './bridgeProtocol';

const LOADED_MARKER = '__kaggleLintPageExtractorLoaded';

/**
 * Finds the CodeMirror 6 EditorView for an editor DOM node, if reachable
 * from MAIN-world JS. Tries the `cmView` expando CodeMirror attaches to
 * its root DOM element, then falls back to a global `CodeMirror.EditorView.findFromDOM`
 * if the page happens to expose one (feature-detected; most CM6 setups don't).
 */
function getEditorView(editor: Element): any {
  const cmView = (editor as any).cmView;
  if (cmView?.view?.state?.doc) {
    return cmView.view;
  }

  const globalCM = (window as any).CodeMirror;
  if (globalCM?.EditorView?.findFromDOM) {
    const found = globalCM.EditorView.findFromDOM(editor);
    if (found?.state?.doc) {
      return found;
    }
  }

  return null;
}

/**
 * Extracts the full document text for one editor. Prefers the CM6 API
 * (sees the whole document, including lines Kaggle hasn't rendered);
 * falls back to joining `.cm-line` textContent for that editor only.
 */
function extractEditorText(editor: Element): string | null {
  const view = getEditorView(editor);
  if (view) {
    const text = view.state.doc.toString();
    if (text.trim().length > 0) {
      return text;
    }
  }

  const lines = editor.querySelectorAll('.cm-line');
  if (lines.length === 0) {
    return null;
  }
  return Array.from(lines)
    .map((line) => line.textContent || '')
    .join('\n');
}

/**
 * Walks every `.jp-Cell` to build notebook-order indices (all cells, code
 * or not — indices must match notebook order exactly, mirroring
 * old-linter/src/pageInjection.js:28-37), then extracts text for every
 * `.jp-CodeCell .cm-editor`.
 */
function extractAllCells(): PageExtractedCell[] {
  const allCells = Array.from(document.querySelectorAll('.jp-Cell'));
  const indexMap = new Map<Element, number>();
  allCells.forEach((cell, index) => indexMap.set(cell, index));

  const editors = Array.from(
    document.querySelectorAll('.jp-CodeCell .cm-editor')
  );
  const results: PageExtractedCell[] = [];

  for (const editor of editors) {
    const code = extractEditorText(editor);
    if (code === null || code.trim().length === 0) {
      continue;
    }

    const cellElement = editor.closest('.jp-Cell');
    const cellIndex =
      cellElement && indexMap.has(cellElement)
        ? indexMap.get(cellElement)!
        : -1;
    const uuid = cellElement?.getAttribute('data-uuid') ?? null;

    results.push({ code, cellIndex, uuid });
  }

  return results;
}

function handleMessage(event: MessageEvent): void {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (
    !data ||
    data.type !== EXTRACT_REQUEST ||
    typeof data.requestId !== 'string'
  ) {
    return;
  }

  const response: ExtractResponseMessage = {
    type: EXTRACT_RESPONSE,
    requestId: data.requestId,
    cells: extractAllCells(),
  };
  window.postMessage(response, '*');
}

// Guard against double registration: manifest.json's all_frames + two
// overlapping match patterns can inject this script more than once per frame.
if (!(window as any)[LOADED_MARKER]) {
  (window as any)[LOADED_MARKER] = true;
  window.addEventListener('message', handleMessage);
}
```

- [ ] **Step 3: Add the webpack entry**

In `packages/extension/webpack.config.js`, find (currently lines 8-11):

```js
  entry: {
    content: './src/content/index.tsx',
    popup: './src/popup/index.tsx',
  },
```

Replace with:

```js
  entry: {
    content: './src/content/index.tsx',
    popup: './src/popup/index.tsx',
    pageExtractor: './src/page/pageExtractor.ts',
  },
```

- [ ] **Step 4: Register the MAIN-world content script**

In `packages/extension/public/manifest.json`, find the existing `content_scripts` array (currently lines 34-46):

```json
  "content_scripts": [
    {
      "matches": [
        "https://www.kaggle.com/code/*/*/edit",
        "https://kkb-production.jupyter-proxy.kaggle.net/*",
        "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle",
      "all_frames": true
    }
  ],
```

Replace with (the existing block, including its `cdn.jsdelivr.net` match, is left exactly as-is — that's a separate, already-tracked issue, F17/Milestone 4; the new block intentionally omits it, matching only the two real Kaggle origins):

```json
  "content_scripts": [
    {
      "matches": [
        "https://www.kaggle.com/code/*/*/edit",
        "https://kkb-production.jupyter-proxy.kaggle.net/*",
        "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle",
      "all_frames": true
    },
    {
      "matches": [
        "https://www.kaggle.com/code/*/*/edit",
        "https://kkb-production.jupyter-proxy.kaggle.net/*"
      ],
      "js": ["pageExtractor.js"],
      "world": "MAIN",
      "run_at": "document_idle",
      "all_frames": true
    }
  ],
```

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm the new bundle and manifest block landed in `dist/`:

```bash
ls packages/extension/dist/pageExtractor.js
grep -n "\"world\": \"MAIN\"" packages/extension/dist/manifest.json
```

Expected: the file exists; the grep finds exactly one match.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/page/bridgeProtocol.ts packages/extension/src/page/pageExtractor.ts packages/extension/webpack.config.js packages/extension/public/manifest.json
git commit -m "feat(extension): MAIN-world CodeMirror extractor with postMessage bridge"
```

---

### Task 2: Bridge client in KaggleDomParser

**Files:**

- Modify: `packages/extension/src/utils/KaggleDomParser.ts` (entire file — every method below is either new or restructured; the class's public surface for callers outside this file is unchanged except the new `getLastExtractionSource()`)

**Interfaces:**

- Consumes: `EXTRACT_REQUEST`, `EXTRACT_RESPONSE`, `PageExtractedCell` from Task 1's `bridgeProtocol.ts`.
- Produces: `extractCells(root?: Document): Promise<CodeCell[]>` — signature unchanged (same optional `root` parameter and default the current file already has). `CodeCell.uuid` is now populated when the bridge or a `data-uuid` attribute provides one. New: `getLastExtractionSource(): 'bridge' | 'dom-scrape'` — consumed by Task 3.

- [ ] **Step 1: Replace the file**

The current file (205 lines, read in full during the source-of-truth check) has the "Method 1: CM6 API" dead-code block at lines 160-171, the `forceRenderCell` scroll hack at lines 144-148 (called from `getEditorFromCell`, lines 128-138), and the `scrollToLine()` placeholder at lines 200-204. All three are removed below; `isCodeCell` and the DOM-scrape half of `extractFromCodeMirror` are kept verbatim (just relocated).

Replace the full contents of `packages/extension/src/utils/KaggleDomParser.ts` with:

```ts
/**
 * KaggleDomParser
 * Extracts Python code from Kaggle notebook cells (JupyterLab/CodeMirror 6)
 * Handles windowed/virtualized rendering
 *
 * Primary extraction goes through the MAIN-world bridge (src/page/pageExtractor.ts),
 * which reads full CodeMirror 6 document state directly — including lines Kaggle
 * hasn't rendered yet and cells currently scrolled out of the virtualized viewport.
 * If the bridge doesn't respond within BRIDGE_TIMEOUT_MS (extension just reloaded,
 * pageExtractor not yet injected in this frame, etc.), this falls back to scraping
 * whatever `.cm-line` DOM nodes Kaggle currently has rendered.
 */

import {
  EXTRACT_REQUEST,
  EXTRACT_RESPONSE,
  type PageExtractedCell,
} from '../page/bridgeProtocol';

export interface CodeCell {
  code: string;
  cellIndex: number;
  uuid?: string | null;
  element?: Element | null;
}

const BRIDGE_TIMEOUT_MS = 1500;

export class KaggleDomParser {
  private DEBUG = true;
  private lastSource: 'bridge' | 'dom-scrape' = 'dom-scrape';

  private log(...args: any[]): void {
    if (this.DEBUG) console.log('[KaggleDomParser]', ...args);
  }

  /**
   * Detect theme (light/dark)
   * EXACT COPY from old-linter/src/domParser.js detectTheme function
   */
  detectTheme(): 'light' | 'dark' {
    const body = document.body;
    if (!body) return 'light';

    if (body.classList.contains('theme--dark')) return 'dark';
    if (body.getAttribute('data-theme') === 'dark') return 'dark';

    const bgColor = getComputedStyle(body).backgroundColor;
    if (bgColor && this.isDarkColor(bgColor)) return 'dark';

    return 'light';
  }

  /**
   * Check if color is dark
   * EXACT COPY from old-linter/src/domParser.js isDarkColor function
   */
  private isDarkColor(color: string): boolean {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return false;
    const [, r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  /**
   * Detect notebook mode
   * EXACT COPY from old-linter/src/domParser.js detectNotebookMode function
   */
  detectNotebookMode(): 'edit' | 'run' | 'view' {
    const url = window.location.href;
    if (url.includes('/edit')) return 'edit';
    if (url.includes('/run')) return 'run';

    const editButton = document.querySelector(
      '[data-testid="edit-button"], [aria-label="Edit"]'
    );
    if (editButton) return 'view';

    return 'edit';
  }

  /**
   * Which path the most recent extractCells() call used. ContentApp reads
   * this to decide whether the cell store can be safely cleared before
   * syncing: a bridge result is a full sweep of the notebook, a DOM-scrape
   * result is partial (only currently-rendered cells).
   */
  getLastExtractionSource(): 'bridge' | 'dom-scrape' {
    return this.lastSource;
  }

  /**
   * Extract all cells from the notebook. Tries the MAIN-world bridge
   * first; falls back to DOM scraping if it doesn't respond in time.
   */
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
        if (
          !data ||
          data.type !== EXTRACT_RESPONSE ||
          data.requestId !== requestId
        )
          return;

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

  /**
   * Resolves a DOM Element for each bridge-extracted cell: by `data-uuid`
   * when present, else by walking `.jp-Cell` in notebook order to the same
   * cellIndex. Elements are legitimately null for cells Kaggle has
   * virtualized out of the DOM.
   */
  private resolveElements(
    cells: PageExtractedCell[],
    root: Document
  ): CodeCell[] {
    const allCellElements = Array.from(root.querySelectorAll('.jp-Cell'));
    const byUuid = new Map<string, Element>();
    allCellElements.forEach((el) => {
      const uuid = el.getAttribute('data-uuid');
      if (uuid) byUuid.set(uuid, el);
    });

    return cells.map((cell) => {
      let element: Element | null = null;
      if (cell.uuid && byUuid.has(cell.uuid)) {
        element = byUuid.get(cell.uuid)!;
      } else if (
        cell.cellIndex >= 0 &&
        cell.cellIndex < allCellElements.length
      ) {
        element = allCellElements[cell.cellIndex] ?? null;
      }

      return {
        code: cell.code,
        cellIndex: cell.cellIndex,
        uuid: cell.uuid,
        element,
      };
    });
  }

  /**
   * DOM-scrape fallback. Only sees cells/lines Kaggle has currently
   * rendered — used only when the MAIN-world bridge doesn't respond.
   * EXACT LOGIC from old-linter/src/domParser.js extractCells function
   */
  private async extractCellsViaDomScrape(root: Document): Promise<CodeCell[]> {
    const cells: CodeCell[] = [];
    const allCells = root.querySelectorAll('.jp-Cell');
    this.log(`Found ${allCells.length} .jp-Cell elements`);

    let cellIndex = 0;
    for (const cell of Array.from(allCells)) {
      if (!this.isCodeCell(cell)) {
        continue;
      }

      const editor = this.getEditorFromCell(cell);
      if (!editor) {
        cellIndex++;
        continue;
      }

      const code = this.extractFromCodeMirror(editor);
      if (code !== null && code.trim().length > 0) {
        cells.push({
          code,
          cellIndex,
          uuid: cell.getAttribute('data-uuid'),
          element: cell,
        });
      }

      cellIndex++;
    }

    this.log(`Extracted ${cells.length} code cells via DOM scrape`);
    return cells;
  }

  /**
   * Check if cell is a code cell
   * EXACT COPY from old-linter/src/domParser.js isCodeCell function
   */
  private isCodeCell(cell: Element): boolean {
    if (cell.classList.contains('jp-MarkdownCell')) {
      const editorWrapper = cell.querySelector('.jp-InputArea-editor');
      if (editorWrapper && !editorWrapper.classList.contains('lm-mod-hidden')) {
        return false;
      }
      return false;
    }
    return cell.classList.contains('jp-CodeCell');
  }

  /**
   * Get editor from cell. The scroll-into-view force-render hack is gone —
   * the MAIN-world bridge (which doesn't need an element rendered to read
   * its CM6 state) is the primary path now; this only runs as a fallback.
   */
  private getEditorFromCell(cell: Element): Element | null {
    return cell.querySelector('.cm-editor');
  }

  /**
   * Extract code from CodeMirror editor via rendered DOM.
   * The CM6-API path was removed here: isolated-world content scripts
   * cannot see the page-JS `cmView` expando (see pageExtractor.ts, which
   * runs in MAIN world and can — that's the primary path now).
   * EXACT LOGIC (DOM half only) from old-linter/src/domParser.js extractFromCodeMirror
   */
  private extractFromCodeMirror(editorElement: Element): string | null {
    if (!editorElement) {
      this.log('  ⚠️ No editor element');
      return null;
    }

    const content = editorElement.querySelector('.cm-content');
    if (!content) {
      this.log('  ⚠️ No .cm-content found');
      return null;
    }

    const lines = content.querySelectorAll('.cm-line');
    if (lines.length === 0) {
      const text = content.textContent || '';
      if (text.trim().length > 0) {
        this.log(`  ✅ Extracted ${text.length} chars from textContent`);
        return text;
      }
      return null;
    }

    const codeLines = Array.from(lines).map((line) => line.textContent || '');
    const code = codeLines.join('\n');
    this.log(`  ✅ Extracted ${code.length} chars from ${lines.length} lines`);
    return code;
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm the dead code is actually gone:

```bash
grep -n "cmView\|forceRenderCell\|scrollToLine" packages/extension/src/utils/KaggleDomParser.ts
```

Expected: no matches.

Confirm the new bridge client exists and is wired into `extractCells`:

```bash
grep -n "requestFromPage\|getLastExtractionSource\|extractCellsViaDomScrape" packages/extension/src/utils/KaggleDomParser.ts
```

Expected: `requestFromPage` appears twice (declaration + call site in `extractCells`), `getLastExtractionSource` once, `extractCellsViaDomScrape` twice (declaration + call site).

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/utils/KaggleDomParser.ts
git commit -m "feat(extension): extraction goes through MAIN-world bridge with DOM fallback"
```

---

### Task 3: Merge extraction into the cell store (fix write-only CodeMirrorManager, F7)

**Files:**

- Modify: `packages/extension/src/utils/CodeMirrorManager.ts` (currently line 31: `private getCellId(...)`)
- Modify: `packages/extension/src/content/ContentApp.tsx` (`runLinter`, currently lines 105-134)

**Interfaces:**

- Consumes: `CodeMirrorManager.syncCells`/`getAllCells` (existing, unchanged shapes); `domParser.getLastExtractionSource()` from Task 2.
- Produces: `CodeMirrorManager.getCellId(cellIndex: number, uuid: string | null): string` becomes **public** (was `private`) — `ContentApp` needs the exact same id formula the store uses internally, so extraction results (which have live `element` references) can be matched back to stored cells (which don't) without duplicating the `uuid || 'cell-' + cellIndex` formula in two files.

- [ ] **Step 1: Make `getCellId` public**

In `packages/extension/src/utils/CodeMirrorManager.ts`, find (currently line 31):

```ts
  private getCellId(cellIndex: number, uuid: string | null): string {
```

Replace with:

```ts
  getCellId(cellIndex: number, uuid: string | null): string {
```

No other change to this file — every internal caller (`updateCell`, `getCell`, `syncCells`) keeps working identically; this only widens visibility.

- [ ] **Step 2: Verify the visibility change**

Run: `npm run type-check && npm run build` → both exit 0 (widening `private` to public scope can never break a caller, so this step is a formality before Step 3 depends on it).

- [ ] **Step 3: Commit the visibility change**

```bash
git add packages/extension/src/utils/CodeMirrorManager.ts
git commit -m "refactor(extension): expose CodeMirrorManager.getCellId for cross-file id matching"
```

- [ ] **Step 4: Rewrite `runLinter`'s extraction/store/lint-input section**

In `packages/extension/src/content/ContentApp.tsx`, find (currently lines 105-134 — the code between `try {` and `let lintErrors;`):

```tsx
    try {
      // Extract cells from DOM
      const cells = await domParser.extractCells();
      console.log(`[Linter] Extracted ${cells.length} cells`);

      // Sync with CodeMirror storage
      codeMirrorManager.syncCells(cells);

      // Prepare cells for linting
      const cellsForLinting = cells.map((cell, index) => ({
        code: cell.code,
        element: cell.element,
        cellIndex: index,
      }));

      let lintErrors;
```

Replace with (the old code silently reassigned `cellIndex: index` — the filtered array's position — instead of using `cell.cellIndex`, so any skipped markdown/empty cell during the walk shifted every later cell's index; switching to `codeMirrorManager.getAllCells()`, which carries the real extraction-time `cellIndex`, fixes this as a side effect of fixing F7):

```tsx
    try {
      // Extract cells from DOM (MAIN-world bridge, DOM-scrape fallback)
      const cells = await domParser.extractCells();
      console.log(`[Linter] Extracted ${cells.length} cells`);

      // A full bridge sweep reports every cell currently in the notebook,
      // so the store can be safely reset before syncing (drops cells the
      // user deleted). A DOM-scrape result is partial — only currently
      // rendered cells — so previous entries are kept, which is what lets
      // virtualized-out cells keep lint coverage.
      if (domParser.getLastExtractionSource() === 'bridge') {
        codeMirrorManager.clear();
      }
      codeMirrorManager.syncCells(cells);

      // Lint from the store (survives cells Kaggle has unloaded from the
      // DOM), enriched with live element references from this extraction
      // pass so error-click-to-scroll keeps working.
      const elementByCellId = new Map(
        cells.map((cell) => [
          codeMirrorManager.getCellId(cell.cellIndex, cell.uuid ?? null),
          cell.element ?? null,
        ])
      );
      const cellsForLinting = codeMirrorManager.getAllCells().map((stored) => ({
        code: stored.code,
        cellIndex: stored.cellIndex,
        element:
          elementByCellId.get(codeMirrorManager.getCellId(stored.cellIndex, stored.uuid)) ?? null,
      }));

      let lintErrors;
```

The rest of `runLinter` (the `if (settings.linterEngine === 'handmade') { ... } else { ... }` block through the `finally`) is untouched — it already consumes `cellsForLinting`, whose shape (`{ code, element, cellIndex }`) is unchanged.

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm the store is now actually read, not just written:

```bash
grep -n "getAllCells\|codeMirrorManager.clear" packages/extension/src/content/ContentApp.tsx
```

Expected: `getAllCells` appears at least once inside `runLinter`; `codeMirrorManager.clear` appears once, guarded by the `getLastExtractionSource() === 'bridge'` check.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx
git commit -m "feat(extension): lint from cell store so virtualized-out cells keep coverage"
```

---

### Task 4: Auto re-lint on edit (F8)

**Files:**

- Modify: `packages/extension/src/content/ContentApp.tsx` (add a new effect; insert after the message-listener effect, currently ending at line 277, and before `handleErrorClick`, currently starting at line 283)

**Interfaces:**

- Consumes: `runLinterRef` and `settingsLoaded` (both already in the file, from Milestone 1).

- [ ] **Step 1: Add the debounced MutationObserver effect**

In `packages/extension/src/content/ContentApp.tsx`, immediately after the message-listener effect's closing (currently):

```tsx
      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
    return undefined;
  }, []);
```

and before the `handleErrorClick` function (currently starting at line 283 with `const handleErrorClick = (error: any) => {`), insert a new effect:

```tsx
/**
 * Auto re-lint on cell edits (F8)
 * Debounced MutationObserver watching for changes inside `.cm-content`
 * (CodeMirror's editable text), ignoring mutations inside the overlay's
 * own root (#kaggle-linter-root) so re-rendering lint results doesn't
 * trigger another lint.
 */
useEffect(() => {
  if (!settingsLoaded) return undefined;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRelint = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      console.log('[Linter] Auto re-lint after edit');
      runLinterRef.current();
    }, 800);
  };

  const overlayRoot = document.getElementById('kaggle-linter-root');

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target;
      const el = target instanceof Element ? target : target.parentElement;
      if (!el) continue;
      if (overlayRoot && overlayRoot.contains(el)) continue;
      if (el.closest('.cm-content')) {
        scheduleRelint();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}, [settingsLoaded]);
```

- [ ] **Step 2: Confirm the self-triggering guard holds**

No code change — a verification note. The overlay mounts into `#kaggle-linter-root` (`packages/extension/src/content/index.tsx:24-25`), a `div` appended directly to `document.body` as a sibling of Kaggle's own app root, never inside `.cm-content`. The observer above only watches `childList`/`characterData` (not `attributes`), so `Overlay.tsx`'s drag/minimize code (which only ever sets `style.*` properties) can't trigger it either way — the `overlayRoot.contains(el)` check is defense in depth for the `childList` mutations `ErrorList` re-renders do produce inside the overlay on every lint.

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm the effect was added and still respects the "no `runLinter` in deps" constraint:

```bash
grep -n "MutationObserver\|runLinterRef.current()" packages/extension/src/content/ContentApp.tsx
```

Expected: `MutationObserver` appears once (constructor call); `runLinterRef.current()` now appears 5 times total (the 4 from Milestone 1 — initial lint, keyboard shortcut, `runLinter` message, settings-change — plus this task's debounced auto-relint).

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx
git commit -m "feat(extension): debounced auto re-lint on cell edits"
```

---

### Task 5: Manual verification gate — USER-GATE

This task is not delegable to an agentic worker. It requires a real Chrome browser against a real Kaggle notebook with enough cells to trigger virtualization, per `docs/next_plans/README.md` rule 4: "If you cannot drive a browser, stop and ask the user to verify — do not claim the milestone done."

- [ ] **Step 1:** From repo root, run `npm run build`. Confirm it exits 0 and `packages/extension/dist/` contains `content.js`, `popup.js`, `pageExtractor.js`, `manifest.json`, `content.css`, `popup.css`, `icons/`, `pyodide/`.
- [ ] **Step 2:** Reload the unpacked extension at `chrome://extensions` (or load `packages/extension/dist/` fresh if not already loaded) — content-script changes need both an extension reload **and** a page refresh.
- [ ] **Step 3:** Open a Kaggle notebook with **> 30 cells** (enough for virtualization) in edit mode: `https://www.kaggle.com/code/<user>/<slug>/edit`.
- [ ] **Step 4:** Open DevTools console. Confirm you see a `[KaggleDomParser] Extracted N code cells via MAIN-world bridge` line (not a `Bridge extraction unavailable` fallback line) on the first lint — this confirms `pageExtractor.js` loaded in the MAIN world and answered before the 1500 ms timeout.
- [ ] **Step 5:** Introduce `undefined_var` in the **first** cell, scroll to the **bottom** of the notebook so the first cell unloads from the DOM, then hit Ctrl+Shift+L. Confirm the `undefined_var` error still appears in the overlay (this is the cell-store coverage from Task 3 — without it, a scrolled-away cell would silently drop out of the lint results).
- [ ] **Step 6:** Type `x = untrue` into a visible cell and stop typing. Confirm a lint runs automatically within ~1 second without pressing any shortcut, and confirm only **one** lint fires per typing pause (watch for a single `[Linter] Auto re-lint after edit` line per pause, not one per keystroke — this is the Task 4 debounce working).
- [ ] **Step 7:** Find or create a cell with 200+ lines of code, scrolled so most of it is off-screen. Confirm lint errors appear for lines beyond what's currently rendered (proves the bridge returns the full CM6 document, not just visible `.cm-line` nodes).
- [ ] **Step 8:** If any check in Steps 4-7 fails, debug with `superpowers:systematic-debugging`. If the failure traces back to a wrong assumption about Kaggle's current DOM/attributes (e.g. `data-uuid` no longer present, `.jp-Cell`/`.cm-editor` class names changed), adapt the code per this plan's _intent_ and record the actual selectors/behavior observed in `docs/next_plans/milestone-2-reliable-code-extraction/notes.md` (create it if absent), per `docs/next_plans/README.md` rule 5.
- [ ] **Step 9:** Commit any fixes/notes from Step 8, then this closes out Milestone 2. No further commit is needed if Step 8 wasn't triggered.

---

## Deviations from the milestone plan

Per `docs/next_plans/README.md` rule 5, documented here rather than re-opening any decision in `docs/next_plans/milestone-2-reliable-code-extraction/plan.md`. None of these reverse a milestone decision — they fill in implementation details the milestone plan intentionally left to the TDD expansion.

1. **`getLastExtractionSource()` added to `KaggleDomParser`.** The milestone plan's Task 3 Step 2 says to clear the store "when extraction returns a full bridge result," but `extractCells()`'s return type (`Promise<CodeCell[]>`, explicitly required "unchanged" by the milestone plan's Task 2 Interfaces section) has no way to signal _which_ path produced the result. This plan adds a one-line getter (`getLastExtractionSource()`) that `ContentApp` reads right after `await`ing `extractCells()`. `extractCells()`'s signature itself is untouched, satisfying the milestone plan's literal constraint.
2. **`CodeMirrorManager.getCellId` made public.** The milestone plan flagged `CodeMirrorManager.ts` as "Modify (only if a method signature needs `element` passthrough)" without specifying what that would look like. In practice no signature needed to change — the actual gap was that `ContentApp` needed the store's existing id formula (`uuid || 'cell-' + cellIndex`) to match live-extraction elements back to stored cells, and duplicating that formula in `ContentApp.tsx` would silently drift from the store's own logic if it ever changed. Widening `getCellId` from `private` to public (no other change) avoids the duplication.
3. **DOM-scrape fallback now reads `data-uuid` instead of hardcoding `uuid: null`.** The pre-Milestone-2 `extractCellsViaDomScrape` (formerly the only `extractCells` body) always set `uuid: null`. Since the bridge path (Task 2) now populates real UUIDs, leaving the fallback path hardcoded to `null` would mean the same physical cell gets a different store key (`cell-N` vs. its real UUID) depending on which extraction path happened to run that time — causing duplicate store entries instead of one updated entry. Reading `cell.getAttribute('data-uuid')` in the fallback (one line, same attribute the bridge already relies on per the Global Constraints' cell-identity rule) keeps cell identity consistent across both paths.
4. **Latent `cellIndex` bug fixed as a side effect of Task 3, not called out by name in the milestone plan.** Pre-Milestone-2 `ContentApp.tsx` built `cellsForLinting` with `cellIndex: index` (the position in the _filtered_ extraction array) instead of `cell.cellIndex` (the real notebook-order index `KaggleDomParser` computed). Any markdown cell, empty code cell, or cell whose editor wasn't found during the walk shifted every subsequent cell's reported index, corrupting `cellLine`/`cellIndex` in lint results for notebooks with such cells. Switching to `codeMirrorManager.getAllCells()` (Task 3 Step 4), which carries the correct `cellIndex` from extraction time, fixes this without a dedicated task — noted here so it isn't mistaken for a regression during Task 5's manual gate.
5. **`crypto.randomUUID()` used without a feature-detection fallback.** The MAIN-world script this bridges to requires Chrome ≥ 111 (per the milestone plan's own Tech Stack line for `"world": "MAIN"` support), and `crypto.randomUUID()` has been available since Chrome 92 — strictly older than the floor this milestone already assumes. No fallback branch is needed or added.

No other deviations were found: every file path, line range, and signature named in `docs/next_plans/milestone-2-reliable-code-extraction/plan.md` matched the current working tree exactly as of 2026-07-09, and the `data-uuid` attribute assumption was independently confirmed against `old-linter/src/pageInjection.js:55`.

### Post-implementation correction (whole-branch review)

The `clear()`-on-bridge design described in deviation 1 above — and present in both the original milestone plan's Task 3 Step 2 text and this TDD plan's expansion of it — assumed a MAIN-world bridge sweep is equivalent to a full notebook-model sweep, i.e. that "bridge succeeded" means "saw every cell." That's false: `pageExtractor.ts`'s `extractAllCells()` is still a DOM query (`.jp-CodeCell .cm-editor`) and has no visibility into cells Kaggle hasn't mounted an editor for at all, so it undercounts virtualized-out cells exactly like the DOM-scrape fallback does. A whole-branch code review caught this because, on the normal operating path (bridge succeeds most of the time), it would have silently defeated F7 — this milestone's own headline fix for virtualized-cell lint coverage. The fix removes the clear-on-bridge branch entirely and always merges via `syncCells()`, accepting as the lesser tradeoff that a cell the user deletes leaves a stale store entry until the page reloads (extraction can't distinguish "deleted" from "not currently rendered" from DOM alone). The same review also caught two Important-severity bugs fixed in the same pass: the debounced auto re-lint `MutationObserver` fired on scroll as well as edits (scrolling mounts/unmounts `.cm-line` nodes, a `childList` mutation indistinguishable from a real edit), fixed by only scheduling a re-lint when `document.activeElement` is inside `.cm-content`; and `KaggleDomParser.extractCellsViaDomScrape`'s `cellIndex` counter skipped incrementing on markdown cells, diverging from the bridge's "index among all `.jp-Cell`" convention and corrupting sort order/reported cell numbers whenever both extraction paths wrote to the same notebook's cell store — fixed by incrementing the counter unconditionally once per cell.
