# Contributing to Kaggle Linter

Thanks for considering a contribution. This file covers the technical details — architecture, building, testing — that don't belong in the main [README](README.md), which is kept for end users.

## Prerequisites

- Node.js 22+
- npm 10+

## Getting set up

```bash
git clone https://github.com/chater-marzougui/kaggle-lint.git
cd kaggle-lint
npm install
npm run build
```

Load `packages/extension/dist/` as an unpacked extension at `chrome://extensions` to try your changes.

## Monorepo structure

npm workspaces + Turborepo, three packages, built in dependency order (`core` → `ui-components` → `extension`):

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
├── .github/workflows/          # CI/CD pipelines
└── turbo.json                  # Turborepo configuration
```

### Package overview

1. **`@kaggle-lint/core`** — pure TypeScript linting logic, no DOM dependencies, usable standalone in Node. Shared notebook-source building, severity mapping, and the flake8 Python shim. Fully tested with Jest.
2. **`@kaggle-lint/ui-components`** — React overlay/error-list/error-item components, no linting logic.
3. **`@kaggle-lint/extension`** — wires the other two into a Chrome MV3 extension via webpack. Content script + popup, both React.

For the full runtime architecture (message-passing between the content script, background service worker, and offscreen document; how the two linting engines actually run in-browser), see [`docs/architecture.md`](docs/architecture.md).

## Building

```bash
# Build all packages (Turborepo, dependency-ordered)
npm run build

# Watch mode
npm run dev

# Build a single package
cd packages/core && npm run build
cd packages/ui-components && npm run build
cd packages/extension && npm run build
```

## Testing

```bash
# Run all tests
npm test

# Watch mode (core package)
cd packages/core && npm run test:watch

# Single test file
cd packages/core && npx jest buildNotebookSource.test.ts
```

Current coverage: `packages/core` 31 tests across 4 suites, `packages/extension` 22 tests across 5 suites, both with enforced coverage thresholds. `packages/ui-components` has no dedicated test suite (no React Testing Library in this repo — component-level tests aren't a pattern used here; keep new logic in plain, testable modules where possible, the way `parseIgnoreCodes.ts` and `contentScriptBridge.ts` are split out from their React components specifically for this).

## Code quality

```bash
npm run lint          # eslint per package
npm run lint:fix       # eslint --fix across packages/
npm run type-check     # tsc --noEmit per package
npm run format         # prettier --write
npm run format:check   # prettier --check
```

CI runs all of lint, type-check, test, and build on every push/PR to `main`. `npm run lint` should stay at 0 errors — currently there's exactly one pre-existing warning (`Overlay.tsx`'s `onStateChange` `react-hooks/exhaustive-deps` gap), deliberately left as-is; see `docs/next_plans/milestone-4-config-and-build-hygiene/notes.md` for why.

## API reference (core package)

```typescript
import { LintError } from '@kaggle-lint/core';

interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  code?: string; // flake8/ruff error code
  cellIndex?: number;
}
```

Both engines run inside the extension's Chrome offscreen document — flake8 via Pyodide, ruff via a native WASM build — not as standalone `@kaggle-lint/core` classes, since both need a Chrome extension context (`chrome.offscreen`, `chrome.runtime` messaging). The content script talks to whichever engine is selected via `EngineClient`:

```typescript
import { EngineClient } from '../engine/EngineClient';

const client = new EngineClient();
const errors = await client.lintNotebook(
  'flake8',
  [{ code: 'x = y + 1', cellIndex: 0 }],
  []
);
```

`packages/core` exports the reusable, browser-independent pieces both offscreen runtimes are built from: `buildNotebookSource`/`mapLineToCell` (concatenates cells into one lint pass, maps diagnostics back to cell/line), `classifySeverity`/`mapDiagnostics` (shared severity logic), and `PYTHON_SHIM` (the flake8-specific Python source).

## Contributing workflow

1. Fork and clone the repository.
2. Create a feature branch.
3. Make your changes, following the existing patterns in the file you're touching.
4. `npm test`, `npm run type-check`, `npm run lint:fix`, `npm run build` — all green before opening a PR.
5. `npm run format` to keep formatting consistent.
6. Open a pull request.

Found a false positive in the linting itself (not a bug in the extension's own code)? Please [report it](https://github.com/chater-marzougui/kaggle-lint/issues/new?labels=bug&title=False+positive%3A+&body=Engine%3A+Flake8+or+Ruff+%28delete+one%29%0A%0ARule+code%3A+%0A%0ANotebook+cell+code+that+triggered+it%3A%0A%0A%0A%0AWhat+you+expected%3A%0A%0A%0AWhat+happened+instead%3A%0A) with the exact rule code and a minimal code snippet — that's the fastest way to get it fixed.
