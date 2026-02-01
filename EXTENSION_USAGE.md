# Kaggle Python Linter - Extension Usage Guide

## Loading the Extension in Chrome

1. **Build the extension** (if not already built):
   ```bash
   npm install
   npm run build
   ```

2. **Open Chrome Extensions page**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the extension**:
   - Click "Load unpacked"
   - Select the directory: `packages/extension/dist/`
   - The extension should now appear in your extensions list

## Using the Extension

### On Kaggle Notebooks

1. Navigate to any Kaggle notebook in edit mode:
   - Example: `https://www.kaggle.com/code/[username]/[notebook]/edit`

2. The linter will automatically initialize and display an overlay in the bottom-right corner

### Keyboard Shortcuts

- **Ctrl+Shift+L**: Run the linter manually
- **Ctrl+Shift+H**: Toggle the overlay visibility

### Extension Popup

Click the extension icon in Chrome toolbar to access settings:

#### Linter Engine Options

- **Built-in**: Fast custom Python linting rules
  - 9 specialized rules for Kaggle notebooks
  - Instant feedback
  - Configurable rules

- **Flake8**: Industry-standard Python linter
  - Comprehensive PEP-8 compliance
  - Powered by Pyodide (WebAssembly)
  - First run will load Pyodide (~18MB)
  - Subsequent runs are fast

#### Built-in Rules (when using Built-in engine)

You can toggle individual rules on/off:

1. **Undefined Variables** - Detect usage of undefined variables
2. **Capitalization Typos** - Detect true/false/none instead of True/False/None
3. **Duplicate Functions** - Detect duplicate function definitions
4. **Import Issues** - Detect wildcard and duplicate imports
5. **Indentation Errors** - Detect missing indentation after colons
6. **Empty Cells** - Detect empty or comment-only cells
7. **Unclosed Brackets** - Detect unclosed parentheses, brackets, braces
8. **Redefined Built-ins** - Detect shadowing of built-in names
9. **Missing Return** - Detect functions that might need a return statement

#### Actions

- **Re-lint Now**: Manually trigger linting
- **Toggle Overlay**: Show/hide the error overlay

## Features

### Notebook Context Awareness

The linter understands Jupyter notebook structure:
- Variables defined in previous cells are recognized
- Cross-cell imports are tracked
- Cell-by-cell execution order is respected

### Overlay Features

- Collapsible/expandable error list
- Draggable overlay position
- Click errors to jump to cell
- Color-coded severity levels:
  - 🔴 Red: Errors
  - 🟡 Yellow: Warnings
  - 🔵 Blue: Info

### Pyodide Integration

When using Flake8 engine:
- Pyodide loads automatically on first lint
- Python linting runs entirely in browser
- No server-side processing required
- Full Flake8 + pyflakes support

## Troubleshooting

### Extension not appearing

- Check that you loaded the correct directory (`packages/extension/dist/`)
- Refresh the extensions page
- Check browser console for errors

### Linter not working on Kaggle

- Make sure you're on a Kaggle notebook edit page
- Check that the URL matches: `https://www.kaggle.com/code/*/edit`
- Try pressing Ctrl+Shift+L to manually trigger

### Flake8 not loading

- First lint may take 10-30 seconds to load Pyodide
- Check browser console for loading progress
- Make sure you have a stable internet connection (first load only)

### Overlay appearing twice

- This has been fixed in the current version
- Make sure you're using the latest build
- Reload the extension if issue persists

## Development

### File Structure

```
packages/extension/dist/
├── manifest.json          # Extension manifest
├── content.js             # Content script (React app)
├── content.css            # Overlay styles
├── popup.html             # Extension popup
├── popup.js               # Popup React app
├── popup.css              # Popup styles
├── icons/                 # Extension icons
└── pyodide/              # Pyodide WebAssembly files
    ├── pyodide.js
    ├── pyodide.asm.js
    ├── pyodide.asm.wasm
    └── python_stdlib.zip
```

### Building

```bash
# Build all packages
npm run build

# Build in watch mode (for development)
npm run dev

# Type check
npm run type-check

# Lint code
npm run lint
```

### Debugging

1. Open Chrome DevTools on the Kaggle page
2. Look for `[Kaggle Linter]` or `[Flake8Engine]` logs
3. Check the Console tab for errors
4. Use the Sources tab to set breakpoints in content.js

## Known Limitations

1. **Flake8 Loading Time**: First load of Flake8 engine takes 10-30 seconds
2. **Extension Size**: With Pyodide, extension is ~18MB
3. **Cross-origin Iframes**: Some Kaggle iframe content may not be accessible
4. **Magic Commands**: Cells starting with `%%` or `!` are skipped

## Performance

- **Built-in Engine**: < 100ms for typical notebooks
- **Flake8 Engine**: 
  - First load: 10-30 seconds (Pyodide initialization)
  - Subsequent lints: 100-500ms depending on code size
  
## Support

For issues or feature requests:
- GitHub: https://github.com/chater-marzougui/kaggle-lint
- Report bugs in the Issues section
