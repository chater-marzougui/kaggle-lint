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
    return;
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
      // Accept messages from same window or from iframes
      const isFromSameWindow = event.source === window;
      const isFromIframe = isMessageFromIframe(event.source);

      if (!isFromSameWindow && !isFromIframe) {
        return;
      }

      if (event.data && event.data.type === "KAGGLE_LINTER_READY") {
        log(
          "📩 Page injection script is ready",
          isFromIframe ? "(from iframe)" : "(from main)"
        );
        pageInjectionReady = true;

        // If there was a pending lint request, run it now
        if (pendingLintRequest) {
          pendingLintRequest = false;
          requestCodeFromPage();
        }
      }

      if (event.data && event.data.type === "KAGGLE_LINTER_CODE") {
        if (event.data.code.length === 0) { return; }
        log(
          "📩 Received code from page injection:",
          event.data.code.length,
          "cells",
          isFromIframe ? "(from iframe)" : "(from main)"
        );
        processExtractedCode(event.data.code);
      }

      if (event.data && event.data.type === "KAGGLE_LINTER_DIAGNOSTICS") {
        log("📊 Diagnostics from page:", event.data.diagnostics);
      }
    });
  }

  /**
   * Check if a message source is from an iframe within our document
   * @param {Window} source - The message source window
   * @returns {boolean}
   */
  function isMessageFromIframe(source) {
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        if (iframe.contentWindow === source) {
          return true;
        }
        // Also check nested iframes
        try {
          const nestedIframes = iframe.contentDocument
            ? iframe.contentDocument.querySelectorAll("iframe")
            : [];
          for (const nested of nestedIframes) {
            if (nested.contentWindow === source) {
              return true;
            }
          }
        } catch (e) {
          // Cross-origin, ignore
        }
      }
    } catch (e) {
      // Error checking, ignore
    }
    return false;
  }

  /**
   * Request code extraction from the page injection script (and all iframes)
   */
  function requestCodeFromPage() {
    log("📤 Requesting code extraction from page and iframes...");

    // Request from main window
    window.postMessage({ type: "KAGGLE_LINTER_REQUEST" }, "*");

    // Also request from all accessible iframes
    requestCodeFromIframes(document);
  }

  /**
   * Recursively request code extraction from all accessible iframes
   * @param {Document} rootDocument
   */
  function requestCodeFromIframes(rootDocument) {
    const iframes = rootDocument.querySelectorAll("iframe");

    iframes.forEach((iframe) => {
      try {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow) {
          log(
            `📤 Requesting code from iframe: ${
              iframe.name || iframe.id || "unnamed"
            }`
          );
          iframeWindow.postMessage({ type: "KAGGLE_LINTER_REQUEST" }, "*");

          // Recursively request from nested iframes
          const iframeDoc = iframe.contentDocument;
          if (iframeDoc) {
            requestCodeFromIframes(iframeDoc);
          }
        }
      } catch (e) {
        // Cross-origin iframe - try to post message anyway
        log(`⚠️ Cross-origin iframe, attempting postMessage: ${e.message}`);
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(
              { type: "KAGGLE_LINTER_REQUEST" },
              "*"
            );
          }
        } catch (e2) {
          log(`⚠️ Cannot post message to iframe: ${e2.message}`);
        }
      }
    });
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
  if( window === window.top) return;
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
