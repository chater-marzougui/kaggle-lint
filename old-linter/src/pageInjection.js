/**
 * Kaggle Python Linter - Page Injection Script
 * Runs in the page's MAIN world to access CodeMirror state directly
 * This bypasses the isolated world limitation of content scripts
 */

(function () {
  "use strict";

  const DEBUG = true;

  function log(...args) {
    if (DEBUG) {
      console.log("[Kaggle Linter PageInjection]", ...args);
    }
  }

  /**
   * Extract all code from CodeMirror editors in the page
   * @returns {Array<{code: string, cellIndex: number, uuid: string|null}>}
   */
  window.KAGGLE_LINTER_EXTRACT = async function () {
    
    log("🔍 Extracting code via DOM lines...");

    const results = [];

    // First get ALL cells to establish proper indices
    // This is important for Kaggle's virtualized rendering
    const allCells = document.querySelectorAll(".jp-Cell");
    log(`Found ${allCells.length} total cells in notebook`);
    
    // Create a map of cell elements to their actual index
    const cellIndexMap = new Map();
    allCells.forEach((cell, index) => {
      cellIndexMap.set(cell, index);
    });

    // Get all code editors that are actually code cells
    const editors = document.querySelectorAll(".jp-CodeCell .cm-editor");
    log(`Found ${editors.length} code editors`);

    for (let i = 0; i < editors.length; i++) {
      let editor = editors[i];

      // extract code via DOM
      const lines = editor.querySelectorAll(".cm-line");
      log(`Editor ${i}: ${lines.length} lines`);

      if (lines.length > 0) {
        const code = [...lines].map((line) => line.textContent).join("\n");

        if (code.trim().length > 0) {
          const cell = editor.closest(".jp-Cell");
          const uuid = cell?.getAttribute("data-uuid") || null;
          
          // Get the actual cell index from the notebook structure
          // This ensures proper indexing even with virtualized rendering
          const actualCellIndex = cellIndexMap.has(cell) ? cellIndexMap.get(cell) : i;

          results.push({
            code,
            cellIndex: actualCellIndex,
            uuid,
          });

          log(`Editor ${i}: ✅ extracted ${code.length} chars (cellIndex: ${actualCellIndex})`);
        } else {
          log(`Editor ${i}: ⚠️ empty`);
        }
      } else {
        log(`Editor ${i}: ⚠️ no .cm-line (not rendered yet)`);
      }
    }

    log(`📊 DONE — extracted ${results.length} code blocks`);

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
    // Only accept messages from the window itself
    if (event.data?.source === "pageInjection") {
      return;
    }
    if (event.data?.postmate) {
      return; // Ignore Postmate messages
    }
    
    log("📩 PAGE INJECTION GOT MESSAGE:", event);

    if (event.data && event.data.type === "KAGGLE_LINTER_REQUEST") {
      log("📩 Received extraction request");
      window.KAGGLE_LINTER_EXTRACT();
    }

    if (event.data && event.data.type === "KAGGLE_LINTER_DIAGNOSE_REQUEST") {
      log("📩 Received diagnostics request");
      window.KAGGLE_LINTER_DIAGNOSE();
    }
  });

  function sendReadyMessage() {
    log("SENDING READY from ORIGIN:", window.origin);
    window.postMessage(
      {
        type: "KAGGLE_LINTER_READY",
        source: "pageInjection",
      },
      "*"
    );
  }

  log("✅ Page injection script loaded");

  setTimeout(() => {
    sendReadyMessage();
  }, 6000);
})();
