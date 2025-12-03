/**
 * Kaggle Python Linter - Popup Script
 * Handles the extension popup UI for toggling linting rules
 */

// Available linting rules with display names and descriptions
const RULES = [
  {
    id: "undefinedVariables",
    name: "Undefined Variables",
    description: "Detect usage of undefined variables",
    enabled: true,
  },
  {
    id: "capitalizationTypos",
    name: "Capitalization Typos",
    description: "Detect true/false/none instead of True/False/None",
    enabled: true,
  },
  {
    id: "duplicateFunctions",
    name: "Duplicate Functions",
    description: "Detect duplicate function definitions",
    enabled: true,
  },
  {
    id: "importIssues",
    name: "Import Issues",
    description: "Detect wildcard and duplicate imports",
    enabled: true,
  },
  {
    id: "indentationErrors",
    name: "Indentation Errors",
    description: "Detect missing indentation after colons",
    enabled: true,
  },
  {
    id: "emptyCells",
    name: "Empty Cells",
    description: "Detect empty or comment-only cells",
    enabled: true,
  },
  {
    id: "unclosedBrackets",
    name: "Unclosed Brackets",
    description: "Detect unclosed parentheses, brackets, braces",
    enabled: true,
  },
  {
    id: "redefinedVariables",
    name: "Redefined Built-ins",
    description: "Detect shadowing of built-in names",
    enabled: true,
  },
  {
    id: "missingReturn",
    name: "Missing Return",
    description: "Detect functions that might need a return statement",
    enabled: true,
  },
];

// Default settings
const DEFAULT_SETTINGS = {
  rules: RULES.reduce((acc, rule) => {
    acc[rule.id] = rule.enabled;
    return acc;
  }, {}),
};

/**
 * Load settings from Chrome storage
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["linterSettings"], (result) => {
      if (result.linterSettings) {
        resolve(result.linterSettings);
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    });
  });
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ linterSettings: settings }, resolve);
  });
}

/**
 * Render the rules list UI
 */
async function renderRulesList() {
  const container = document.getElementById("rules-list");
  const settings = await loadSettings();

  container.innerHTML = RULES.map((rule) => {
    const isEnabled = settings.rules[rule.id] !== false; // Default to enabled
    return `
      <div class="rule-item">
        <label class="rule-toggle">
          <input type="checkbox" 
                 data-rule-id="${rule.id}" 
                 ${isEnabled ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
        <div class="rule-info">
          <span class="rule-name">${rule.name}</span>
          <span class="rule-description">${rule.description}</span>
        </div>
      </div>
    `;
  }).join("");

  // Add event listeners to toggles
  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", async (e) => {
      const ruleId = e.target.dataset.ruleId;
      const isEnabled = e.target.checked;

      const currentSettings = await loadSettings();
      currentSettings.rules[ruleId] = isEnabled;
      await saveSettings(currentSettings);

      // Notify content script of settings change
      notifyContentScript({
        type: "settingsChanged",
        settings: currentSettings,
      });
    });
  });
}

/**
 * Send message to content script in active tab
 * Returns a promise that resolves with the response or rejects on error
 */
async function notifyContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.id) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            console.log(
              "Could not send message to content script:",
              chrome.runtime.lastError.message
            );
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            resolve(response || { success: true });
          }
        });
      });
    }
    return { success: false, error: "No active tab found" };
  } catch (e) {
    console.log("Could not notify content script:", e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Load extension version and display in popup
 */
async function loadExtensionVersion() {
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.getElementById("version-id");
  versionElement.textContent = `v${manifest.version}`;
}

/**
 * Initialize popup
 */
async function init() {
  loadExtensionVersion();
  await renderRulesList();

  // Refresh button
  document.getElementById("refresh-btn").addEventListener("click", async () => {
    await notifyContentScript({ type: "runLinter" });
    window.close();
  });

  // Toggle overlay button
  document
    .getElementById("toggle-overlay-btn")
    .addEventListener("click", async () => {
      await notifyContentScript({ type: "toggleOverlay" });
      window.close();
    });
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
