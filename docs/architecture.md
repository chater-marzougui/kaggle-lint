# Architecture

How kaggle-lint is structured today (v2.0.0, post TypeScript/React migration). This documents the **actual** current state, including flaws — see [review-findings.md](review-findings.md) for the itemized problems and [next_plans/](next_plans/) for the fixes.

## Monorepo layout

npm workspaces + Turborepo. Build order is enforced by `turbo.json` (`build` → `dependsOn: ["^build"]`):

```
core  →  ui-components  →  extension
```

```
kaggle-lint/
├── packages/
│   ├── core/            @kaggle-lint/core          — lint engines + rules (pure TS, no DOM)
│   ├── ui-components/   @kaggle-lint/ui-components — React overlay UI
│   └── extension/       @kaggle-lint/extension     — Chrome MV3 extension (webpack)
├── old-linter/          original vanilla-JS extension (reference + still a build input, see below)
├── turbo.json           task pipeline
├── tsconfig.base.json   shared strict TS config
└── .github/workflows/   ci.yml (lint/type-check/test/build), release.yml (tag → zip → GitHub release)
```

## packages/core

Pure TypeScript, no DOM dependencies, tested with Jest (ts-jest, node env).

### Two lint engines, swapped at runtime (never composed)

**`engines/LintEngine.ts`** — the "handmade"/built-in engine.
- Constructed with an array of `LintRule` instances (default: `DEFAULT_RULES` from `rules/index.ts`).
- `lintNotebook(cells)` walks cells in order, accumulating a cross-cell `LintContext` (`definedNames`) so a variable defined in cell 1 is known in cell 3.
- Only rules named in `CONTEXT_AWARE_RULES` (currently just `undefinedVariables`) consume that context. Context extraction reaches into the rule via `as any` (`resetContext`, `extractDefinedNamesPublic`) — untyped private API.

**`engines/Flake8Engine.ts`** — Pyodide-based engine.
- Loads Pyodide (Python compiled to WASM), installs flake8 via `micropip.install('flake8')` (network → PyPI at runtime; wheels are **not** bundled), then runs a large embedded Python shim string that wraps pyflakes with its own notebook-context tracking (a `_notebook_context` set global in the Python runtime — a parallel reimplementation of LintEngine's cross-cell logic).
- Resolves Pyodide assets via `chrome.runtime.getURL('pyodide/')` when in an extension, else jsDelivr CDN.
- Loads `pyodide.js` by appending a `<script>` tag — which executes in the page's MAIN world, while the engine reads `window.loadPyodide` from the content script's isolated world. **This cannot work inside the extension** (review finding F1).

Both engines expose the same shape: `lint(code, offset)`, `lintNotebook(cells)`, `getStats(errors)` — but there is no shared interface type; each redeclares `NotebookCell`/`NotebookError`/`ErrorStats` locally.

### Rules

`rules/` — one class per rule, each extending `BaseRule` (`run(code, cellOffset, context?) → LintError[] | LintResult`). Nine rules: undefinedVariables, capitalizationTypos, duplicateFunctions, emptyCells, importIssues, indentationErrors, missingReturn, redefinedVariables, unclosedBrackets. All are regex/line-based analyzers (no real Python parsing).

### Pyodide assets

`src/pyodide/` holds the Pyodide 0.24.1 runtime (`pyodide.js`, `pyodide.asm.wasm`, `python_stdlib.zip`, micropip wheel — ~19 MB total). The core `build` script copies them to `dist/pyodide`, and the extension's webpack copies them from there into the extension bundle. **Flake8's own wheels are not among them** — flake8 install requires network.

## packages/ui-components

React 18 components: `Overlay` (draggable panel, minimize, refresh, stats), `ErrorList`, `ErrorItem`. Notable properties:

- Types in `src/types/index.ts` **duplicate** core's `LintError`/`Severity` (comment claims circular-dependency avoidance; no cycle actually exists — ui-components already depends on core in package.json).
- `Overlay.tsx` mixes React state with direct DOM manipulation (minimize animation, close button set `style.display` directly) — a verbatim port of the old vanilla overlay.
- Build is plain `tsc` — `Overlay.css` is imported by the component but never copied to `dist/`, so the published package shape (`main: dist/index.js`) is broken for standalone consumption. It only works because the extension's webpack aliases `@kaggle-lint/ui-components` to `src/`.

## packages/extension

Chrome Manifest V3 extension, bundled by webpack with two entries:

### Runtime contexts

```
┌─ Kaggle notebook page (kaggle.com/code/*/edit + jupyter-proxy iframe) ─┐
│                                                                        │
│  MAIN world (page JS, CodeMirror 6 instances)                          │
│    ⚠ nothing from this extension runs here (old-linter had             │
│      pageInjection.js for this; the migration dropped it)              │
│                                                                        │
│  ISOLATED world (content script: content.js)                           │
│    ContentApp (React) ── mounts #kaggle-linter-root overlay            │
│    ├─ KaggleDomParser  — scrape .jp-Cell/.cm-editor DOM                │
│    ├─ CodeMirrorManager — cell store (written, never read = dead)      │
│    ├─ LintEngine (handmade) or Flake8Engine per settings               │
│    └─ <Overlay/> from ui-components                                    │
└────────────────────────────────────────────────────────────────────────┘
        ▲ chrome.runtime.onMessage (runLinter / toggleOverlay / settingsChanged)
        │ chrome.storage.sync (linterSettings)
┌─ Popup (popup.html/popup.js) ─┐
│  PopupApp (React): engine     │      (no background service worker exists)
│  radio, rule toggles, actions │
└───────────────────────────────┘
```

### Content script flow (`content/ContentApp.tsx`)

1. On mount: detect theme, load `linterSettings` from `chrome.storage.sync` (async, unawaited), schedule first lint after 1 s.
2. `runLinter()`: `KaggleDomParser.extractCells()` → `CodeMirrorManager.syncCells()` (result unused) → pick engine by `settings.linterEngine` → `lintNotebook()` → `setErrors()` → `<Overlay/>` renders them.
3. Re-lint triggers: Ctrl+Shift+L, popup "Re-lint Now" message, settings-changed message. There is **no** MutationObserver — despite README's "real-time feedback" claim, edits do not trigger linting.
4. The mount effect depends on `runLinter`, whose useCallback identity changes every time `isLinting` or settings flip → the effect re-schedules a lint each time → **infinite re-lint loop** (finding F2).

### Code extraction (`utils/KaggleDomParser.ts`)

Two strategies: (1) CodeMirror 6 API via `element.cmView.state.doc` — dead code in the extension because isolated worlds can't see page-JS expando properties; (2) DOM scrape of `.cm-line` textContent — the only path that actually runs, and it only sees cells currently rendered by Kaggle's virtualized notebook (off-screen cells are missing or force-rendered one at a time via `scrollIntoView`). `scrollToLine()` is a `console.log` placeholder.

### Webpack (`webpack.config.js`)

- Aliases `@kaggle-lint/core` and `@kaggle-lint/ui-components` to their **`src/`** (not `dist/`), so TS compiles from source; yet the CopyPlugin pulls `pyodide/` from `core/dist/` — core must still be built first.
- Copies `popup.css` from **`old-linter/src/popup/popup.css`** — a live build dependency on the legacy folder.
- `manifest.json`, icons, and `Overlay.css` (→ `content.css`) are also copied.

### Manifest (`public/manifest.json`)

MV3. Content script matches `https://www.kaggle.com/code/*/*/edit`, the Kaggle jupyter-proxy domain, and — nonsensically — the Pyodide CDN URL. Permissions: `activeTab`, `storage`, `scripting` (unused). `web_accessible_resources: ["*"]` for `<all_urls>` (far too broad). No background service worker, no `options_page`.

## CI/CD

- **ci.yml**: four jobs on push/PR — lint (`npm run lint` = `turbo run lint`, but **no package defines a `lint` script**, so it checks nothing except the separate `format:check` step), type-check, test (only core has tests; codecov upload points at an lcov file that plain `jest` never generates), build (uploads extension dist artifact).
- **release.yml**: on `v*.*.*` tags — build, zip `packages/extension/dist`, GitHub release with hardcoded "What's New" notes.

## Settings & versioning

- Settings shape `{ linterEngine: 'handmade'|'flake8', rules: Record<string, boolean> }` persisted in `chrome.storage.sync`; defaults duplicated in `ContentApp.tsx` and `PopupApp.tsx`, rule display metadata duplicated again in `PopupApp.tsx`'s `RULES` array, and the actual rule classes registered in a third place (`ContentApp`'s `RULE_MAP`) plus core's `DEFAULT_RULES`.
- Version "2.0.0" is hardcoded independently in root package.json, three package.jsons, manifest.json, PopupApp's footer, and webpack's `EXTENSION_VERSION` default.
