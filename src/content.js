/**
 * Kaggle Python Linter - Content Script
 * Main entry point for the Chrome extension
 */

(function () {
  "use strict";

  let isInitialized = false;
  let observer = null;
  let linterSettings = null;
  const DEBUG = true; // Enable debug logging

  /**
   * Debug logging helper
   * @param {...any} args - Arguments to log
   */
  function log(...args) {
    if (DEBUG) {
      console.log("[Kaggle Linter]", ...args);
    }
  }

  /**
   * Load settings from Chrome storage
   */
  async function loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get(['linterSettings'], (result) => {
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

  /**
   * Listen for messages from popup
   */
  function setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        log("Received message:", message);
        
        if (message.type === 'runLinter') {
          runLinter();
          sendResponse({ success: true });
        } else if (message.type === 'toggleOverlay') {
          if (LintOverlay.isOverlayVisible()) {
            LintOverlay.hideOverlay();
          } else {
            LintOverlay.showOverlay();
          }
          sendResponse({ success: true });
        } else if (message.type === 'settingsChanged') {
          linterSettings = message.settings;
          log("Settings updated:", linterSettings);
          runLinter();
          sendResponse({ success: true });
        }
        
        return true; // Keep message channel open for async response
      });
    }
  }

  /**
   * Initializes the linter
   */
  async function initialize() {
    if (isInitialized) {
      return;
    }

    log("Initializing...");

    // Load settings first
    await loadSettings();

    // Setup message listener for popup communication
    setupMessageListener();

    LintEngine.initializeRules();

    const metadata = KaggleDomParser.getNotebookMetadata();
    log("Notebook metadata:", metadata);

    LintOverlay.setTheme(metadata.theme);

    runLinter();

    setupMutationObserver();

    setupKeyboardShortcuts();

    isInitialized = true;
    log("Initialized successfully");
  }

  /**
   * Runs the linter on all code cells
   */
  function runLinter() {
    log("Running lint...");

    const cells = KaggleDomParser.getAllCodeCells();
    log(`Found ${cells.length} code cells`);

    if (cells.length === 0) {
      log("No code cells found");
      LintOverlay.displayErrors([], { bySeverity: {} });
      return;
    }

    let errors = LintEngine.lintNotebook(cells);
    
    // Filter errors based on settings
    if (linterSettings && linterSettings.rules) {
      const enabledRules = linterSettings.rules;
      errors = errors.filter(error => {
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
   * Sets up mutation observer to watch for DOM changes
   */
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
            return (
              node.matches &&
              (node.matches('[class*="cell"]') ||
                node.matches('[class*="code"]') ||
                node.matches('[class*="CodeMirror"]') ||
                node.matches('[class*="monaco"]') ||
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

  /**
   * Sets up keyboard shortcuts
   */
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

  if (document.readyState === "complete") {
    setTimeout(initialize, 500);
  } else {
    window.addEventListener("load", () => {
      setTimeout(initialize, 500);
    });
  }
})();
