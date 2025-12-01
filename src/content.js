/**
 * Kaggle Python Linter - Content Script
 * Uses page injection to access CodeMirror state from cross-origin iframes
 * Supports both direct DOM access and MAIN world injection for iframe content
 */

(function () {
  "use strict";

  let isInitialized = false;
  let observer = null;
  let linterSettings = null;
  let pageInjectionReady = false;
  let pendingLintRequest = false;
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) {
      console.log("[Kaggle Linter]", ...args);
    }
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.sync.get(["linterSettings"], (result) => {
          if (result.linterSettings) {
            linterSettings = result.linterSettings;
            log("Loaded settings:", linterSettings);
          }
          resolve(linterSettings);
        });
      } else {
        resolve(null);
      }
    });
  }

  function setupMessageListener() {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        log("Received message:", message);

        if (message.type === "runLinter") {
          runLinter();
          sendResponse({ success: true });
        } else if (message.type === "toggleOverlay") {
          if (LintOverlay.isOverlayVisible()) {
            LintOverlay.hideOverlay();
          } else {
            LintOverlay.showOverlay();
          }
          sendResponse({ success: true });
        } else if (message.type === "settingsChanged") {
          linterSettings = message.settings;
          log("Settings updated:", linterSettings);
          runLinter();
          sendResponse({ success: true });
        }

        return true;
      });
    }
  }

  /**
   * Inject the page script into the MAIN world to access CodeMirror state
   * This bypasses the isolated world limitation of content scripts
   */
  function injectPageScript() {
    log("🔧 Injecting page script into MAIN world...");
    injectPageScriptFallback();
  }

  /**
   * Fallback method: Inject script tag into the page
   */
  function injectPageScriptFallback() {
    log("🔧 Using script tag injection fallback...");

    // Check if already injected
    if (document.getElementById("kaggle-linter-page-script")) {
      log("Page script already injected");
      return;
    }

    const script = document.createElement("script");
    script.id = "kaggle-linter-page-script";

    // Try to load from extension URL
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      script.src = chrome.runtime.getURL("src/pageInjection.js");
    } else {
      // Inline the script for environments without chrome.runtime
      script.textContent = getPageInjectionCode();
    }

    script.onload = function () {
      log("✅ Page script loaded successfully");
    };

    script.onerror = function () {
      log("⚠️ Failed to load page script from URL, using inline");
      const inlineScript = document.createElement("script");
      inlineScript.id = "kaggle-linter-page-script";
      inlineScript.textContent = getPageInjectionCode();
      (document.head || document.documentElement).appendChild(inlineScript);
    };

    (document.head || document.documentElement).appendChild(script);
  }

  /**
   * Returns the inline page injection code for fallback
   */
  function getPageInjectionCode() {
    return `
(function() {
  "use strict";
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log("[Kaggle Linter PageInjection]", ...args);
  }

  function extractFromCodeMirror(editorElement) {
    if (!editorElement) return null;
    const view = editorElement.cmView || editorElement.view || editorElement.editorView || editorElement.CodeMirror;
    if (view && view.state && view.state.doc) {
      const code = view.state.doc.toString();
      if (code.length > 0) {
        log("Extracted " + code.length + " chars via CM6 API");
        return code;
      }
    }
    let parent = editorElement.parentElement;
    while (parent) {
      const parentView = parent.cmView || parent.view || parent.editorView || parent.CodeMirror;
      if (parentView && parentView.state && parentView.state.doc) {
        const code = parentView.state.doc.toString();
        if (code.length > 0) return code;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  function isCodeCell(cell) {
    if (cell.classList.contains("jp-MarkdownCell")) return false;
    return cell.classList.contains("jp-CodeCell");
  }

  window.KAGGLE_LINTER_EXTRACT = function() {
    log("Extracting code from page...");
    const results = [];
    const cells = document.querySelectorAll(".jp-Cell");
    log("Found " + cells.length + " .jp-Cell elements");

    if (cells.length > 0) {
      cells.forEach((cell, index) => {
        if (!isCodeCell(cell)) return;
        const editor = cell.querySelector(".cm-editor");
        if (editor) {
          const code = extractFromCodeMirror(editor);
          if (code && code.trim().length > 0) {
            const uuid = cell.getAttribute("data-uuid") || null;
            results.push({ code: code, cellIndex: index, uuid: uuid });
          }
        }
      });
    }

    if (results.length === 0) {
      const editors = document.querySelectorAll(".cm-editor");
      editors.forEach((editor, index) => {
        const code = extractFromCodeMirror(editor);
        if (code && code.trim().length > 0) {
          results.push({ code: code, cellIndex: index, uuid: null });
        }
      });
    }

    log("Total: " + results.length + " code blocks extracted");
    window.postMessage({ type: "KAGGLE_LINTER_CODE", code: results, source: "pageInjection" }, "*");
    return results;
  };

  window.addEventListener("message", function(event) {
    if (event.source !== window) return;
    if (event.data && event.data.type === "KAGGLE_LINTER_REQUEST") {
      window.KAGGLE_LINTER_EXTRACT();
    }
  });

  log("Page injection script loaded");
  window.postMessage({ type: "KAGGLE_LINTER_READY", source: "pageInjection" }, "*");
})();
    `;
  }

  /**
   * Listen for messages from the page injection script
   */
  function setupPageMessageListener() {
    window.addEventListener("message", function (event) {
      // Only accept messages from the same window
      if (event.source !== window) {
        return;
      }

      if (event.data && event.data.type === "KAGGLE_LINTER_READY") {
        log("📩 Page injection script is ready");
        pageInjectionReady = true;

        // If there was a pending lint request, run it now
        if (pendingLintRequest) {
          pendingLintRequest = false;
          requestCodeFromPage();
        }
      }

      if (event.data && event.data.type === "KAGGLE_LINTER_CODE") {
        log("📩 Received code from page injection:", event.data.code.length, "cells");
        processExtractedCode(event.data.code);
      }

      if (event.data && event.data.type === "KAGGLE_LINTER_DIAGNOSTICS") {
        log("📊 Diagnostics from page:", event.data.diagnostics);
      }
    });
  }

  /**
   * Request code extraction from the page injection script
   */
  function requestCodeFromPage() {
    log("📤 Requesting code extraction from page...");
    window.postMessage({ type: "KAGGLE_LINTER_REQUEST" }, "*");
  }

  /**
   * Process code extracted from the page injection script
   * @param {Array<{code: string, cellIndex: number, uuid: string|null}>} extractedCode
   */
  function processExtractedCode(extractedCode) {
    log("Processing extracted code:", extractedCode.length, "cells");

    if (extractedCode.length === 0) {
      log("No code cells found from page injection");
      // Fall back to DOM-based extraction
      runLinterWithDomFallback();
      return;
    }

    // Convert to the format expected by LintEngine
    const codeCells = extractedCode.map((item) => ({
      code: item.code,
      cellIndex: item.cellIndex,
      element: findCellElement(item.cellIndex, item.uuid),
    }));

    runLinterOnCells(codeCells);
  }

  /**
   * Find the DOM element for a cell by index or UUID
   * @param {number} cellIndex
   * @param {string|null} uuid
   * @returns {Element|null}
   */
  function findCellElement(cellIndex, uuid) {
    if (uuid) {
      const cellByUuid = document.querySelector(`[data-uuid="${uuid}"]`);
      if (cellByUuid) {
        return cellByUuid.querySelector(".cm-editor") || cellByUuid;
      }
    }

    const cells = document.querySelectorAll(".jp-Cell");
    if (cells[cellIndex]) {
      return cells[cellIndex].querySelector(".cm-editor") || cells[cellIndex];
    }

    return null;
  }

  /**
   * Run the linter on extracted code cells
   * @param {Array<{code: string, cellIndex: number, element: Element|null}>} codeCells
   */
  function runLinterOnCells(codeCells) {
    log(`Running linter on ${codeCells.length} code cells`);

    if (codeCells.length === 0) {
      log("No code cells to lint");
      LintOverlay.displayErrors([], { bySeverity: {} });
      return;
    }

    let errors = LintEngine.lintNotebook(codeCells);

    if (linterSettings && linterSettings.rules) {
      const enabledRules = linterSettings.rules;
      errors = errors.filter((error) => {
        const isEnabled = enabledRules[error.rule] !== false;
        if (!isEnabled) {
          log(`Filtering out error from disabled rule: ${error.rule}`);
        }
        return isEnabled;
      });
    }

    errors.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.line - b.line;
    });

    const stats = LintEngine.getStats(errors);
    log(`Found ${errors.length} issues:`, stats);

    LintOverlay.displayErrors(errors, stats);
    LintOverlay.addInlineMarkers(errors);
    LintOverlay.showOverlay();
  }

  /**
   * Fallback: Run linter using DOM-based extraction
   */
  function runLinterWithDomFallback() {
    log("Using DOM-based extraction fallback...");

    const cells = document.querySelectorAll(".jp-Cell");
    if (cells.length > 0) {
      cells.forEach((cell) => {
        if (typeof cell.scrollIntoView === "function") {
          cell.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
      });
      if (cells[0] && typeof cells[0].scrollIntoView === "function") {
        cells[0].scrollIntoView({ block: "start", behavior: "instant" });
      }
    }

    setTimeout(() => {
      const codeCells = KaggleDomParser.getAllCodeCells(document);
      log(`Found ${codeCells.length} code cells via DOM`);

      if (codeCells.length === 0) {
        log("No code cells found via DOM either");
        LintOverlay.displayErrors([], { bySeverity: {} });
        return;
      }

      runLinterOnCells(codeCells);
    }, 200);
  }

  function forceRenderAllCells() {
    log("🔄 Forcing cells to render...");

    const cells = document.querySelectorAll(".jp-Cell");
    log(`Found ${cells.length} .jp-Cell elements`);

    if (cells.length === 0) {
      log("⚠️ No cells found to render");
      return;
    }

    cells.forEach((cell) => {
      if (typeof cell.scrollIntoView === "function") {
        cell.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    });

    if (cells[0] && typeof cells[0].scrollIntoView === "function") {
      cells[0].scrollIntoView({ block: "start", behavior: "instant" });
    }

    log("✅ Finished forcing cell renders");
  }

  async function initialize() {
    if (isInitialized) {
      return;
    }

    log("Initializing...");

    await loadSettings();
    setupMessageListener();
    setupPageMessageListener();
    LintEngine.initializeRules();

    const metadata = KaggleDomParser.getNotebookMetadata();
    log("Notebook metadata:", metadata);

    LintOverlay.setTheme(metadata.theme);

    // Inject page script for CodeMirror access
    injectPageScriptFallback();

    forceRenderAllCells();

    setTimeout(() => {
      runLinter();
      setupMutationObserver();
      setupKeyboardShortcuts();

      isInitialized = true;
      log("Initialized successfully");
    }, 500);
  }

  function runLinter() {
    log("Running lint...");

    // Try page injection first for reliable CodeMirror access
    if (pageInjectionReady) {
      requestCodeFromPage();
    } else {
      log("Page injection not ready, marking pending request");
      pendingLintRequest = true;

      // Also try DOM fallback after a delay
      setTimeout(() => {
        if (pendingLintRequest) {
          log("Page injection still not ready, using DOM fallback");
          pendingLintRequest = false;
          runLinterWithDomFallback();
        }
      }, 1000);
    }
  }

  function setupMutationObserver() {
    if (observer) {
      observer.disconnect();
    }

    const debounce = (fn, delay) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
      };
    };

    const debouncedLint = debounce(() => {
      const metadata = KaggleDomParser.getNotebookMetadata();
      LintOverlay.setTheme(metadata.theme);
      runLinter();
    }, 1000);

    observer = new MutationObserver((mutations) => {
      const relevantMutation = mutations.some((mutation) => {
        if (mutation.type === "characterData") {
          return true;
        }

        if (mutation.type === "childList") {
          const addedRelevant = Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;

            if (node.classList?.contains("cm-editor")) {
              log("✨ New .cm-editor detected!");
              return true;
            }

            if (
              node.querySelectorAll &&
              node.querySelectorAll(".cm-editor").length > 0
            ) {
              log("✨ Container with .cm-editor added!");
              return true;
            }

            return (
              node.matches &&
              (node.matches('[class*="cell"]') ||
                node.matches('[class*="code"]') ||
                node.matches('[class*="jp-"]') ||
                node.matches('[class*="cm-"]'))
            );
          });

          if (addedRelevant) return true;
        }

        if (mutation.type === "attributes") {
          if (
            mutation.attributeName === "class" ||
            mutation.attributeName === "data-theme"
          ) {
            return true;
          }
        }

        return false;
      });

      if (relevantMutation) {
        debouncedLint();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    log("Mutation observer set up");
  }

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        runLinter();
      }

      if (e.ctrlKey && e.shiftKey && e.key === "H") {
        e.preventDefault();
        if (LintOverlay.isOverlayVisible()) {
          LintOverlay.hideOverlay();
        } else {
          LintOverlay.showOverlay();
        }
      }
    });

    log("Keyboard shortcuts set up");
  }

  window.runLinter = runLinter;

  /**
   * Wait for JupyterLab app OR notebook panel, including iframe detection
   */
  function waitForNotebook() {
    log("🔍 Waiting for Kaggle/JupyterLab to initialize...");

    let attemptCount = 0;
    const maxAttempts = 60; // 60 seconds

    const checkInterval = setInterval(() => {
      attemptCount++;

      // Method 1: Check for JupyterLab app in window
      const hasJupyterApp = window.jupyterapp || window.jupyterlab;

      // Method 2: Check for notebook panel
      const notebookPanel = document.querySelector(".jp-NotebookPanel");

      // Method 3: Check for notebook container + cells
      const notebook = document.querySelector(".jp-Notebook");
      const cells = document.querySelectorAll(".jp-Cell");

      // Method 4: Check for editors directly
      const editors = document.querySelectorAll(".cm-editor");

      // Method 5: Check for notebook editor iframe
      const notebookIframe = document.querySelector(
        'iframe[name="notebook-editor-cells"], iframe[src*="kaggle"]'
      );

      log(`Attempt ${attemptCount}/${maxAttempts}:`, {
        jupyterApp: !!hasJupyterApp,
        notebookPanel: !!notebookPanel,
        notebook: !!notebook,
        cells: cells.length,
        editors: editors.length,
        iframe: !!notebookIframe,
      });

      // Success criteria: editors exist OR (notebook + cells exist) OR we're inside an iframe
      const isInIframe = window !== window.top;
      if (
        editors.length > 0 ||
        (notebook && cells.length > 0) ||
        (isInIframe && cells.length > 0)
      ) {
        log(
          `✅ Notebook ready! Editors: ${editors.length}, Cells: ${cells.length}, InIframe: ${isInIframe}`
        );
        clearInterval(checkInterval);

        // Wait a bit longer for everything to stabilize
        setTimeout(initialize, 1500);
      } else if (attemptCount >= maxAttempts) {
        log(`❌ Timeout after ${maxAttempts} attempts`);
        log("Debug info:", {
          jupyterApp: !!hasJupyterApp,
          notebookPanel: !!notebookPanel,
          url: window.location.href,
          isInIframe: isInIframe,
        });
        clearInterval(checkInterval);

        // Still try to initialize - might work with page injection
        initialize();
      }
    }, 1000);
  }

  // Start detection
  log("🚀 Kaggle Linter extension loaded");
  log("URL:", window.location.href);
  log("Is in iframe:", window !== window.top);

  if (document.readyState === "loading") {
    log("Document still loading...");
    document.addEventListener("DOMContentLoaded", () => {
      log("DOMContentLoaded fired");
      waitForNotebook();
    });
  } else {
    log("Document already loaded");
    waitForNotebook();
  }
})();
