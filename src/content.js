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
  let isLinting = false;
  const DEBUG = false;

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
   * Inject the page script into a specific document
   * @param {Document} targetDocument - The document to inject into
   * @param {string} suffix - Suffix for the script ID to allow multiple injections
   */
  function injectIntoDocument(targetDocument, suffix = "") {
    const scriptId = "kaggle-linter-page-script" + suffix;

    // Check if already injected
    if (targetDocument.getElementById(scriptId)) {
      log(`Page script already injected into ${suffix || "main"} document`);
      return;
    }

    const script = targetDocument.createElement("script");
    script.id = scriptId;

    // Try to load from extension URL
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.getURL
    ) {
      script.src = chrome.runtime.getURL("src/pageInjection.js");
    } else {
      // Inline the script for environments without chrome.runtime
      script.textContent = getPageInjectionCode();
    }

    script.onload = function () {
      log(`✅ Page script loaded successfully in ${suffix || "main"} document`);
    };

    script.onerror = function () {
      log(
        `⚠️ Failed to load page script from URL in ${
          suffix || "main"
        } document, using inline`
      );
      const inlineScript = targetDocument.createElement("script");
      inlineScript.id = scriptId;
      inlineScript.textContent = getPageInjectionCode();
      (targetDocument.head || targetDocument.documentElement).appendChild(
        inlineScript
      );
    };

    (targetDocument.head || targetDocument.documentElement).appendChild(script);
  }

  /**
   * Recursively inject page script into all accessible iframes
   * @param {Document} rootDocument - The root document to start from
   * @param {string} prefix - Prefix for tracking injection depth
   */
  function injectIntoFramesRecursively(rootDocument, prefix = "") {
    const iframes = rootDocument.querySelectorAll("iframe");
    log(`🔍 Found ${iframes.length} iframes in ${prefix || "main"} document`);

    iframes.forEach((iframe, index) => {
      const frameName = iframe.name || iframe.id || `frame-${index}`;
      const suffix = `${prefix}-${frameName}`;
      log(`➡️ Injecting into iframe: ${frameName}`);

      try {
        // Try to access the iframe's document (same-origin only)
        const iframeDoc =
          iframe.contentDocument ||
          (iframe.contentWindow && iframe.contentWindow.document);

        if (iframeDoc) {
          log(`📄 Injecting into iframe: ${frameName}`);
          injectIntoDocument(iframeDoc, suffix);

          // Recursively inject into nested iframes
          injectIntoFramesRecursively(iframeDoc, suffix);
        } else {
          log(
            `⚠️ Cannot access iframe document for ${frameName} (cross-origin or not loaded)`
          );
        }
      } catch (e) {
        // Cross-origin iframe - can't access directly
        // The content script with all_frames: true should handle this
        log(`⚠️ Cross-origin iframe ${frameName}: ${e.message}`);
      }
    });
  }

  /**
   * Fallback method: Inject script tag into the page and all accessible iframes
   */
  function injectPageScriptFallback() {
    log("🔧 Using script tag injection fallback...");

    // Inject into the current document
    injectIntoDocument(window.document);

    // Recursively inject into all accessible iframes
    injectIntoFramesRecursively(window.document);

    // Also set up an observer to inject into dynamically added iframes
    setupIframeObserver();
  }

  /**
   * Set up a MutationObserver to watch for dynamically added iframes
   */
  let iframeObserver = null;
  function setupIframeObserver() {
    if (iframeObserver) {
      iframeObserver.disconnect();
    }

    iframeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is an iframe (use nodeName for robustness)
            if (node.nodeName.toLowerCase() === "iframe") {
              log("🆕 New iframe detected, waiting for load...");
              node.addEventListener("load", () => {
                injectIntoFrameElement(node);
              });
            }
            // Also check for iframes within added containers
            const iframes = node.querySelectorAll
              ? node.querySelectorAll("iframe")
              : [];
            iframes.forEach((iframe) => {
              log("🆕 New iframe in container detected, waiting for load...");
              if (iframe.contentDocument) {
                injectIntoFrameElement(iframe);
              } else {
                iframe.addEventListener("load", () => {
                  injectIntoFrameElement(iframe);
                });
              }
            });
          }
        });
      });
    });

    iframeObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    log("🔍 Iframe observer set up");
  }

  /**
   * Inject into a specific iframe element
   * @param {HTMLIFrameElement} iframe
   */
  function injectIntoFrameElement(iframe) {
    const frameName = iframe.name || iframe.id || "unnamed-frame";
    try {
      const iframeDoc =
        iframe.contentDocument ||
        (iframe.contentWindow && iframe.contentWindow.document);
      if (iframeDoc) {
        log(`📄 Injecting into dynamically added iframe: ${frameName}`);
        injectIntoDocument(iframeDoc, `-${frameName}`);
        injectIntoFramesRecursively(iframeDoc, `-${frameName}`);
      }
    } catch (e) {
      log(
        `⚠️ Cannot access dynamically added iframe ${frameName}: ${e.message}`
      );
    }
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
   * Listen for messages from the page injection script (including from iframes)
   */
  function setupPageMessageListener() {
    window.addEventListener("message", function (event) {
      if (event.data?.postmate) return; // Ignore Postmate messages
      if (event.data.source !== "pageInjection") return; // Ignore messages from self
      // ignore messages not coming from KAGGLE iframe
      if (!event.origin.includes("jupyter-proxy.kaggle.net")) return;

      // ignore incorrect structures
      if (!event.data || !event.data.type) return;
      log("📨 MESSAGE:", event);

      if (
        event.data?.type === "KAGGLE_LINTER_READY" &&
        pageInjectionReady === false
      ) {
        log("🔥 GOT READY from page injection!");
        pageInjectionReady = true;

        if (pendingLintRequest) {
          pendingLintRequest = false;
          requestCodeFromPage();
        }
      }

      if (event.data?.type === "KAGGLE_LINTER_CODE") {
        log("📩 Received extracted code!", event.data.code);
        processExtractedCode(event.data.code);
      }
    });
  }

  /**
   * Request code extraction from the page injection script (and all iframes)
   */
  function requestCodeFromPage() {
    log("📤 Requesting code extraction from page and iframes...");

    // Request from main window
    window.postMessage(
      { type: "KAGGLE_LINTER_REQUEST", source: "requestCodeFromPage" },
      "*"
    );
  }

  /**
   * Process code extracted from the page injection script
   * Uses CodeMirror to maintain local copies of cells for reliable linting
   * even when Kaggle lazy-loads or unloads cells
   * @param {Array<{code: string, cellIndex: number, uuid: string|null}>} extractedCode
   */

  let code_hash = null;
  let last_processed_time = 0;
  function processExtractedCode(extractedCode) {
    log("Processing extracted code:", extractedCode.length, "cells");
    
    // Use CodeMirror to merge extracted cells with stored cells
    // This handles cases where Kaggle has unloaded some cells
    let cellsToLint = extractedCode;
    
    if (typeof CodeMirror !== "undefined" && typeof CodeMirror.getMergedCells === "function") {
      // Merge extracted cells with stored cells from CodeMirror
      // This ensures we still have code from cells that may have been unloaded
      cellsToLint = CodeMirror.getMergedCells(extractedCode);
      log(`CodeMirror: ${CodeMirror.getCellCount()} cells stored, ${cellsToLint.length} cells to lint`);
    }
    
    const new_hash = JSON.stringify(cellsToLint);
    const now = Date.now();
    if (new_hash === code_hash && now - last_processed_time < 600) {
      return;
    }
    code_hash = new_hash;
    last_processed_time = now;
    
    if (cellsToLint.length === 0) {
      log("No code cells found from page injection");
      // Fall back to DOM-based extraction
      runLinterWithDomFallback();
      return;
    }

    // Convert to the format expected by LintEngine
    const codeCells = cellsToLint.map((item) => ({
      code: item.code,
      cellIndex: item.cellIndex,
      element: findCellElement(item.cellIndex, item.uuid),
    }));

    runLinterOnCells(codeCells);
  }

  /**
   * Find the DOM element for a cell by index or UUID (searches main document and iframes)
   * @param {number} cellIndex
   * @param {string|null} uuid
   * @returns {Element|null}
   */
  function findCellElement(cellIndex, uuid) {
    // First search in main document
    let element = findCellElementInDocument(document, cellIndex, uuid);
    if (element) {
      return element;
    }

    // Then search in iframes
    return findCellElementInIframes(document, cellIndex, uuid);
  }

  /**
   * Find cell element in a specific document
   * @param {Document} doc
   * @param {number} cellIndex
   * @param {string|null} uuid
   * @returns {Element|null}
   */
  function findCellElementInDocument(doc, cellIndex, uuid) {
    if (uuid) {
      const cellByUuid = doc.querySelector(`[data-uuid="${uuid}"]`);
      if (cellByUuid) {
        return cellByUuid.querySelector(".cm-editor") || cellByUuid;
      }
    }

    const cells = doc.querySelectorAll(".jp-Cell");
    if (cells[cellIndex]) {
      return cells[cellIndex].querySelector(".cm-editor") || cells[cellIndex];
    }

    return null;
  }

  /**
   * Recursively search for cell element in iframes
   * @param {Document} rootDocument
   * @param {number} cellIndex
   * @param {string|null} uuid
   * @returns {Element|null}
   */
  function findCellElementInIframes(rootDocument, cellIndex, uuid) {
    const iframes = rootDocument.querySelectorAll("iframe");

    for (const iframe of iframes) {
      try {
        const iframeDoc =
          iframe.contentDocument ||
          (iframe.contentWindow && iframe.contentWindow.document);
        if (iframeDoc) {
          // Search in this iframe's document
          const element = findCellElementInDocument(iframeDoc, cellIndex, uuid);
          if (element) {
            return element;
          }

          // Recursively search in nested iframes
          const nestedElement = findCellElementInIframes(
            iframeDoc,
            cellIndex,
            uuid
          );
          if (nestedElement) {
            return nestedElement;
          }
        }
      } catch (e) {
        // Cross-origin iframe, can't access
      }
    }

    return null;
  }

  /**
   * Run the linter on extracted code cells
   * @param {Array<{code: string, cellIndex: number, element: Element|null}>} codeCells
   */
  async function runLinterOnCells(codeCells) {
    log(`Running linter on ${codeCells.length} code cells`);

    if (codeCells.length === 0) {
      log("No code cells to lint");
      LintOverlay.displayErrors([], { bySeverity: {} });
      return;
    }

    // Check which linter engine to use
    const useFlake8 = linterSettings && linterSettings.linterEngine === "flake8";
    
    let errors;
    let stats;
    
    if (useFlake8 && typeof Flake8Engine !== "undefined") {
      log("Using Flake8 linter engine");
      try {
        // Show loading indicator
        if (!Flake8Engine.getIsReady()) {
          log("Loading Flake8 engine...");
        }
        
        errors = await Flake8Engine.lintNotebook(codeCells);
        stats = Flake8Engine.getStats(errors);
      } catch (error) {
        log("Flake8 error, falling back to built-in:", error);
        errors = LintEngine.lintNotebook(codeCells);
        stats = LintEngine.getStats(errors);
      }
    } else {
      log("Using built-in linter engine");
      errors = LintEngine.lintNotebook(codeCells);
      
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
      
      stats = LintEngine.getStats(errors);
    }

    errors.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.line - b.line;
    });

    log(`Found ${errors.length} issues:`, stats);

    LintOverlay.displayErrors(errors, stats);
    LintOverlay.addInlineMarkers(errors, codeCells);
    LintOverlay.showOverlay();
  }

  /**
   * Fallback: Run linter using DOM-based extraction (including iframes)
   */
  function runLinterWithDomFallback() {
    log("Using DOM-based extraction fallback...");

    // Force render cells in main document
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
      const codeCells = getAllCodeCellsIncludingIframes(document);
      log(`Found ${codeCells.length} code cells via DOM (including iframes)`);

      if (codeCells.length === 0) {
        log("No code cells found via DOM either");
        LintOverlay.displayErrors([], { bySeverity: {} });
        return;
      }

      runLinterOnCells(codeCells);
    }, 200);
  }

  /**
   * Get all code cells from a document and its iframes recursively
   * @param {Document} rootDocument
   * @returns {Array<{element: Element, code: string, cellIndex: number}>}
   */
  function getAllCodeCellsIncludingIframes(rootDocument) {
    let allCells = [];

    // Get cells from main document
    const mainCells = KaggleDomParser.getAllCodeCells(rootDocument);
    allCells = allCells.concat(mainCells);

    // Get cells from iframes (recursively handled within each iframe)
    const iframes = rootDocument.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        const iframeDoc =
          iframe.contentDocument ||
          (iframe.contentWindow && iframe.contentWindow.document);
        if (iframeDoc) {
          // Recursively get cells from this iframe and its nested iframes
          const iframeCells = getAllCodeCellsIncludingIframes(iframeDoc);
          log(
            `Found ${iframeCells.length} code cells in iframe: ${
              iframe.name || iframe.id || "unnamed"
            }`
          );
          allCells = allCells.concat(iframeCells);
        }
      } catch (e) {
        // Cross-origin iframe, can't access
        log(`⚠️ Cannot access iframe for DOM extraction: ${e.message}`);
      }
    });

    return allCells;
  }

  function forceRenderAllCells() {
    log("🔄 Forcing cells to render...");

    // Force render in main document
    forceRenderCellsInDocument(document);

    // Force render in iframes
    forceRenderCellsInIframes(document);

    log("✅ Finished forcing cell renders");
  }

  /**
   * Force render cells in a specific document
   * @param {Document} doc
   */
  function forceRenderCellsInDocument(doc) {
    const cells = doc.querySelectorAll(".jp-Cell");
    log(`Found ${cells.length} .jp-Cell elements in document`);

    if (cells.length === 0) {
      log("⚠️ No cells found to render in this document");
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
  }

  /**
   * Recursively force render cells in all accessible iframes
   * @param {Document} rootDocument
   */
  function forceRenderCellsInIframes(rootDocument) {
    const iframes = rootDocument.querySelectorAll("iframe");

    iframes.forEach((iframe) => {
      try {
        const iframeDoc =
          iframe.contentDocument ||
          (iframe.contentWindow && iframe.contentWindow.document);
        if (iframeDoc) {
          log(
            `Forcing render in iframe: ${iframe.name || iframe.id || "unnamed"}`
          );
          forceRenderCellsInDocument(iframeDoc);
          forceRenderCellsInIframes(iframeDoc);
        }
      } catch (e) {
        // Cross-origin iframe, can't access
      }
    });
  }

  async function initialize() {
    if (isInitialized) {
      return;
    }

    log("Initializing...");

    await loadSettings();
    log("Settings loaded");
    setupMessageListener();
    log("Message listener set up");
    setupPageMessageListener();
    log("Page message listener set up");
    LintEngine.initializeRules();
    log("Lint engine initialized");

    const metadata = KaggleDomParser.getNotebookMetadata();
    log("Notebook metadata:", metadata);

    LintOverlay.setTheme(metadata.theme);

    // Inject page script for CodeMirror access
    if (window !== window.top) {
      // injectPageScriptFallback();
    } else {
      log("⚠️ Skipping page injection in main window");
    }

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
    if (isLinting) {
      return;
    }
    log("Running lint...");

    isLinting = true; // Set flag before linting

    // Try page injection first for reliable CodeMirror access
    if (pageInjectionReady) {
      requestCodeFromPage();
    } else {
      log("Page injection not ready, marking pending request");
      pendingLintRequest = true;
    }

    // Reset flag after a delay
    setTimeout(() => {
      isLinting = false;
    }, 500);
  }

  function setupMutationObserver() {
    if (observer) observer.disconnect();

    const debounce = (fn, delay) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
      };
    };

    const debouncedLint = debounce(() => {
      runLinter();
    }, 1500); // Increased debounce time

    isLinting = false; // Prevent re-triggering during lint

    observer = new MutationObserver((mutations) => {
      // Skip if we're currently linting
      if (isLinting) return;

      const triggered = mutations.some((mutation) => {
        // Ignore changes to overlay elements
        const target = mutation.target;
        if (target.nodeType === Node.ELEMENT_NODE) {
          if (target.closest?.("#kaggle-lint-overlay, .kaggle-lint-marker")) {
            return false;
          }
        }
        if (
          target.parentElement?.closest?.(
            "#kaggle-lint-overlay, .kaggle-lint-marker"
          )
        ) {
          return false;
        }

        // 1) Pure typing inside CodeMirror
        if (mutation.type === "characterData") {
          if (
            mutation.target.parentElement?.closest(
              ".cm-editor, .cm-line, .cm-content"
            )
          ) {
            return true;
          }
        }

        // 2) Cell structure changes (add/remove cells or editors)
        if (mutation.type === "childList") {
          const added = Array.from(mutation.addedNodes).some(
            (node) =>
              node.nodeType === 1 &&
              (node.classList?.contains("jp-Cell") ||
                node.classList?.contains("cm-editor") ||
                node.closest?.(".jp-Notebook"))
          );
          if (added) return true;

          const removed = Array.from(mutation.removedNodes).some(
            (node) =>
              node.nodeType === 1 &&
              (node.classList?.contains("jp-Cell") ||
                node.classList?.contains("cm-editor"))
          );
          if (removed) return true;
        }

        return false;
      });

      if (triggered) {
        debouncedLint();
      }
    });

    // Only observe the notebook container, not the entire body
    const notebookContainer =
      document.querySelector(".jp-Notebook, .jp-NotebookPanel") ||
      document.body;

    observer.observe(notebookContainer, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: false, // Don't need old values
    });

    log("🔥 Mutation observer set up with spam prevention");
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
    const maxAttempts = 20; // 20 seconds

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
  if (window === window.top) return;

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
