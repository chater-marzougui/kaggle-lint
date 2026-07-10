# Kaggle Python Linter

A modern TypeScript + React Chrome extension for linting Python code in Kaggle notebooks. Provides real-time code quality feedback with support for both custom rules and industry-standard Flake8 linting.

## ✨ Features

### Dual Linting Engines

- **Built-in Engine**: Fast, custom Python linting rules optimized for Kaggle notebooks
  - 9 specialized rules with instant feedback
  - Notebook-aware context tracking (cross-cell variable awareness)
  - Configurable rule toggles
- **Flake8 Engine**: Industry-standard Python linter powered by Pyodide
  - Comprehensive PEP-8 compliance checking
  - Runs entirely in browser via WebAssembly
  - Full Flake8 + pyflakes support

### Smart Notebook Features

- **Cross-cell Context**: Understands variables defined in previous cells
- **Lazy Loading Support**: Works with Kaggle's dynamic cell loading
- **Theme Aware**: Automatically adapts to light/dark mode
- **Interactive Overlay**: Draggable error panel with click-to-navigate
- **Keyboard Shortcuts**: Quick linting with Ctrl+Shift+L

### Available Lint Rules

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

## 🚀 Installation

### Prerequisites

- Node.js 18+
- npm 8+

### From Source

1. **Clone the repository**

   ```bash
   git clone https://github.com/chater-marzougui/kaggle-lint.git
   cd kaggle-lint
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `packages/extension/dist/` directory

### From Release

Download the latest release `.zip` file from the [releases page](https://github.com/chater-marzougui/kaggle-lint/releases) and load it as an unpacked extension in Chrome.

## 📖 Usage

### On Kaggle Notebooks

1. Navigate to any Kaggle notebook in edit mode
2. The linter automatically initializes and displays an overlay in the bottom-right corner
3. Errors, warnings, and info messages appear with severity indicators

### Keyboard Shortcuts

- **Ctrl+Shift+L**: Manually re-run the linter
- **Ctrl+Shift+H**: Toggle overlay visibility
- **Click on error**: Scroll to and highlight the affected cell

### Extension Settings

Click the extension icon in Chrome toolbar to configure:

- **Linter Engine**: Switch between Built-in and Flake8
- **Rule Toggles**: Enable/disable individual rules (Built-in mode)
- **Actions**: Re-lint now or toggle overlay

For detailed usage instructions, see [EXTENSION_USAGE.md](EXTENSION_USAGE.md).

## 🏗️ Architecture

### Monorepo Structure

The project is organized as a monorepo with three main packages:

```
kaggle-lint/
├── packages/
│   ├── core/                    # Core linting engine
│   │   ├── src/
│   │   │   ├── types/          # TypeScript type definitions
│   │   │   ├── rules/          # 9 lint rules (TypeScript classes)
│   │   │   ├── engines/        # LintEngine + flake8Shim/flake8Mapping (pure logic; browser glue lives in the extension's offscreen document)
│   │   │   ├── pyodide/        # Pyodide WebAssembly runtime
│   │   │   └── __tests__/      # Jest tests (21 passing)
│   │   └── dist/               # Compiled output
│   ├── ui-components/          # React UI components
│   │   ├── src/
│   │   │   ├── Overlay/        # Main overlay component
│   │   │   ├── ErrorList/      # Error list component
│   │   │   └── ErrorItem/      # Error item component
│   │   └── dist/               # Compiled output
│   └── extension/              # Chrome extension
│       ├── src/
│       │   ├── content/        # Content script (React)
│       │   ├── popup/          # Extension popup (React)
│       │   └── utils/          # DOM parser, CodeMirror manager
│       ├── public/             # Static assets (manifest, icons)
│       └── dist/               # Built extension (~19 MB with pyodide)
├── old-linter/                  # Original vanilla JS implementation (reference)
├── .github/workflows/          # CI/CD pipelines
└── turbo.json                  # Turborepo configuration
```

### Package Overview

1. **@kaggle-lint/core**: Pure TypeScript linting engine
   - No DOM dependencies
   - Can be used standalone or in Node.js
   - Includes both custom rules and Flake8 integration
   - Fully tested with Jest

2. **@kaggle-lint/ui-components**: React UI components
   - Reusable overlay, error list, error items
   - CSS modules for scoped styling
   - Can be used in any React app

3. **@kaggle-lint/extension**: Chrome extension
   - Integrates core + UI components
   - Content script with React
   - Popup with React
   - DOM utilities for Kaggle notebooks

## 💻 Development

### Building

```bash
# Build all packages (uses Turborepo)
npm run build

# Build in watch mode
npm run dev

# Build specific package
cd packages/core && npm run build
cd packages/ui-components && npm run build
cd packages/extension && npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
cd packages/core && npm run test:watch

# Type check all packages
npm run type-check
```

Current test coverage:

- 21 unit tests passing
- All core rules tested
- LintEngine functionality verified

### Testing the Extension

#### In Browser

1. Build and load the extension (see Installation)
2. Open a Kaggle notebook
3. Check browser console for `[Kaggle Linter]` logs

#### Standalone Demo

Test the linter without installing the extension:

```bash
# Start demo server
cd old-linter
python3 -m http.server 8000
```

Open http://localhost:8000/test/linter-demo.html and upload a `.ipynb` file.

The demo provides:

- Linter engine selector (Custom vs Flake8)
- Drag-and-drop file upload
- Visual display with line numbers
- Real-time linting results
- Click-to-scroll navigation

### Code Quality

```bash
# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## 📋 API Reference

### Core Package

#### Types

```typescript
import { LintError, LintContext, LintRule } from '@kaggle-lint/core';

// Error structure
interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  code?: string; // For Flake8 error codes
  cellIndex?: number;
}

// Context for cross-cell linting
interface LintContext {
  definedNames?: Set<string>;
  importedModules?: Set<string>;
  functionNames?: Set<string>;
  classNames?: Set<string>;
}
```

#### Using the LintEngine

```typescript
import { LintEngine } from '@kaggle-lint/core';

// Create engine with default rules
const engine = new LintEngine();

// Lint a single piece of code
const errors = engine.lintCode('x = y + 1', 0);
console.log(errors);
// [{ line: 1, msg: "Undefined variable 'y'", severity: 'error', rule: 'undefinedVariables' }]

// Lint multiple cells in a notebook
const cells = [
  { code: 'x = 1', element: null, cellIndex: 0 },
  { code: 'y = x + 1', element: null, cellIndex: 1 },
];
const notebookErrors = engine.lintNotebook(cells);
```

#### Using Individual Rules

```typescript
import {
  UndefinedVariablesRule,
  CapitalizationTyposRule,
} from '@kaggle-lint/core';

const undefinedRule = new UndefinedVariablesRule();
const errors = undefinedRule.run('print(x)', 0);
```

#### Flake8 Linting (extension-only)

Flake8/pyflakes linting runs inside the extension's Chrome offscreen document (Pyodide + bundled wheels), not as a standalone `@kaggle-lint/core` class — it requires a Chrome extension context (`chrome.offscreen`, `chrome.runtime` messaging) that a plain Node/browser script doesn't have. The content script talks to it via `Flake8Client` (`packages/extension/src/flake8/Flake8Client.ts`):

```typescript
import { Flake8Client } from '../flake8/Flake8Client';

const client = new Flake8Client();
const errors = await client.lintNotebook([{ code: 'x = y + 1', cellIndex: 0 }]);
```

`packages/core` exports the reusable, browser-independent pieces the offscreen runtime is built from: `PYTHON_SHIM` (the pyflakes-wrapping Python source, from `engines/flake8Shim.ts`) and `mapFlake8Results` (line-offset + rule tagging, from `engines/flake8Mapping.ts`).

### Adding Custom Rules

Each rule follows a simple interface:

```typescript
export class MyCustomRule extends BaseRule {
  name = 'myCustomRule';

  run(code: string, cellOffset: number = 0, context?: LintContext): LintError[] {
    const errors: LintError[] = [];

    // Analyze code and find issues
    if (/* issue detected */) {
      errors.push({
        line: lineNumber + cellOffset,
        msg: 'Description of the issue',
        severity: 'error',
        rule: this.name,
      });
    }

    return errors;
  }
}
```

## 🔧 Build & CI/CD

### Turborepo

The project uses Turborepo for optimized build orchestration:

- **Dependency-aware builds**: Packages build in correct order
- **Caching**: Faster rebuilds with intelligent caching
- **Parallel execution**: Multiple packages build simultaneously

### GitHub Actions

Automated workflows:

- **CI Pipeline** (runs on every push and PR)
  - ESLint + Prettier checks
  - TypeScript type checking
  - Jest unit tests
  - Build validation

- **Release Pipeline** (triggered on version tags)
  - Builds extension with all packages
  - Creates distribution ZIP
  - Publishes GitHub release with artifacts

## 🤝 Contributing

Contributions are welcome! When contributing:

1. **Follow existing patterns** - Maintain consistency with the codebase
2. **Add types** - Use TypeScript for type safety
3. **Test thoroughly** - Ensure all tests pass
4. **Document changes** - Update README and comments as needed
5. **Check formatting** - Run `npm run format` before committing

### Development Workflow

1. Fork and clone the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Check types: `npm run type-check`
6. Lint code: `npm run lint:fix`
7. Build: `npm run build`
8. Submit a pull request

## 📚 Additional Documentation

- [Extension Usage Guide](EXTENSION_USAGE.md) - Detailed usage instructions
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Recent migration details
- [Migration History](MIGRATION.md) - Complete migration plan and history

## 🙏 Acknowledgments

Special thanks to:

- **[Pyodide](https://pyodide.org/)** - Python runtime compiled to WebAssembly
- **[Flake8](https://flake8.pycqa.org/)** - Industry-standard Python linting tool

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🐛 Issues & Support

- **Report bugs**: [GitHub Issues](https://github.com/chater-marzougui/kaggle-lint/issues)
- **Discuss features**: [GitHub Discussions](https://github.com/chater-marzougui/kaggle-lint/discussions)
- **View documentation**: Check the `/docs` folder and wiki

---

**Built with TypeScript, React, and ❤️ for the Kaggle community**
