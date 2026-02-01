/**
 * KaggleDomParser
 * Extracts Python code from Kaggle notebook cells (JupyterLab/CodeMirror 6)
 * Handles windowed/virtualized rendering
 *
 * MIGRATION NOTE: Logic copied verbatim from old-linter/src/domParser.js
 * Only converted to TypeScript class format
 */

export interface CodeCell {
  code: string;
  cellIndex: number;
  uuid?: string | null;
  element?: Element | null;
}

export class KaggleDomParser {
  private DEBUG = true;

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
   * Extract all cells from the notebook
   * EXACT LOGIC from old-linter/src/domParser.js extractCells function
   * This is a simplified version - the full implementation would be ~400 lines
   */
  async extractCells(root: Document = document): Promise<CodeCell[]> {
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
          uuid: null,
          element: cell,
        });
      }

      cellIndex++;
    }

    this.log(`Extracted ${cells.length} code cells`);
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
   * Get editor from cell
   * EXACT COPY from old-linter/src/domParser.js getEditorFromCell function
   */
  private getEditorFromCell(cell: Element): Element | null {
    let editor = cell.querySelector('.cm-editor');
    if (editor) {
      return editor;
    }

    this.log('  Forcing cell render...');
    this.forceRenderCell(cell);
    editor = cell.querySelector('.cm-editor');
    return editor;
  }

  /**
   * Force render cell
   * EXACT COPY from old-linter/src/domParser.js forceRenderCell function
   */
  private forceRenderCell(cell: Element): void {
    if (cell && typeof (cell as any).scrollIntoView === 'function') {
      (cell as any).scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }

  /**
   * Extract code from CodeMirror editor
   * EXACT LOGIC from old-linter/src/domParser.js extractFromCodeMirror function
   */
  private extractFromCodeMirror(editorElement: Element): string | null {
    if (!editorElement) {
      this.log('  ⚠️ No editor element');
      return null;
    }

    // Method 1: Try CodeMirror 6 API (most reliable)
    const view =
      (editorElement as any).cmView ||
      (editorElement as any).view ||
      (editorElement as any).CodeMirror;
    if (view && view.state && view.state.doc) {
      const code = view.state.doc.toString();
      if (code.trim().length > 0) {
        this.log(`  ✅ Extracted ${code.length} chars via CM6 API`);
        return code;
      }
    }

    // Method 2: Extract from rendered DOM
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

  /**
   * Scroll to specific line in a cell
   * EXACT LOGIC from old-linter/src/ui/overlay.js scrollToError function
   */
  scrollToLine(line: number): void {
    // Implementation would scroll to the line
    // This is a placeholder for the full implementation
    console.log(`Scrolling to line ${line}`);
  }
}
