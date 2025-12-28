# Kaggle Python Linter

A modular JavaScript Chrome extension for linting Python code in Kaggle online notebooks. Detects common issues without code execution.

## Features

### Lint Rules

The extension includes the following modular lint rules:

| Rule | Description | Severity |
|------|-------------|----------|
| **Undefined Variables** | Detects usage of variables that haven't been defined | Error |
| **Capitalization Typos** | Detects potential typos from incorrect capitalization (e.g., `true` vs `True`) | Warning |
| **Duplicate Functions** | Detects functions/classes with the same name defined multiple times | Warning |
| **Import Issues** | Detects problematic import patterns (wildcards, duplicates, unused imports) | Warning/Info |
| **Indentation Errors** | Detects mixed tabs/spaces, unexpected indents, misaligned blocks | Error |
| **Empty Cells** | Detects empty or effectively empty code cells | Info |
| **Unclosed Brackets** | Detects unclosed parentheses, brackets, and braces | Error |
| **Redefined Variables** | Detects shadowing of built-in names and variable redefinition | Warning |
| **Missing Return** | Detects functions that appear to compute values but lack return statements | Warning |

### Kaggle DOM Support

The extension handles different Kaggle notebook configurations:
- **Themes**: Light and dark mode detection and styling
- **Collapsible cells**: Works with collapsed/expanded cell states
- **Notebook modes**: Edit, view, and run modes
- **Lazy Loading**: Uses a local code mirror to handle Kaggle's lazy loading of cells

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the repository folder

## Usage

The linter runs automatically when you open a Kaggle notebook. You can also:

- **Ctrl+Shift+L**: Manually re-run the linter
- **Ctrl+Shift+H**: Toggle the overlay visibility
- Click on any error to scroll to the affected cell

## Architecture

```
src/
├── content.js          # Main entry point
├── domParser.js        # Kaggle DOM extraction
├── codeMirror.js       # Local cell storage for lazy loading
├── lintEngine.js       # Rule orchestration
├── flake8Engine.js     # Flake8 linting via Pyodide
├── rules/
│   ├── undefinedVariables.js
│   ├── capitalizationTypos.js
│   ├── duplicateFunctions.js
│   ├── importIssues.js
│   ├── indentationErrors.js
│   ├── emptyCells.js
│   ├── unclosedBrackets.js
│   ├── redefinedVariables.js
│   └── missingReturn.js
└── ui/
    ├── overlay.js      # Error display UI
    └── styles.css      # Styling
```

## Rule API

Each rule is a module that exports a `run` function:

```javascript
const MyRule = (function () {
  function run(code, cellOffset = 0) {
    const errors = [];
    // Analyze code...
    errors.push({
      line: lineNumber + cellOffset,
      msg: 'Description of the issue',
      severity: 'error' | 'warning' | 'info'
    });
    return errors;
  }
  return { run };
})();
```

## Development

### Adding a New Rule

1. Create a new file in `src/rules/`
2. Follow the module pattern shown above
3. Register the rule in `lintEngine.js`
4. Add the script to `manifest.json`

### Testing

#### Unit Tests

Run the test suite:

```bash
npm test
```

This runs both rule tests and CodeMirror tests:
- `test/rules.test.js` - Tests for all linting rules (62 tests)
- `test/codeMirror.test.js` - Tests for cell storage system (17 tests)

#### Standalone Demo Page

Test the linter without installing the extension:

1. Start the demo server:
   ```bash
   npm run test:demo
   ```
   Or manually:
   ```bash
   cd test && python3 -m http.server 8000
   ```

2. Open http://localhost:8000/linter-demo.html in your browser

3. Upload a `.ipynb` file to see the linter in action

The demo page (`test/linter-demo.html`) provides:
- Drag-and-drop or click-to-browse file upload
- Visual display of all code cells
- Real-time linting results with severity indicators
- Click-to-scroll error navigation
- Summary statistics (errors, warnings, info)

#### Browser Testing

Open a Kaggle notebook and check the browser console for debug output.

## Acknowledgments

Special thanks to the following projects that make this extension possible:

- **[Pyodide](https://pyodide.org/)** - Python runtime compiled to WebAssembly, enabling Python code execution in the browser
- **[Flake8](https://flake8.pycqa.org/)** - The Python linting tool that provides comprehensive code style and error checking

## License

MIT