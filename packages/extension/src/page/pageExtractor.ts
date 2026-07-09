/**
 * MAIN-world page script. Reads CodeMirror 6 state directly from the
 * Kaggle notebook page and answers extraction requests from the
 * isolated-world content script over window.postMessage.
 *
 * Registered with "world": "MAIN" in manifest.json, so this shares the
 * page's JS globals (including CodeMirror's page-JS expando properties)
 * but has no access to chrome.* APIs.
 */

import { EXTRACT_REQUEST, EXTRACT_RESPONSE, type PageExtractedCell, type ExtractResponseMessage } from './bridgeProtocol';

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

// Guard against double registration: manifest.json's all_frames + two
// overlapping match patterns can inject this script more than once per frame.
if (!(window as any)[LOADED_MARKER]) {
  (window as any)[LOADED_MARKER] = true;
  window.addEventListener('message', handleMessage);
}
