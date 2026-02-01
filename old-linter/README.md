# Kaggle Python Linter

A modular JavaScript Chrome extension for linting Python code in Kaggle online notebooks. Detects common issues without code execution.

## Features

### Lint Rules

The extension includes the following modular lint rules:

| Rule                     | Description                                                                    | Severity     |
| ------------------------ | ------------------------------------------------------------------------------ | ------------ |
| **Undefined Variables**  | Detects usage of variables that haven't been defined                           | Error        |
| **Capitalization Typos** | Detects potential typos from incorrect capitalization (e.g., `true` vs `True`) | Warning      |
| **Duplicate Functions**  | Detects functions/classes with the same name defined multiple times            | Warning      |
| **Import Issues**        | Detects problematic import patterns (wildcards, duplicates, unused imports)    | Warning/Info |
| **Indentation Errors**   | Detects mixed tabs/spaces, unexpected indents, misaligned blocks               | Error        |
| **Empty Cells**          | Detects empty or effectively empty code cells                                  | Info         |
| **Unclosed Brackets**    | Detects unclosed parentheses, brackets, and braces                             | Error        |
| **Redefined Variables**  | Detects shadowing of built-in names and variable redefinition                  | Warning      |
| **Missing Return**       | Detects functions that appear to compute values but lack return statements     | Warning      |

### Kaggle DOM Support

The extension handles different Kaggle notebook configurations:

- **Themes**: Light and dark mode detection and styling
- **Collapsible cells**: Works with collapsed/expanded cell states
- **Notebook modes**: Edit, view, and run modes
- **Lazy Loading**: Uses a local code mirror to handle Kaggle's lazy loading of cells

## Installation

### From Source (Development)

1. Clone this repository

   ```bash
   git clone https://github.com/chater-marzougui/kaggle-lint.git
   cd kaggle-lint
   ```

2. Install dependencies and build

   ```bash
   npm install
   npm run build
   ```

3. Load in Chrome
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `/dist` folder

### From Release

Download the latest release `.zip` file and load it as an unpacked extension in Chrome.

## Usage

The linter runs automatically when you open a Kaggle notebook. You can also:

- **Ctrl+Shift+L**: Manually re-run the linter
- **Ctrl+Shift+H**: Toggle the overlay visibility
- Click on any error to scroll to the affected cell

## Architecture

### Project Structure

```
src/
├── assets/             # Static assets
│   ├── icons/         # Extension icons (16px to 512px)
│   └── svgs/          # SVG icons for UI
├── rules/             # Linting rules (modular)
│   ├── undefinedVariables.js
│   ├── capitalizationTypos.js
│   ├── duplicateFunctions.js
│   ├── importIssues.js
│   ├── indentationErrors.js
│   ├── emptyCells.js
│   ├── unclosedBrackets.js
│   ├── redefinedVariables.js
│   └── missingReturn.js
├── ui/                # User interface components
│   ├── overlay.js     # Error display overlay
│   └── styles.css     # UI styling
├── popup/             # Extension popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── pyodide/           # Pyodide WASM runtime for Flake8
├── content.js         # Main entry point
├── domParser.js       # Kaggle DOM extraction
├── codeMirror.js      # Local cell storage for lazy loading
├── lintEngine.js      # Custom rules orchestration
├── flake8Engine.js    # Flake8 linting via Pyodide
└── pageInjection.js   # Page-level script injection

config/                # Build configuration
├── webpack.common.js  # Shared webpack config
├── webpack.dev.js     # Development build config
└── webpack.prod.js    # Production build config

scripts/               # Build scripts
├── manifest-plugin.js # Webpack plugin for manifest generation
└── hot-reload.js      # Hot reload for development

test/                  # Tests and demo
├── rules.test.js      # Rule unit tests
├── codeMirror.test.js # CodeMirror tests
├── linter-demo.html   # Standalone demo page
├── linter-demo.js     # Demo functionality
├── linter-demo.css    # Demo styling
└── notebook.ipynb     # Test notebook
```

### Build Process

The project uses webpack to bundle the extension:

1. **Development**: `npm run dev` - Watch mode with hot reload
2. **Production**: `npm run build` - Optimized production build
3. **Output**: All files bundled to `/dist` directory, ready to load as Chrome extension

The build process:

- Bundles JavaScript modules
- Copies assets (icons, SVGs, pyodide runtime)
- Generates manifest.json automatically
- Handles CSS and static files
- Outputs a complete, ready-to-load extension in `/dist`

````

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
````

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

1. Start the demo server (from project root):

   ```bash
   npm run test:demo
   ```

   Or manually:

   ```bash
   python3 -m http.server 8000
   ```

2. Open http://localhost:8000/test/linter-demo.html in your browser

3. Upload a `.ipynb` file to see the linter in action

The demo page (`test/linter-demo.html`) provides:

- **Linter Engine Selector**: Switch between custom rules and Flake8
- Drag-and-drop or click-to-browse file upload
- Visual display of all code cells with line numbers
- Real-time linting results with severity indicators
- Click-to-scroll error navigation
- Summary statistics (errors, warnings, info)
- Re-lint button to test code changes

**Note**: Flake8 linting requires loading Pyodide (Python WASM runtime) which may take a few seconds on first use.

#### Browser Testing

Open a Kaggle notebook and check the browser console for debug output.

## Acknowledgments

Special thanks to the following projects that make this extension possible:

- **[Pyodide](https://pyodide.org/)** - Python runtime compiled to WebAssembly, enabling Python code execution in the browser
- **[Flake8](https://flake8.pycqa.org/)** - The Python linting tool that provides comprehensive code style and error checking

## License

MIT
