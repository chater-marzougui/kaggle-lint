# Kaggle Linter

A modern TypeScript + React Chrome extension for linting Python code in Kaggle notebooks. Provides real-time code quality feedback with support for both Flake8 and Ruff linting engines.

## ✨ Features

### Two Linting Engines

- **Flake8**: Industry-standard Python linter (pyflakes + pycodestyle + mccabe) running in-browser via Pyodide (Python-in-WebAssembly)
  - Comprehensive PEP-8 compliance checking, real `# noqa` comment support
  - Notebook-aware: variables defined in earlier cells are correctly recognized in later ones
  - Configurable ignore-codes list
- **Ruff**: Fast Rust-based Python linter, no Python runtime needed — a native WebAssembly build (`@astral-sh/ruff-wasm-web`)
  - Much lighter/faster cold start than the Pyodide-based flake8 engine (no wheels, no Python stdlib)
  - Same notebook-aware cross-cell scoping and configurable ignore-codes list

### Smart Notebook Features

- **Cross-cell Context**: Understands variables defined in previous cells
- **Lazy Loading Support**: Works with Kaggle's dynamic cell loading
- **Theme Aware**: Automatically adapts to light/dark mode
- **Interactive Overlay**: Draggable error panel with click-to-navigate
- **Keyboard Shortcuts**: Quick linting with Ctrl+Shift+L

## 🚀 Installation

### Prerequisites

- Node.js 22+
- npm 10+

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

- **Linter Engine**: Switch between Flake8 and Ruff
- **Ignore Codes**: Comma-separated error codes to ignore, per engine (e.g. `E501, F401`)
- **Actions**: Re-lint now or toggle overlay

## 🏗️ Architecture

### Monorepo Structure

The project is organized as a monorepo with three main packages:

```
kaggle-lint/
├── packages/
│   ├── core/                    # Core linting logic
│   │   ├── src/
│   │   │   ├── types/          # TypeScript type definitions
│   │   │   ├── notebook/       # Shared cell-concatenation + severity/diagnostic mapping (used by both engines)
│   │   │   ├── engines/        # flake8Shim.ts (pure Python string; browser glue lives in the extension's offscreen document)
│   │   │   ├── pyodide/        # Pyodide WebAssembly runtime + bundled flake8/pyflakes/pycodestyle/mccabe wheels
│   │   │   └── __tests__/      # Jest tests
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

1. **@kaggle-lint/core**: Pure TypeScript linting logic
   - No DOM dependencies
   - Can be used standalone or in Node.js
   - Includes shared notebook-source building, severity mapping, and the flake8 Python shim
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

- `packages/core`: 31 tests across 4 suites (notebook-source building, severity mapping, syntax-isolation retry, the flake8 Python shim), enforced coverage thresholds
- `packages/extension`: 22 tests across 5 suites (cell store, DOM-scrape extraction fallback, debug-log gating, popup↔content-script messaging, ignore-codes/debug-token parsing), enforced coverage thresholds
- `npm run lint`: 0 errors, 1 warning repo-wide (a deliberately-deferred `react-hooks/exhaustive-deps` gap in `Overlay.tsx` — see `docs/next_plans/milestone-4-config-and-build-hygiene/notes.md`)

### Testing the Extension

#### In Browser

1. Build and load the extension (see Installation)
2. Open a Kaggle notebook
3. Check browser console for `[Kaggle Linter]` logs

#### Standalone Demo

Removed along with `old-linter/` (see [next_plans/README.md](docs/next_plans/README.md) for a note on bringing a replacement back as a future milestone). For now, load the extension unpacked (see Installation above) and test against a real Kaggle notebook.

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
import { LintError } from '@kaggle-lint/core';

// Error structure
interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  code?: string; // For flake8/ruff error codes
  cellIndex?: number;
}
```

#### Flake8/Ruff Linting (extension-only)

Both engines run inside the extension's Chrome offscreen document — flake8 via Pyodide (Python-in-WASM) + bundled wheels, ruff via a native `@astral-sh/ruff-wasm-web` build with no Python runtime at all — not as standalone `@kaggle-lint/core` classes, since both need a Chrome extension context (`chrome.offscreen`, `chrome.runtime` messaging) a plain Node/browser script doesn't have. The content script talks to whichever engine is selected via `EngineClient` (`packages/extension/src/engine/EngineClient.ts`):

```typescript
import { EngineClient } from '../engine/EngineClient';

const client = new EngineClient();
const errors = await client.lintNotebook(
  'flake8',
  [{ code: 'x = y + 1', cellIndex: 0 }],
  []
);
```

`packages/core` exports the reusable, browser-independent pieces both offscreen runtimes are built from: `buildNotebookSource`/`mapLineToCell` (notebook/buildNotebookSource.ts — concatenates cells into one lint pass), `classifySeverity`/`mapDiagnostics` (notebook/severityMapping.ts — shared by both engines), and `PYTHON_SHIM` (engines/flake8Shim.ts — flake8-specific).

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

- [Architecture](docs/architecture.md) - Monorepo structure and runtime design
- [Review Findings](docs/review-findings.md) - Itemized issues found in the original TS/React migration, and their resolution status
- [Roadmap](docs/next_plans/README.md) - Milestone plans and execution history

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
