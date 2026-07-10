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
  SCROLL_TO_CELL_LINE_REQUEST,
  SCROLL_TO_CELL_LINE_RESPONSE,
  type PageExtractedCell,
  type ExtractResponseMessage,
  type ScrollToCellLineResponseMessage,
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
 * Extracts cell source directly from the JupyterLab notebook model, when
 * this frame has one (window.jupyterapp is only present in the actual
 * notebook iframe — kkb-production.jupyter-proxy.kaggle.net — not the
 * outer kaggle.com page, so this naturally returns null in frames that
 * aren't the notebook itself).
 *
 * This is the reliable primary path: `model.sharedModel.getSource()`
 * returns each cell's FULL text regardless of what CodeMirror has
 * rendered, sidestepping two DOM-only limitations confirmed live against
 * Kaggle's actual notebook build: (1) the `cmView` expando this file's
 * CM6-API fallback below looks for does not exist on Kaggle's current
 * `.cm-editor` elements, so that path never fires; (2) even when it did,
 * CodeMirror 6 only mounts `.cm-line` DOM nodes for lines near the
 * viewport, so DOM-scraping a long cell only ever captures whatever
 * portion happens to be scrolled into view at extraction time — verified
 * on a live notebook where a 200+ line cell's DOM-visible line count
 * fluctuated between 1 and 86 depending on scroll position, while
 * `sharedModel.getSource()` on the same cell consistently returned its
 * full ~35,000-character source. `model.id` is the notebook's own stable
 * per-cell identifier — more authoritative than reading a `data-uuid`
 * DOM attribute, since the model is presumably what sets it.
 */
function extractViaJupyterModel(): PageExtractedCell[] | null {
  try {
    const app = (window as any).jupyterapp;
    const widgets = app?.shell?.currentWidget?.content?.widgets;
    if (!Array.isArray(widgets) || widgets.length === 0) {
      return null;
    }

    const results: PageExtractedCell[] = [];
    widgets.forEach((cellWidget: any, index: number) => {
      const model = cellWidget?.model;
      if (!model || model.type !== 'code') {
        return;
      }
      const source = model.sharedModel?.getSource?.();
      if (typeof source !== 'string' || source.trim().length === 0) {
        return;
      }
      results.push({
        code: source,
        cellIndex: index,
        uuid: typeof model.id === 'string' ? model.id : null,
      });
    });

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

/**
 * DOM-based fallback for frames without a reachable Jupyter model (or if
 * the model shape above ever changes). Walks every `.jp-Cell` to build
 * notebook-order indices (all cells, code or not — indices must match
 * notebook order exactly, mirroring old-linter/src/pageInjection.js:28-37),
 * then extracts text for every `.jp-CodeCell .cm-editor` via the CM6 API
 * (currently never resolves on Kaggle's live DOM — see the doc comment on
 * extractViaJupyterModel above) or `.cm-line` scraping.
 */
function extractAllCellsViaDom(): PageExtractedCell[] {
  const allCells = Array.from(document.querySelectorAll('.jp-Cell'));
  const indexMap = new Map<Element, number>();
  allCells.forEach((cell, index) => indexMap.set(cell, index));

  const editors = Array.from(document.querySelectorAll('.jp-CodeCell .cm-editor'));
  const results: PageExtractedCell[] = [];

  for (const editor of editors) {
    const code = extractEditorText(editor);
    if (code === null || code.trim().length === 0) {
      continue;
    }

    const cellElement = editor.closest('.jp-Cell');
    const cellIndex = cellElement && indexMap.has(cellElement) ? indexMap.get(cellElement)! : -1;
    const uuid = cellElement?.getAttribute('data-uuid') ?? null;

    results.push({ code, cellIndex, uuid });
  }

  return results;
}

function extractAllCells(): { cells: PageExtractedCell[]; source: 'model' | 'dom' } {
  const modelCells = extractViaJupyterModel();
  if (modelCells) {
    return { cells: modelCells, source: 'model' };
  }
  return { cells: extractAllCellsViaDom(), source: 'dom' };
}

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
 * Best-effort refinement of the reveal below: `content.scrollToItem`/
 * `editor.revealPosition` land the line at whatever edge their own
 * "nearest visible" scroll logic picks (observed live: bottom of the
 * viewport, confirmed by user), not the vertical center. This centers it
 * precisely and briefly highlights the exact line, by reading the real
 * CM6 EditorView through Jupyter's own editor wrapper — `@jupyterlab/
 * codemirror`'s CodeMirrorEditor class exposes the live view as its
 * `.editor` property, a proper object-graph reference reached via
 * window.jupyterapp, NOT the `cmView` DOM expando that doesn't exist on
 * Kaggle's build (see extractViaJupyterModel's doc comment above) — so
 * this isn't the same dead end. It only reads layout (`lineBlockAt`,
 * `domAtPos`) and sets `scrollDOM.scrollTop` directly; it never dispatches
 * a CM6 transaction/effect, so there's no risk of mutating the wrong
 * instance's state. Silently no-ops if the view isn't shaped as expected —
 * the caller's `revealPosition` call already positioned the view (just not
 * centered), so this is a pure enhancement, never required for
 * `scrollToCellLine` to report success.
 */
function centerAndHighlightLine(view: any, line: number): void {
  try {
    const doc = view?.state?.doc;
    if (!doc || typeof view.lineBlockAt !== 'function' || !view.scrollDOM) {
      return;
    }

    const lineNumber = Math.min(Math.max(1, line), doc.lines);
    const linePos = doc.line(lineNumber).from;
    const block = view.lineBlockAt(linePos);
    const scroller = view.scrollDOM;
    scroller.scrollTop = block.top - scroller.clientHeight / 2 + block.height / 2;

    if (typeof view.domAtPos !== 'function') {
      return;
    }
    const domPos = view.domAtPos(linePos);
    const node: Node | null = domPos?.node ?? null;
    const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
    const lineEl = el?.closest?.('.cm-line');
    if (lineEl) {
      lineEl.classList.add('kaggle-lint-line-highlight');
      setTimeout(() => lineEl.classList.remove('kaggle-lint-line-highlight'), 2000);
    }
  } catch {
    // Enhancement only — see doc comment above.
  }
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

    centerAndHighlightLine(editor?.editor, line);

    return true;
  } catch {
    return false;
  }
}

function handleMessage(event: MessageEvent): void {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || typeof data.requestId !== 'string') {
    return;
  }

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

// Guard against double registration: manifest.json's all_frames + two
// overlapping match patterns can inject this script more than once per frame.
if (!(window as any)[LOADED_MARKER]) {
  (window as any)[LOADED_MARKER] = true;
  window.addEventListener('message', handleMessage);
}
