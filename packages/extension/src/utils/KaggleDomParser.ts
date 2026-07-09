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

import { EXTRACT_REQUEST, EXTRACT_RESPONSE, type PageExtractedCell } from '../page/bridgeProtocol';

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

  /**
   * Resolves a DOM Element for each bridge-extracted cell: by `data-uuid`
   * when present, else by walking `.jp-Cell` in notebook order to the same
   * cellIndex. Elements are legitimately null for cells Kaggle has
   * virtualized out of the DOM.
   */
  private resolveElements(cells: PageExtractedCell[], root: Document): CodeCell[] {
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
      } else if (cell.cellIndex >= 0 && cell.cellIndex < allCellElements.length) {
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
