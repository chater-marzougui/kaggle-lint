# Rollback Guide: Smart Linter Feature

This document provides step-by-step instructions to reverse the Smart Linter feature if you find it too resource-intensive on laptops or if you want to revert to the original implementation.

## Overview of Changes

The Smart Linter feature added:
1. A new lint mode toggle in the popup (Standard vs Smart mode)
2. A `smartLinter.js` file that analyzes the entire notebook as a cohesive unit
3. Modified `content.js` to support mode switching
4. Updated popup UI with mode selection

## Rollback Steps

### Step 1: Revert manifest.json

Remove `src/smartLinter.js` from the content scripts list.

**Before:**
```json
"js": [
  "src/rules/undefinedVariables.js",
  ...
  "src/lintEngine.js",
  "src/smartLinter.js",
  "src/domParser.js",
  ...
]
```

**After:**
```json
"js": [
  "src/rules/undefinedVariables.js",
  ...
  "src/lintEngine.js",
  "src/domParser.js",
  ...
]
```

### Step 2: Delete smartLinter.js

Remove the Smart Linter module:

```bash
rm src/smartLinter.js
```

### Step 3: Revert content.js

In `src/content.js`, find the `runLinterOnCells` function and remove the Smart Linter mode check.

**Before:**
```javascript
function runLinterOnCells(codeCells) {
  // ...
  
  // Check lint mode setting
  const lintMode = linterSettings?.lintMode || "standard";
  log(`Lint mode: ${lintMode}`);

  let errors;
  if (lintMode === "smart" && typeof SmartLinter !== "undefined") {
    log("Using Smart Linter (whole notebook analysis)");
    errors = SmartLinter.lintNotebook(codeCells);
  } else {
    log("Using Standard Linter (cell-by-cell analysis)");
    errors = LintEngine.lintNotebook(codeCells);
  }
  
  // ...
}
```

**After:**
```javascript
function runLinterOnCells(codeCells) {
  // ...
  
  let errors = LintEngine.lintNotebook(codeCells);
  
  // ...
}
```

### Step 4: Revert popup.html

Remove the lint mode section from `src/popup/popup.html`.

**Remove this section:**
```html
<div class="lint-mode-section">
  <h2 class="section-title">Lint Mode</h2>
  <div class="lint-mode-options">
    <label class="mode-option">
      <input type="radio" name="lintMode" value="standard" id="mode-standard">
      <span class="mode-label">
        <span class="mode-name">Standard Mode</span>
        <span class="mode-description">Cell-by-cell analysis (lighter)</span>
      </span>
    </label>
    <label class="mode-option">
      <input type="radio" name="lintMode" value="smart" id="mode-smart">
      <span class="mode-label">
        <span class="mode-name">Smart Mode</span>
        <span class="mode-description">Whole notebook analysis (better context)</span>
      </span>
    </label>
  </div>
</div>
```

### Step 5: Revert popup.js

In `src/popup/popup.js`:

1. Remove the `LINT_MODES` constant
2. Remove `lintMode` from `DEFAULT_SETTINGS`
3. Remove the `renderLintMode` function
4. Remove `await renderLintMode();` from the `init` function

**Remove:**
```javascript
// Available lint modes
const LINT_MODES = {
  standard: { ... },
  smart: { ... },
};
```

**Revert DEFAULT_SETTINGS to:**
```javascript
const DEFAULT_SETTINGS = {
  rules: RULES.reduce((acc, rule) => {
    acc[rule.id] = rule.enabled;
    return acc;
  }, {}),
};
```

**Remove the `renderLintMode` function entirely.**

**Revert `loadSettings` function:**
```javascript
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
```

### Step 6: Revert popup.css

Remove the lint mode section styles from `src/popup/popup.css`.

**Remove these CSS rules:**
```css
/* Lint Mode Section */
.lint-mode-section { ... }
.section-title { ... }
.lint-mode-options { ... }
.mode-option { ... }
.mode-option:hover { ... }
.mode-option:has(input:checked) { ... }
.mode-option input[type="radio"] { ... }
.mode-label { ... }
.mode-name { ... }
.mode-description { ... }
```

### Step 7: Delete test file

Remove the Smart Linter test file:

```bash
rm test/smart-linter.test.js
```

### Step 8: Clean Chrome Storage (Optional)

If you want to clear the lint mode setting from Chrome storage, you can run this in the browser console on a Kaggle page after loading the extension:

```javascript
chrome.storage.sync.get(["linterSettings"], (result) => {
  if (result.linterSettings) {
    delete result.linterSettings.lintMode;
    chrome.storage.sync.set({ linterSettings: result.linterSettings });
    console.log("Lint mode setting cleared");
  }
});
```

## Verification

After completing the rollback:

1. Reload the extension in Chrome (`chrome://extensions` → "Reload")
2. Open a Kaggle notebook
3. Verify the popup no longer shows the lint mode selection
4. Verify linting works as before (cell-by-cell analysis)

## Why You Might Want to Rollback

- **Performance**: Smart mode analyzes all cells together, which may be slower on large notebooks
- **Memory**: Smart mode loads more data into memory
- **Simplicity**: If you prefer the simpler cell-by-cell approach
- **Compatibility**: If you encounter issues with the new mode

## Quick One-Command Rollback

If you have git, you can also rollback by reverting the commit:

```bash
git revert <commit-hash-of-smart-linter-feature>
```

Or if this is on a branch:

```bash
git checkout main -- src/content.js src/popup/ manifest.json
git rm src/smartLinter.js test/smart-linter.test.js
```
