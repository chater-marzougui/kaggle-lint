/**
 * Kaggle DOM Parser
 * Extracts Python code from Kaggle notebook cells
 * Handles different DOM configurations: themes, collapsible on/off, notebook modes
 */

const KaggleDomParser = (function () {
  "use strict";

  /**
   * Detects current Kaggle theme
   * @returns {'light'|'dark'} Current theme
   */
  function detectTheme() {
    const body = document.body;
    if (body.classList.contains("theme--dark")) {
      return "dark";
    }
    if (body.getAttribute("data-theme") === "dark") {
      return "dark";
    }
    const bgColor = getComputedStyle(body).backgroundColor;
    if (bgColor && isDarkColor(bgColor)) {
      return "dark";
    }
    return "light";
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
    if (url.includes("/edit")) {
      return "edit";
    }
    if (url.includes("/run")) {
      return "run";
    }
    const editButton = document.querySelector(
      '[data-testid="edit-button"], [aria-label="Edit"]'
    );
    if (editButton) {
      return "view";
    }
    return "edit";
  }

  let cachedSelector = null;
  let selectorCacheTime = 0;
  const CACHE_TTL = 5000;
  const DEBUG = false; // Set to true for debugging

  /**
   * Debug logging helper
   * @param {...any} args - Arguments to log
   */
  function log(...args) {
    if (DEBUG) {
      console.log("[KaggleDomParser]", ...args);
    }
  }

  /**
   * Gets all code cell containers
   * @returns {NodeListOf<Element>}
   */
  function getCodeCellContainers() {
    const now = Date.now();

    if (cachedSelector && now - selectorCacheTime < CACHE_TTL) {
      const cells = document.querySelectorAll(cachedSelector);
      if (cells.length > 0) {
        log(`Using cached selector: ${cachedSelector}, found ${cells.length} cells`);
        return cells;
      }
    }

    // Selectors for Kaggle notebook cells - JupyterLab based
    // Priority order: most specific first
    const selectors = [
      // JupyterLab selectors (Kaggle uses JupyterLab)
      ".jp-CodeCell",
      ".jp-Cell.jp-CodeCell",
      // Generic cell selectors
      '.cell-content[data-cell-type="code"]',
      '[data-testid="code-cell"]',
      ".code-cell",
      ".cell--code",
      '.cell[data-cell-type="code"]',
      // Fallback: any jp-Cell that might contain code
      ".jp-Cell",
    ];

    log("Searching for code cells with selectors:", selectors);

    for (const selector of selectors) {
      const cells = document.querySelectorAll(selector);
      log(`Selector "${selector}" found ${cells.length} elements`);
      if (cells.length > 0) {
        cachedSelector = selector;
        selectorCacheTime = now;
        log(`Using selector: ${selector}`);
        return cells;
      }
    }

    // Final fallback: look for any element that contains cm-content (CodeMirror)
    const cmContents = document.querySelectorAll(".cm-content");
    if (cmContents.length > 0) {
      log(`Found ${cmContents.length} cm-content elements, using parent cells`);
      // Return parent cells that contain cm-content
      const parentCells = [];
      cmContents.forEach((cm) => {
        // Walk up to find a suitable parent cell container
        let parent = cm.closest(".jp-Cell, .cell, [class*='cell']");
        if (parent && !parentCells.includes(parent)) {
          parentCells.push(parent);
        }
      });
      if (parentCells.length > 0) {
        log(`Found ${parentCells.length} parent cells from cm-content`);
        return parentCells;
      }
    }

    log("No cells found with any selector");
    cachedSelector = ".cell-content, .cell, .jp-Cell";
    selectorCacheTime = now;
    return document.querySelectorAll(cachedSelector);
  }

  /**
   * Extracts code content from a cell element
   * @param {Element} cellElement - Cell DOM element
   * @returns {string|null} Code content or null if not a code cell
   */
  function extractCodeFromCell(cellElement) {
    // Check if this is a Markdown cell - skip it
    if (cellElement.classList.contains("jp-MarkdownCell")) {
      log("Skipping Markdown cell");
      return null;
    }

    const codeSelectors = [
      // CodeMirror 6 (used by JupyterLab 4.x / Kaggle)
      ".cm-content",
      // CodeMirror 5
      ".CodeMirror-code",
      // Monaco editor
      ".monaco-editor .view-lines",
      // Standard code elements
      "pre code",
      "textarea.code-input",
      '[data-testid="code-content"]',
      ".ace_content",
      "pre",
      "code",
    ];

    log("Extracting code from cell:", cellElement.className);

    for (const selector of codeSelectors) {
      const codeElement = cellElement.querySelector(selector);
      if (codeElement) {
        const code = extractTextContent(codeElement);
        log(`Found code with selector "${selector}":`, code.substring(0, 100) + (code.length > 100 ? "..." : ""));
        return code;
      }
    }

    log("No code content found in cell");
    return null;
  }

  /**
   * Extracts text content handling different editor types
   * @param {Element} element - Code element
   * @returns {string}
   */
  function extractTextContent(element) {
    // CodeMirror 5
    if (element.classList.contains("CodeMirror-code")) {
      const lines = element.querySelectorAll(".CodeMirror-line");
      const code = Array.from(lines)
        .map((line) => line.textContent)
        .join("\n");
      log("Extracted CodeMirror-code content:", code.length, "chars");
      return code;
    }

    // CodeMirror 6 (JupyterLab 4.x / Kaggle)
    if (element.classList.contains("cm-content")) {
      const lines = element.querySelectorAll(".cm-line");
      if (lines.length > 0) {
        const code = Array.from(lines)
          .map((line) => {
            // Handle empty lines (they contain just <br> elements)
            if (line.querySelector("br") && line.textContent.trim() === "") {
              return "";
            }
            return line.textContent;
          })
          .join("\n");
        log("Extracted cm-content content:", code.length, "chars,", lines.length, "lines");
        return code;
      }
      // Fallback for cm-content without cm-line
      log("cm-content without cm-line, using textContent");
      return element.textContent || "";
    }

    // Monaco editor
    if (element.classList.contains("view-lines")) {
      const lines = element.querySelectorAll(".view-line");
      const code = Array.from(lines)
        .map((line) => line.textContent)
        .join("\n");
      log("Extracted Monaco view-lines content:", code.length, "chars");
      return code;
    }

    // ACE editor
    if (element.classList.contains("ace_content")) {
      const lines = element.querySelectorAll(".ace_line");
      const code = Array.from(lines)
        .map((line) => line.textContent)
        .join("\n");
      log("Extracted ACE content:", code.length, "chars");
      return code;
    }

    log("Using plain textContent extraction");
    return element.textContent || "";
  }

  /**
   * Gets all code cells with their content
   * @returns {Array<{element: Element, code: string, cellIndex: number}>}
   */
  function getAllCodeCells() {
    const cells = getCodeCellContainers();
    const codeCells = [];
    let cellIndex = 0;

    log(`Processing ${cells.length} potential cells`);

    cells.forEach((cell) => {
      const code = extractCodeFromCell(cell);
      if (code !== null && code.trim().length > 0) {
        codeCells.push({
          element: cell,
          code: code,
          cellIndex: cellIndex,
        });
        log(`Cell ${cellIndex}: ${code.length} chars of code`);
      } else {
        log(`Cell ${cellIndex}: skipped (no code or empty)`);
      }
      cellIndex++;
    });

    log(`Found ${codeCells.length} code cells with content`);
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
      ".collapsed",
      '[data-collapsed="true"]',
    ];

    for (const indicator of collapsedIndicators) {
      if (
        cellElement.querySelector(indicator) ||
        cellElement.matches(indicator)
      ) {
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
      cellCount: getCodeCellContainers().length,
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
    getNotebookMetadata,
  };
})();

if (typeof window !== "undefined") {
  window.KaggleDomParser = KaggleDomParser;
}
