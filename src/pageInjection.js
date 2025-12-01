/**
 * Kaggle Python Linter - Page Injection Script
 * Runs in the page's MAIN world to access CodeMirror state directly
 * This bypasses the isolated world limitation of content scripts
 */

(function () {
  "use strict";

  const DEBUG = false;

  function log(...args) {
    if (DEBUG) {
      console.log("[Kaggle Linter PageInjection]", ...args);
    }
  }

  /**
   * Extract code from a CodeMirror 6 editor element
   * @param {Element} editorElement - The .cm-editor element
   * @returns {string|null} - The code content or null if not accessible
   */
  function extractFromCodeMirror(editorElement) {
    if (!editorElement) {
      return null;
    }

    // Try to access CodeMirror 6 view state (most reliable method)
    const view =
      editorElement.cmView ||
      editorElement.view ||
      editorElement.editorView ||
      editorElement.CodeMirror;

    if (view && view.state && view.state.doc) {
      const code = view.state.doc.toString();
      if (code.length > 0) {
        log(`✅ Extracted ${code.length} chars via CM6 API`);
        return code;
      }
    }

    // Fallback: Try to find view in parent elements
    let parent = editorElement.parentElement;
    while (parent) {
      const parentView =
        parent.cmView ||
        parent.view ||
        parent.editorView ||
        parent.CodeMirror;
      if (parentView && parentView.state && parentView.state.doc) {
        const code = parentView.state.doc.toString();
        if (code.length > 0) {
          log(`✅ Extracted ${code.length} chars via parent CM6 API`);
          return code;
        }
      }
      parent = parent.parentElement;
    }

    log("⚠️ Could not access CodeMirror state");
    return null;
  }

  /**
   * Determine if a cell is a code cell (not markdown)
   * @param {Element} cell - The .jp-Cell element
   * @returns {boolean}
   */
  function isCodeCell(cell) {
    if (cell.classList.contains("jp-MarkdownCell")) {
      return false;
    }
    return cell.classList.contains("jp-CodeCell");
  }

  /**
   * Extract all code from CodeMirror editors in the page
   * @returns {Array<{code: string, cellIndex: number, uuid: string|null}>}
   */
  window.KAGGLE_LINTER_EXTRACT = function () {
    log("🔍 Extracting code from page...");

    const results = [];

    // Method 1: Find all .jp-Cell elements and extract from their editors
    const cells = document.querySelectorAll(".jp-Cell");
    log(`Found ${cells.length} .jp-Cell elements`);

    if (cells.length > 0) {
      cells.forEach((cell, index) => {
        if (!isCodeCell(cell)) {
          log(`Cell ${index}: Skipping (not a code cell)`);
          return;
        }

        const editor = cell.querySelector(".cm-editor");
        if (editor) {
          const code = extractFromCodeMirror(editor);
          if (code && code.trim().length > 0) {
            const uuid = cell.getAttribute("data-uuid") || null;
            results.push({
              code: code,
              cellIndex: index,
              uuid: uuid,
            });
            log(`Cell ${index}: ✅ Extracted ${code.length} chars`);
          } else {
            log(`Cell ${index}: ⚠️ No code extracted`);
          }
        } else {
          log(`Cell ${index}: ⚠️ No editor found`);
        }
      });
    }

    // Method 2: If no cells found, try finding editors directly
    if (results.length === 0) {
      log("No cells found, trying direct editor search...");
      const editors = document.querySelectorAll(".cm-editor");
      log(`Found ${editors.length} .cm-editor elements`);

      editors.forEach((editor, index) => {
        const code = extractFromCodeMirror(editor);
        if (code && code.trim().length > 0) {
          results.push({
            code: code,
            cellIndex: index,
            uuid: null,
          });
          log(`Editor ${index}: ✅ Extracted ${code.length} chars`);
        } else {
          log(`Editor ${index}: ⚠️ No code extracted`);
        }
      });
    }

    log(`📊 Total: ${results.length} code blocks extracted`);

    // Send results back via postMessage
    window.postMessage(
      {
        type: "KAGGLE_LINTER_CODE",
        code: results,
        source: "pageInjection",
      },
      "*"
    );

    return results;
  };

  /**
   * Get diagnostic information about the page structure
   * @returns {Object}
   */
  window.KAGGLE_LINTER_DIAGNOSE = function () {
    const diagnostics = {
      url: window.location.href,
      jupyterApp: !!(window.jupyterapp || window.jupyterlab),
      cellCount: document.querySelectorAll(".jp-Cell").length,
      codeCellCount: document.querySelectorAll(".jp-CodeCell").length,
      editorCount: document.querySelectorAll(".cm-editor").length,
      notebookPanel: !!document.querySelector(".jp-NotebookPanel"),
      notebook: !!document.querySelector(".jp-Notebook"),
      cmContent: document.querySelectorAll(".cm-content").length,
      cmLine: document.querySelectorAll(".cm-line").length,
    };

    log("📊 Diagnostics:", diagnostics);

    window.postMessage(
      {
        type: "KAGGLE_LINTER_DIAGNOSTICS",
        diagnostics: diagnostics,
        source: "pageInjection",
      },
      "*"
    );

    return diagnostics;
  };

  // Listen for extraction requests from content script
  window.addEventListener("message", function (event) {
    // Only accept messages from the same window
    if (event.source !== window) {
      return;
    }

    if (event.data && event.data.type === "KAGGLE_LINTER_REQUEST") {
      log("📩 Received extraction request");
      window.KAGGLE_LINTER_EXTRACT();
    }

    if (event.data && event.data.type === "KAGGLE_LINTER_DIAGNOSE_REQUEST") {
      log("📩 Received diagnostics request");
      window.KAGGLE_LINTER_DIAGNOSE();
    }
  });

  log("✅ Page injection script loaded");

  // Announce that the script is ready
  window.postMessage(
    {
      type: "KAGGLE_LINTER_READY",
      source: "pageInjection",
    },
    "*"
  );
})();
