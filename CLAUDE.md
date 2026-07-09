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
Pure TypeScript linting engine, no DOM dependencies, usable standalone in Node.

- `types/index.ts` — shared types: `LintError`, `LintContext`, `LintRule`, `LintResult`.
- `rules/` — one class per lint rule, each extending `BaseRule` (implements `LintRule`, `run(code, cellOffset, context?) => LintError[]`). `rules/index.ts` exports `DEFAULT_RULES`.
- `engines/LintEngine.ts` — orchestrates the custom rules. Key behavior: `lintNotebook()` accumulates a cross-cell `LintContext` (`definedNames`) as it walks cells in order, so a variable defined in cell 1 is recognized in cell 3. Only rules listed in `CONTEXT_AWARE_RULES` (currently `undefinedVariables`) receive/consume that context; other rules run per-cell in isolation.
- `engines/Flake8Engine.ts` — alternate linting engine. Loads Pyodide (Python-in-WASM) in the browser, installs `flake8`/`pyflakes` via micropip, and runs a Python shim (embedded as a string in this file) that wraps pyflakes with its own notebook-context tracking (`_notebook_context` global in the Python runtime, mirroring the TS engine's cross-cell awareness). Pyodide asset path resolves via `chrome.runtime.getURL()` when running as an extension, else falls back to jsDelivr CDN.
- Both engines expose the same shape: `lint(code, offset)`, `lintNotebook(cells)`, `getStats(errors)`. The extension picks one or the other at runtime based on user settings — they are not composed.
- `pyodide/` assets are copied into `dist/pyodide` by the `copy-pyodide` build step and later consumed by the extension's webpack copy plugin — **core must be built before extension**, even though extension's webpack aliases `@kaggle-lint/core`/`@kaggle-lint/ui-components` to their `src/` (not `dist/`) for TS compilation.

### `packages/ui-components` — `@kaggle-lint/ui-components`
React components only (`Overlay`, `ErrorList`, `ErrorItem`), CSS-modules-style scoped styling, no linting logic. Peer-deps on React 18; depends on `@kaggle-lint/core` only for types.

### `packages/extension` — `@kaggle-lint/extension`
Wires core + ui-components into a Chrome MV3 extension via webpack.

- Two entry points: `content/index.tsx` (injected into Kaggle notebook pages, mounts `ContentApp`) and `popup/index.tsx` (toolbar popup, mounts `PopupApp`).
- `utils/KaggleDomParser.ts` — scrapes Python source out of Kaggle's Jupyter/CodeMirror 6 DOM (`.jp-Cell` / `.jp-CodeCell` / `.cm-editor`), with a CM6-API extraction path and a DOM-textContent fallback. This is inherently coupled to Kaggle's current notebook markup and is the most likely thing to break if Kaggle changes their frontend.
- `utils/CodeMirrorManager.ts` — syncs extracted cells for downstream use.
- `content/ContentApp.tsx` is the central control loop: extracts cells → picks `LintEngine` (handmade) or `Flake8Engine` based on `settings.linterEngine` → lints → feeds errors into `<Overlay>`. Settings are persisted via `chrome.storage.sync` and pushed to the content script via `chrome.runtime.onMessage` (`runLinter` / `toggleOverlay` / `settingsChanged` message types) from the popup. Keyboard shortcuts (Ctrl+Shift+L re-lint, Ctrl+Shift+H toggle overlay) are bound directly in this component.
- `webpack.config.js` copies `manifest.json`, icons, `Overlay.css` from ui-components, `popup.css` from **`old-linter/src/popup/popup.css`**, and `pyodide/` from `packages/core/dist/pyodide` — the extension build has a real (not just historical) dependency on `old-linter/`, not only on the two other workspace packages.
- `manifest.json` content script matches are scoped to `kaggle.com/code/*/*/edit` and Kaggle's Jupyter proxy domain; `web_accessible_resources` is wide open (`<all_urls>`) to allow the Pyodide/CDN loading path.

### `old-linter/`
Original vanilla-JS implementation. Treated as a migration reference in most of the codebase, but the extension's webpack build still pulls `popup.css` from here directly — don't delete without updating `packages/extension/webpack.config.js`.

## Adding a lint rule

Extend `BaseRule` in `packages/core/src/rules/`, implement `run(code, cellOffset, context?)`, export it from `rules/index.ts`, and (if it should be user-toggleable in the extension) add it to `RULE_MAP` and `DEFAULT_SETTINGS.rules` in `packages/extension/src/content/ContentApp.tsx`. If the rule needs cross-cell awareness, add its name to `CONTEXT_AWARE_RULES` in `LintEngine.ts` and make sure `run()` returns `{ errors, definedNames }` rather than a bare array.

## CI

`.github/workflows/ci.yml` runs four independent jobs (lint, type-check, test, build) on push/PR to `main`/`develop`/`copilot/**`; `.github/workflows/release.yml` builds and packages the extension on version tags.
