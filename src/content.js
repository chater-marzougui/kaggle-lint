/**
 * Kaggle Python Linter - Content Script
 * Uses JupyterLab API for reliable notebook detection
 */

(function () {
  "use strict";

  let isInitialized = false;
  let observer = null;
  let linterSettings = null;
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

  function forceRenderAllCells() {
    log("🔄 Forcing cells to render...");

    const cells = document.querySelectorAll(".jp-Cell");
    log(`Found ${cells.length} .jp-Cell elements`);

    if (cells.length === 0) {
      log("⚠️ No cells found to render");
      return;
    }

    cells.forEach((cell, i) => {
      cell.scrollIntoView({ block: "nearest", behavior: "instant" });
    });

    if (cells[0]) {
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
    LintEngine.initializeRules();

    const metadata = KaggleDomParser.getNotebookMetadata();
    log("Notebook metadata:", metadata);

    LintOverlay.setTheme(metadata.theme);

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

    const cells = document.querySelectorAll(".jp-Cell");
    if (cells.length > 0) {
      cells.forEach((cell) => {
        cell.scrollIntoView({ block: "nearest", behavior: "instant" });
      });
      if (cells[0]) {
        cells[0].scrollIntoView({ block: "start", behavior: "instant" });
      }
    }

    setTimeout(() => {
      const codeCells = KaggleDomParser.getAllCodeCells(document);
      log(`Found ${codeCells.length} code cells`);

      if (codeCells.length === 0) {
        log("No code cells found");
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
    }, 200);
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
   * FINAL FIX: Wait for JupyterLab app OR notebook panel
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

      log(`Attempt ${attemptCount}/${maxAttempts}:`, {
        jupyterApp: !!hasJupyterApp,
        notebookPanel: !!notebookPanel,
        notebook: !!notebook,
        cells: cells.length,
        editors: editors.length,
      });

      // Success criteria: editors exist OR (notebook + cells exist)
      if (editors.length > 0 || (notebook && cells.length > 0)) {
        log(
          `✅ Notebook ready! Editors: ${editors.length}, Cells: ${cells.length}`
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
        });
        clearInterval(checkInterval);
      }
    }, 1000);
  }

  // Start detection
  log("🚀 Kaggle Linter extension loaded");
  log("URL:", window.location.href);

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
