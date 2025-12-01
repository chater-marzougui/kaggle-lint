/**
 * Kaggle DOM Parser
 * Extracts Python code from Kaggle notebook cells
 * Handles different DOM configurations: themes, collapsible on/off, notebook modes
 */

const KaggleDomParser = (function () {
  'use strict';

  /**
   * Detects current Kaggle theme
   * @returns {'light'|'dark'} Current theme
   */
  function detectTheme() {
    const body = document.body;
    if (body.classList.contains('theme--dark')) {
      return 'dark';
    }
    if (body.getAttribute('data-theme') === 'dark') {
      return 'dark';
    }
    const bgColor = getComputedStyle(body).backgroundColor;
    if (bgColor && isDarkColor(bgColor)) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * Check if a color is dark
   * @param {string} color - CSS color value
   * @returns {boolean}
   */
  function isDarkColor(color) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    }
    return false;
  }

  /**
   * Detects if collapsible mode is enabled
   * @returns {boolean}
   */
  function isCollapsibleEnabled() {
    const collapsibleToggles = document.querySelectorAll(
      '[data-testid="cell-collapse-toggle"], .cell-collapse-toggle, [aria-label*="collapse"]'
    );
    return collapsibleToggles.length > 0;
  }

  /**
   * Detects notebook mode
   * @returns {'edit'|'view'|'run'}
   */
  function detectNotebookMode() {
    const url = window.location.href;
    if (url.includes('/edit')) {
      return 'edit';
    }
    if (url.includes('/run')) {
      return 'run';
    }
    const editButton = document.querySelector('[data-testid="edit-button"], [aria-label="Edit"]');
    if (editButton) {
      return 'view';
    }
    return 'edit';
  }

  let cachedSelector = null;
  let selectorCacheTime = 0;
  const CACHE_TTL = 5000;

  /**
   * Gets all code cell containers
   * @returns {NodeListOf<Element>}
   */
  function getCodeCellContainers() {
    const now = Date.now();
    
    if (cachedSelector && (now - selectorCacheTime) < CACHE_TTL) {
      const cells = document.querySelectorAll(cachedSelector);
      if (cells.length > 0) {
        return cells;
      }
    }
    
    const selectors = [
      '.cell-content[data-cell-type="code"]',
      '[data-testid="code-cell"]',
      '.code-cell',
      '.cell--code',
      '.jp-CodeCell',
      '.cell[data-cell-type="code"]'
    ];
    
    for (const selector of selectors) {
      const cells = document.querySelectorAll(selector);
      if (cells.length > 0) {
        cachedSelector = selector;
        selectorCacheTime = now;
        return cells;
      }
    }
    
    cachedSelector = '.cell-content, .cell';
    selectorCacheTime = now;
    return document.querySelectorAll(cachedSelector);
  }

  /**
   * Extracts code content from a cell element
   * @param {Element} cellElement - Cell DOM element
   * @returns {string|null} Code content or null if not a code cell
   */
  function extractCodeFromCell(cellElement) {
    const codeSelectors = [
      'pre code',
      '.CodeMirror-code',
      '.cm-content',
      '.monaco-editor .view-lines',
      'textarea.code-input',
      '[data-testid="code-content"]',
      '.ace_content',
      'pre',
      'code'
    ];

    for (const selector of codeSelectors) {
      const codeElement = cellElement.querySelector(selector);
      if (codeElement) {
        return extractTextContent(codeElement);
      }
    }

    return null;
  }

  /**
   * Extracts text content handling different editor types
   * @param {Element} element - Code element
   * @returns {string}
   */
  function extractTextContent(element) {
    if (element.classList.contains('CodeMirror-code')) {
      const lines = element.querySelectorAll('.CodeMirror-line');
      return Array.from(lines).map(line => line.textContent).join('\n');
    }
    
    if (element.classList.contains('cm-content')) {
      const lines = element.querySelectorAll('.cm-line');
      return Array.from(lines).map(line => line.textContent).join('\n');
    }
    
    if (element.classList.contains('view-lines')) {
      const lines = element.querySelectorAll('.view-line');
      return Array.from(lines).map(line => line.textContent).join('\n');
    }
    
    if (element.classList.contains('ace_content')) {
      const lines = element.querySelectorAll('.ace_line');
      return Array.from(lines).map(line => line.textContent).join('\n');
    }
    
    return element.textContent || '';
  }

  /**
   * Gets all code cells with their content
   * @returns {Array<{element: Element, code: string, cellIndex: number}>}
   */
  function getAllCodeCells() {
    const cells = getCodeCellContainers();
    const codeCells = [];
    let cellIndex = 0;

    cells.forEach((cell) => {
      const code = extractCodeFromCell(cell);
      if (code !== null && code.trim().length > 0) {
        codeCells.push({
          element: cell,
          code: code,
          cellIndex: cellIndex
        });
      }
      cellIndex++;
    });

    return codeCells;
  }

  /**
   * Checks if a cell is collapsed
   * @param {Element} cellElement - Cell DOM element
   * @returns {boolean}
   */
  function isCellCollapsed(cellElement) {
    const collapsedIndicators = [
      '[aria-expanded="false"]',
      '.collapsed',
      '[data-collapsed="true"]'
    ];
    
    for (const indicator of collapsedIndicators) {
      if (cellElement.querySelector(indicator) || cellElement.matches(indicator)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Gets notebook metadata
   * @returns {Object}
   */
  function getNotebookMetadata() {
    return {
      theme: detectTheme(),
      collapsibleEnabled: isCollapsibleEnabled(),
      mode: detectNotebookMode(),
      cellCount: getCodeCellContainers().length
    };
  }

  return {
    detectTheme,
    isCollapsibleEnabled,
    detectNotebookMode,
    getCodeCellContainers,
    extractCodeFromCell,
    getAllCodeCells,
    isCellCollapsed,
    getNotebookMetadata
  };
})();

if (typeof window !== 'undefined') {
  window.KaggleDomParser = KaggleDomParser;
}
