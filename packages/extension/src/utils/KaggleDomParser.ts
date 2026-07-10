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
  SCROLL_TO_CELL_LINE_REQUEST,
  SCROLL_TO_CELL_LINE_RESPONSE,
  type PageExtractedCell,
} from '../page/bridgeProtocol';
import { createLogger } from './logger';

export interface CodeCell {
  code: string;
  cellIndex: number;
  uuid?: string | null;
  element?: Element | null;
}

const BRIDGE_TIMEOUT_MS = 1500;
const logger = createLogger('DomParser');

export class KaggleDomParser {
  private DEBUG = true;
  private lastSource: 'model' | 'dom' | 'dom-scrape' = 'dom-scrape';

  private log(...args: any[]): void {
    if (this.DEBUG) logger.log(...args);
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

  /**
   * Extract all cells from the notebook. Tries the MAIN-world bridge
   * first; falls back to DOM scraping if it doesn't respond in time.
   */
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
  private requestFromPage(): Promise<{
    cells: PageExtractedCell[];
    source: 'model' | 'dom';
  } | null> {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let settled = false;

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

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, BRIDGE_TIMEOUT_MS);

      window.postMessage({ type: EXTRACT_REQUEST, requestId }, '*');
    });
  }

  /**
   * Asks the MAIN-world bridge to scroll the notebook to a cell and
   * reveal a specific line inside it, using Jupyter's own virtualization-
   * aware widget/editor APIs (see pageExtractor.ts). Resolves false on
   * timeout, or if pageExtractor couldn't find a matching cell widget —
   * either case means the caller should fall back to a DOM scrollIntoView.
   */
  async scrollToCellLine(
    uuid: string | null,
    cellIndex: number,
    line: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      let settled = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        clearTimeout(timeoutId);
      };

      const handleMessage = (event: MessageEvent) => {
        if (settled || event.source !== window) return;
        const data = event.data;
        if (
          !data ||
          data.type !== SCROLL_TO_CELL_LINE_RESPONSE ||
          data.requestId !== requestId
        ) {
          return;
        }

        settled = true;
        cleanup();
        resolve(Boolean(data.ok));
      };

      window.addEventListener('message', handleMessage);

      const timeoutId = setTimeout(() => {
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

  /**
   * Resolves a DOM Element for each bridge-extracted cell: by `data-uuid`
   * when present, else by `data-windowed-list-index` (JupyterLab 4's own
   * windowed-notebook attribute, confirmed present on live Kaggle DOM),
   * else by walking `.jp-Cell` in notebook order to the same cellIndex.
   * The plain positional fallback is unreliable on its own — live-probed
   * and confirmed `document.querySelectorAll('.jp-Cell')` does not return
   * elements in notebook-index order under Kaggle's windowed rendering, so
   * `allCellElements[cell.cellIndex]` silently grabbed the wrong node (or
   * none) for all but one cell in a 13-cell notebook. Elements are
   * legitimately null for cells Kaggle has virtualized out of the DOM
   * entirely (no `.jp-Cell` node at all, not just a reordered one).
   */
  private resolveElements(
    cells: PageExtractedCell[],
    root: Document
  ): CodeCell[] {
    const allCellElements = Array.from(root.querySelectorAll('.jp-Cell'));
    const byUuid = new Map<string, Element>();
    const byWindowedIndex = new Map<number, Element>();
    allCellElements.forEach((el) => {
      const uuid = el.getAttribute('data-uuid');
      if (uuid) byUuid.set(uuid, el);

      const windowedIndex = el.getAttribute('data-windowed-list-index');
      if (windowedIndex !== null) {
        const idx = Number.parseInt(windowedIndex, 10);
        if (Number.isInteger(idx)) byWindowedIndex.set(idx, el);
      }
    });

    return cells.map((cell) => {
      let element: Element | null = null;
      if (cell.uuid && byUuid.has(cell.uuid)) {
        element = byUuid.get(cell.uuid)!;
      } else if (byWindowedIndex.has(cell.cellIndex)) {
        element = byWindowedIndex.get(cell.cellIndex)!;
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
      // Index counts every `.jp-Cell` (markdown included, in document
      // order), matching pageExtractor.ts's extractAllCells() convention —
      // otherwise the bridge and DOM-scrape paths disagree on cellIndex
      // for notebooks with markdown cells interleaved, corrupting sort
      // order and the "Cell N" the UI reports for the same physical cell.
      const currentIndex = cellIndex;
      cellIndex++;

      if (!this.isCodeCell(cell)) {
        continue;
      }

      const editor = this.getEditorFromCell(cell);
      if (!editor) {
        continue;
      }

      const code = this.extractFromCodeMirror(editor);
      if (code !== null && code.trim().length > 0) {
        cells.push({
          code,
          cellIndex: currentIndex,
          uuid: cell.getAttribute('data-uuid'),
          element: cell,
        });
      }
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
