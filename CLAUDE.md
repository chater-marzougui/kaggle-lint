# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome extension (Manifest V3) that lints Python code inside Kaggle notebook cells in the browser. TypeScript + React monorepo managed with npm workspaces and Turborepo.

## Commands

Run from repo root unless noted.

```bash
npm install                # install all workspace deps
npm run build              # turbo run build — builds core → ui-components → extension in dependency order
npm run dev                # turbo run dev --parallel — watch mode for all packages
npm test                   # turbo run test (only packages/core has tests)
npm run lint                # turbo run lint (eslint per package)
npm run lint:fix           # eslint --fix across packages/
npm run type-check         # turbo run type-check (tsc --noEmit per package)
npm run format / format:check   # prettier over **/*.{ts,tsx,json,md}
```

Single package / single test:

```bash
cd packages/core && npm run build          # tsc && copy pyodide assets into dist/pyodide
cd packages/core && npm test               # jest
cd packages/core && npx jest UndefinedVariablesRule.test.ts   # single test file
cd packages/core && npm run test:watch
cd packages/extension && npm run build      # webpack --config webpack.config.js
cd packages/extension && npm run dev        # webpack --watch
```

Loading the built extension: `npm run build`, then load `packages/extension/dist/` as an unpacked extension via `chrome://extensions`.

Standalone linter demo (no extension install needed): `cd old-linter && python3 -m http.server 8000`, then open `http://localhost:8000/test/linter-demo.html` and upload a `.ipynb` file.

## Architecture

Three workspace packages build in dependency order via Turborepo (`build` task has `dependsOn: ["^build"]`): **core → ui-components → extension**.

### `packages/core` — `@kaggle-lint/core`

Pure TypeScript linting logic, no DOM dependencies, usable standalone in Node.

- `types/index.ts` — shared types: `LintError`, `Severity`.
- `notebook/buildNotebookSource.ts` — concatenates a notebook's cells into one source string for a single whole-notebook lint pass (magic commands/shell escapes blanked in place, line counts preserved), plus `mapLineToCell()` to map a diagnostic's global line back to `(cellIndex, cellLine)`. Shared by both engines below — this is what gives correct cross-cell scoping (a variable defined in cell 1 is recognized in cell 3) for free, via real Python/Rust scoping on one concatenated "file," instead of a hand-rolled cross-cell context tracker.
- `notebook/severityMapping.ts` — `classifySeverity()` (a shared code-prefix heuristic: F-codes → error, else → warning — neither engine's real API exposes severity natively) and `mapDiagnostics()` (applies the offset-mapping above plus severity/rule tagging). Also shared by both engines.
- `engines/flake8Shim.ts` — `PYTHON_SHIM`, the Python source run once inside Pyodide. Calls flake8's real `Application`/`StyleGuide`/`BaseFormatter` API (not raw `pyflakes`) once per lint against one whole-notebook source string built by `notebook/buildNotebookSource.ts`. The browser/Pyodide-loading glue lives in `packages/extension/src/offscreen/pyodideRuntime.ts`, not here — this file only owns the pure Python string.
- The ruff engine (`@astral-sh/ruff-wasm-web`, no Python/Pyodide involved) lives entirely in `packages/extension/src/offscreen/ruffRuntime.ts` — nothing ruff-specific lives in `packages/core`.
- The extension picks flake8 or ruff at runtime based on user settings (`EngineClient`, parameterized by engine) — they are not composed, and there is no third "handmade" engine anymore (removed; it duplicated what real Python tooling does better and required touching three files per rule).
- `pyodide/` assets are copied into `dist/pyodide` by the `copy-pyodide` build step and later consumed by the extension's webpack copy plugin — **core must be built before extension**, even though extension's webpack aliases `@kaggle-lint/core`/`@kaggle-lint/ui-components` to their `src/` (not `dist/`) for TS compilation.

### `packages/ui-components` — `@kaggle-lint/ui-components`

React components only (`Overlay`, `ErrorList`, `ErrorItem`), CSS-modules-style scoped styling, no linting logic. Peer-deps on React 18; depends on `@kaggle-lint/core` only for types.

### `packages/extension` — `@kaggle-lint/extension`

Wires core + ui-components into a Chrome MV3 extension via webpack.

- Two entry points: `content/index.tsx` (injected into Kaggle notebook pages, mounts `ContentApp`) and `popup/index.tsx` (toolbar popup, mounts `PopupApp`).
- `utils/KaggleDomParser.ts` — scrapes Python source out of Kaggle's Jupyter/CodeMirror 6 DOM (`.jp-Cell` / `.jp-CodeCell` / `.cm-editor`), with a CM6-API extraction path and a DOM-textContent fallback. This is inherently coupled to Kaggle's current notebook markup and is the most likely thing to break if Kaggle changes their frontend.
- `utils/CodeMirrorManager.ts` — syncs extracted cells for downstream use.
- `content/ContentApp.tsx` is the central control loop: extracts cells → sends them to whichever engine (`flake8` or `ruff`) `settings.linterEngine` names, via `EngineClient` (`chrome.runtime` messaging to the background service worker, which relays to the offscreen document) → lints → feeds errors into `<Overlay>`. Settings are persisted via `chrome.storage.sync` and pushed to the content script via `chrome.runtime.onMessage` (`runLinter` / `toggleOverlay` / `settingsChanged` message types) from the popup. Keyboard shortcuts (Ctrl+Shift+L re-lint, Ctrl+Shift+H toggle overlay) are bound directly in this component.
- `webpack.config.js` copies `manifest.json`, icons, `Overlay.css` from ui-components, `popup.css` from **`old-linter/src/popup/popup.css`**, and `pyodide/` from `packages/core/dist/pyodide` — the extension build has a real (not just historical) dependency on `old-linter/`, not only on the two other workspace packages.
- `manifest.json` content script matches are scoped to `kaggle.com/code/*/*/edit` and Kaggle's Jupyter proxy domain; `web_accessible_resources` is wide open (`<all_urls>`) to allow the Pyodide/CDN loading path.

### `old-linter/`

Original vanilla-JS implementation. Treated as a migration reference in most of the codebase, but the extension's webpack build still pulls `popup.css` from here directly — don't delete without updating `packages/extension/webpack.config.js`.

## CI

`.github/workflows/ci.yml` runs four independent jobs (lint, type-check, test, build) on push/PR to `main`/`develop`/`copilot/**`; `.github/workflows/release.yml` builds and packages the extension on version tags.
