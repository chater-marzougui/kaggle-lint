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

    log("⚠️✅  CM6 view found:", view);

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
        parent.cmView || parent.view || parent.editorView || parent.CodeMirror;
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
  window.KAGGLE_LINTER_EXTRACT = async function () {
    log("🔍 Extracting code via DOM lines...");

    const results = [];

    // get all code editors that are actually code cells
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

          results.push({
            code,
            cellIndex: i,
            uuid,
          });

          log(`Editor ${i}: ✅ extracted ${code.length} chars`);
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
    window.parent.postMessage(
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

  setTimeout(() => {
    sendReadyMessage();
  }, 9000);

  // Announce that the script is ready
  // window.postMessage(
  //   {
  //     type: "KAGGLE_LINTER_READY",
  //     source: "pageInjection",
  //   },
  //   "*"
  // );
})();
