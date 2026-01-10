/**
 * Kaggle DOM Parser
 * Extracts Python code from Kaggle notebook cells (JupyterLab/CodeMirror 6)
 * Handles windowed/virtualized rendering
 */

const KaggleDomParser = (function () {
  "use strict";

  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log("[KaggleDomParser]", ...args);
  }

  // ---- Theme helpers ----

  function detectTheme() {
    const body = document.body;
    if (!body) return "light";

    if (body.classList.contains("theme--dark")) return "dark";
    if (body.getAttribute("data-theme") === "dark") return "dark";

    const bgColor = getComputedStyle(body).backgroundColor;
    if (bgColor && isDarkColor(bgColor)) return "dark";

    return "light";
  }

  function isDarkColor(color) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return false;
    const [, r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  function isCollapsibleEnabled() {
    const collapsibleToggles = document.querySelectorAll(
      '[data-testid="cell-collapse-toggle"], .cell-collapse-toggle, [aria-label*="collapse"]'
    );
    return collapsibleToggles.length > 0;
  }

  function detectNotebookMode() {
    const url = window.location.href;
    if (url.includes("/edit")) return "edit";
    if (url.includes("/run")) return "run";

    const editButton = document.querySelector(
      '[data-testid="edit-button"], [aria-label="Edit"]'
    );
    if (editButton) return "view";

    return "edit";
  }

  // ---- Core extraction logic ----

  /**
   * Force a cell to render by scrolling it into view
   */
  function forceRenderCell(cell) {
    if (cell && typeof cell.scrollIntoView === "function") {
      cell.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }

  /**
   * Get all cells (whether rendered or not)
   */
  function getAllCells(root = document) {
    const cells = root.querySelectorAll(".jp-Cell");
    log(`Found ${cells.length} .jp-Cell elements`);
    return Array.from(cells);
  }

  /**
   * Get the editor from a cell, forcing render if needed
   */
  function getEditorFromCell(cell) {
    // First try: check if editor already exists
    let editor = cell.querySelector(".cm-editor");

    if (editor) {
      return editor;
    }

    // Force render by scrolling into view
    log("  Forcing cell render...");
    forceRenderCell(cell);

    // Try again after a brief moment
    editor = cell.querySelector(".cm-editor");
    return editor;
  }

  /**
   * Determine if cell is a code cell (not markdown)
   */
  function isCodeCell(cell) {
    // Check if it's a markdown cell
    if (cell.classList.contains("jp-MarkdownCell")) {
      // Check if markdown is being edited (editor visible)
      const editorWrapper = cell.querySelector(".jp-InputArea-editor");
      if (editorWrapper && !editorWrapper.classList.contains("lm-mod-hidden")) {
        return false; // Editing markdown, skip for now
      }
      return false; // Rendered markdown, skip
    }

    // It's a code cell
    return cell.classList.contains("jp-CodeCell");
  }

  /**
   * Extract code from CodeMirror 6 editor
   */
  function extractFromCodeMirror(editorElement) {
    if (!editorElement) {
      log("  ⚠️ No editor element");
      return null;
    }

    // Method 1: Try CodeMirror 6 API (most reliable)
    const view =
      editorElement.cmView || editorElement.view || editorElement.CodeMirror;
    if (view && view.state && view.state.doc) {
      const code = view.state.doc.toString();
      if (code.trim().length > 0) {
        log(`  ✅ Extracted ${code.length} chars via CM6 API`);
        return code;
      }
    }

    // Method 2: Extract from rendered DOM
    const content = editorElement.querySelector(".cm-content");
    if (!content) {
      log("  ⚠️ No .cm-content found");
      return null;
    }

    const lines = content.querySelectorAll(".cm-line");
    if (lines.length === 0) {
      // Try direct text content
      const text = content.textContent || "";
      if (text.trim().length > 0) {
        log(`  ✅ Extracted ${text.length} chars from textContent`);
        return text;
      }
      log("  ⚠️ No .cm-line elements and no text content");
      return null;
    }

    const code = Array.from(lines)
      .map((line) => {
        // Handle empty lines (just <br> tags)
        if (line.querySelector("br") && line.textContent.trim() === "") {
          return "";
        }
        return line.textContent;
      })
      .join("\n");

    if (code.trim().length > 0) {
      log(`  ✅ Extracted ${code.length} chars from ${lines.length} lines`);
      return code;
    }

    return null;
  }

  /**
   * Extract code from a cell
   */
  function extractCodeFromCell(cell, cellIndex) {
    if (!cell) return null;

    log(`Processing cell ${cellIndex}...`);

    // Check if this is a code cell
    if (!isCodeCell(cell)) {
      log(`  ⚠️ Skipping (not a code cell)`);
      return null;
    }

    // Get the editor (force render if needed)
    const editor = getEditorFromCell(cell);

    if (!editor) {
      log(`  ⚠️ No editor found`);
      return null;
    }

    const code = extractFromCodeMirror(editor);

    if (!code || code.trim().length === 0) {
      log(`  ⚠️ No code extracted`);
      return null;
    }

    return code;
  }

  /**
   * Gets all code cells with their content
   */
  function getAllCodeCells(root = document) {
    log("=== Getting all code cells ===");

    const cells = getAllCells(root);

    if (cells.length === 0) {
      log("⚠️ No cells found!");
      return [];
    }

    const codeCells = [];

    cells.forEach((cell, index) => {
      const code = extractCodeFromCell(cell, index);

      if (code && code.trim().length > 0) {
        // Get the editor again for the cell reference
        const editor = cell.querySelector(".cm-editor");

        codeCells.push({
          element: editor || cell, // Prefer editor, fallback to cell
          code: code,
          cellIndex: index,
        });
        log(`Cell ${index}: ✅ Added (${code.length} chars)`);
      } else {
        log(`Cell ${index}: ⚠️ Skipped`);
      }
    });

    log(`=== Result: ${codeCells.length} code cells ===`);
    return codeCells;
  }

  /**
   * Legacy: Get code cell containers (for compatibility)
   */
  function getCodeCellContainers(root = document) {
    log("getCodeCellContainers called (legacy method)");
    const cells = getAllCells(root);

    // Force render all cells
    cells.forEach((cell) => forceRenderCell(cell));

    // Return editors
    const editors = [];
    cells.forEach((cell) => {
      const editor = cell.querySelector(".cm-editor");
      if (editor && isCodeCell(cell)) {
        editors.push(editor);
      }
    });

    log(`Returning ${editors.length} editors`);
    return editors;
  }

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

  function getNotebookMetadata() {
    const cells = getAllCodeCells();
    return {
      theme: detectTheme(),
      collapsibleEnabled: isCollapsibleEnabled(),
      mode: detectNotebookMode(),
      cellCount: cells.length,
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
    forceRenderCell, // Export for manual use
    getAllCells, // Export for debugging
  };
})();

if (typeof window !== "undefined") {
  window.KaggleDomParser = KaggleDomParser;
}
