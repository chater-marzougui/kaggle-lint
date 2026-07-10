# Architecture

How kaggle-lint is structured today (v2.0.0, post TypeScript/React migration, and post an unplanned "lint-engine-consolidation" project that landed 2026-07-10 between Milestone 3 and Milestone 4 — see the note at the end of this file). This documents the **actual** current state, including flaws — see [review-findings.md](review-findings.md) for the itemized problems and [next_plans/](next_plans/) for the fixes.

## Monorepo layout

npm workspaces + Turborepo. Build order is enforced by `turbo.json` (`build` → `dependsOn: ["^build"]`):

```
core  →  ui-components  →  extension
```

```
kaggle-lint/
├── packages/
│   ├── core/            @kaggle-lint/core          — shared notebook/lint logic (pure TS, no DOM)
│   ├── ui-components/   @kaggle-lint/ui-components — React overlay UI
│   └── extension/       @kaggle-lint/extension     — Chrome MV3 extension (webpack)
├── old-linter/          original vanilla-JS extension (reference + still a build input, see below)
├── turbo.json           task pipeline
├── tsconfig.base.json   shared strict TS config
└── .github/workflows/   ci.yml (lint/type-check/test/build), release.yml (tag → zip → GitHub release)
```

## packages/core

Pure TypeScript, no DOM dependencies, tested with Jest (ts-jest, node env). **The handmade rule engine described in earlier versions of this document (`engines/LintEngine.ts`, `rules/` — nine regex/line-based rule classes, `BaseRule`, a rule registry) was deleted entirely** by the lint-engine-consolidation project (2026-07-10) — it duplicated what real Python tooling does better and required touching three files per rule (finding F14, now moot: the subsystem it described no longer exists). There is no "built-in"/handmade engine anymore.

### Shared notebook logic

- `notebook/buildNotebookSource.ts` — concatenates a notebook's cells into ONE Python source string for a single whole-notebook lint pass (the "nbqa technique"): magic commands (`%foo`) and shell escapes (`!foo`) are blanked in place (preserving line counts), with a bracket/quote/comment-aware scan so a real continuation line (e.g. old-style `%`-format string wrapping, or a `!=` comparison split across lines) is never mistaken for a magic line. Also exports `mapLineToCell()` to map a diagnostic's global line back to `(cellIndex, cellLine)`.
- `notebook/severityMapping.ts` — `classifySeverity()` (F-codes and syntax-error codes `E999`/`invalid-syntax` → error, else → warning — neither engine's real API exposes severity natively) and `mapDiagnostics()` (applies the offset-mapping above plus severity/rule/code tagging).
- `notebook/lintWithSyntaxIsolation.ts` — real notebooks routinely contain cells that were never meant to run; a genuine Python SyntaxError in any one cell would otherwise make flake8/ruff bail on the WHOLE concatenated file, hiding every other cell's findings. This function runs the whole-notebook pass first (fast path, correct cross-cell scoping); if the result is ONLY syntax-error diagnostics, it excludes the implicated cell(s) (keeping their syntax-error finding, correctly cell-mapped) and retries on the remaining cells — bounded by `cells.length + 1` attempts. Engine-agnostic: both runtimes inject their own single-pass call and their own "is this result syntax-error-only" predicate.
- `engines/flake8Shim.ts` — `PYTHON_SHIM`, the Python source run once inside Pyodide. Calls flake8's REAL `Application`/`StyleGuide`/`BaseFormatter` API (not raw pyflakes, and not `flake8.api.legacy.get_style_guide()` — that convenience wrapper cannot capture structured results) once per lint against the one whole-notebook source string. This file only owns the pure Python string; the Pyodide-loading glue lives in the extension package.

The ruff engine (`@astral-sh/ruff-wasm-web`, no Python/Pyodide involved at all) lives entirely in the extension package (`packages/extension/src/offscreen/ruffRuntime.ts`) — nothing ruff-specific lives in `packages/core`.

### Pyodide assets

`src/pyodide/` holds the Pyodide 0.24.1 runtime (`pyodide.js`, `pyodide.asm.wasm`, `python_stdlib.zip`, micropip wheel — ~19 MB total) **plus bundled flake8/pyflakes/pycodestyle/mccabe wheels** (`src/pyodide/wheels/`, added in Milestone 3 — F9 is resolved, install is from these local `chrome.runtime.getURL()` paths only, never PyPI at runtime). The core `build` script copies everything to `dist/pyodide`, and the extension's webpack copies them from there into the extension bundle.

## packages/ui-components

React 18 components: `Overlay` (draggable panel, minimize, refresh, stats), `ErrorList` (sorts by severity then cell position before rendering), `ErrorItem`. Notable properties:

- Types in `src/types/index.ts` now import `Severity`/`LintError` from `@kaggle-lint/core` instead of duplicating them (F15, resolved in Milestone 4). `LintUIError extends LintError` (added in Milestone 7/8, with `cellLine`/`element`/`uuid`) is the type every UI component actually receives.
- `Overlay.tsx` mixes React state with direct DOM manipulation (minimize animation, close button set `style.display` directly) — a verbatim port of the old vanilla overlay. Unchanged by the consolidation project (F11's full fix is still Milestone 6, Task 1).
- Build is `tsc && npm run copy-css` (Milestone 4) — a `copyfiles` step (mirroring core's own `copy-pyodide` pattern) now copies `Overlay.css` into `dist/Overlay/Overlay.css` alongside the compiled `Overlay.js` that imports it, so the published package shape (`main: dist/index.js`) is honest again (F23, resolved). `main`/`types` deliberately still point at `dist/`, not `src/` — tested during Milestone 4 and found that `packages/extension/tsconfig.json` directly `include`s ui-components' `composite: true` src tree, which requires a built `dist/` regardless of `package.json`'s fields (a `TS6305` composite-project check), so switching to `src/` wouldn't have removed the dist dependency anyway.

## packages/extension

Chrome Manifest V3 extension, bundled by webpack with two entries:

### Runtime contexts

```
┌─ Kaggle notebook page (kaggle.com/code/*/edit + jupyter-proxy iframe) ─┐
│                                                                        │
│  MAIN world (page JS, CodeMirror 6 instances, JupyterLab app)          │
│    page/pageExtractor.ts — MAIN-world script added in Milestone 2,     │
│    reads cell source directly from Kaggle's real JupyterLab            │
│    Application instance (window.jupyterapp), immune to scroll/         │
│    virtualization; falls back to DOM scraping where unreachable        │
│                                                                        │
│  ISOLATED world (content script: content.js)                           │
│    ContentApp (React) ── mounts #kaggle-linter-root overlay            │
│    ├─ KaggleDomParser — bridges to pageExtractor.ts, DOM-scrape        │
│    │   fallback (.jp-Cell/.cm-editor)                                  │
│    ├─ CodeMirrorManager — cell store, actively read (getAllCells())   │
│    │   so lint survives cells Kaggle has unloaded from the DOM         │
│    ├─ EngineClient — chrome.runtime messaging to whichever engine     │
│    │   (flake8 or ruff) settings.linterEngine names                    │
│    └─ <Overlay/> from ui-components                                    │
└────────────────────────────────────────────────────────────────────────┘
        ▲ chrome.runtime.onMessage (runLinter / toggleOverlay / settingsChanged)
        │ chrome.storage.sync (linterSettings)
┌─ Popup (popup.html/popup.js) ─┐   ┌─ Background service worker ─┐   ┌─ Offscreen document ─┐
│  PopupApp (React): engine     │   │  Relays ENGINE_LINT_NOTEBOOK/│   │  PyodideRuntime      │
│  radio (flake8/ruff),         │──►│  ENGINE_STATUS to the        │──►│  (flake8, via        │
│  per-engine ignore-codes      │   │  offscreen document via a    │   │  Pyodide) and        │
│  input, actions                │   │  wrapped ENGINE_OFFSCREEN_   │   │  RuffRuntime (ruff,  │
└───────────────────────────────┘   │  REQUEST envelope; owns the  │   │  via WASM, no Python)│
                                     │  offscreen document's        │   └───────────────────────┘
                                     │  create/reuse lifecycle       │
                                     └───────────────────────────────┘
```

The background service worker + offscreen document (added in Milestone 3) exist because content scripts inherit the host page's CSP for WASM instantiation — Kaggle's CSP doesn't grant `wasm-unsafe-eval` — so both engines must run in an extension-owned page instead.

### Content script flow (`content/ContentApp.tsx`)

1. On mount: detect theme, load `linterSettings` from `chrome.storage.sync`, schedule first lint after 1 s plus a one-time catch-up lint at 4 s (Kaggle's cell content sometimes finishes loading after the first pass).
2. `runLinter()`: `KaggleDomParser.extractCells()` → merge into `CodeMirrorManager`'s store → lint from the store (survives cells Kaggle has unloaded), enriched with live element references → `EngineClient.lintNotebook(settings.linterEngine, cells, ignoreCodes)` → `setErrors()` → `<Overlay/>` renders them, sorted by severity then cell position.
3. Re-lint triggers: Ctrl+Shift+L, popup "Re-lint Now"/settings-changed messages, and a debounced `MutationObserver` on `.cm-content` scoped to whichever cell currently has focus (added in Milestone 2 — the "no real-time linting" gap, finding F8, is resolved).
4. The `runLinterRef` indirection pattern (a ref holding the latest `runLinter` closure, read by effects instead of depended on directly) means no effect lists `runLinter` in its dependency array — the infinite re-lint loop (finding F2) is resolved since Milestone 1.

### Code extraction (`utils/KaggleDomParser.ts`, `page/pageExtractor.ts`)

The CodeMirror-6-API path this document originally described (`element.cmView.state.doc`) was dead code — isolated worlds can't see page-JS expando properties. The real primary path, discovered live during Milestone 2, is `page/pageExtractor.ts`: a MAIN-world content script that reads cell source directly off Kaggle's real JupyterLab `Application` instance (`window.jupyterapp.shell.currentWidget.content.widgets[i].model.sharedModel.getSource()`) — full text, immune to scroll position or virtualization — and relays it to the isolated-world content script via `window.postMessage`. `KaggleDomParser` falls back to scraping `.cm-line` DOM text (lossy on virtualized/off-screen cells) only where `jupyterapp` isn't reachable.

### Webpack (`webpack.config.js`)

- Aliases `@kaggle-lint/core` and `@kaggle-lint/ui-components` to their **`src/`** (not `dist/`), so TS compiles from source; yet the CopyPlugin pulls `pyodide/` from `core/dist/` — core must still be built first.
- Copies `popup.css` from `src/popup/popup.css` — moved into this package in Milestone 4 (finding F18, resolved); the extension's webpack build no longer depends on `old-linter/` at all.
- Two extra entries beyond `content`/`popup` since Milestone 3: `background/index.ts` and `offscreen/index.ts`.
- `manifest.json`, icons, `Overlay.css` (→ `content.css`), the Pyodide runtime + bundled flake8 wheels, and (since the lint-engine-consolidation project) `ruff_wasm_bg.wasm` (resolved via `require.resolve('@astral-sh/ruff-wasm-web/package.json')`, not a hardcoded path) are also copied.

### Manifest (`public/manifest.json`)

MV3. Content script matches `https://www.kaggle.com/code/*/*/edit` and the Kaggle jupyter-proxy domain — the nonsensical Pyodide CDN URL match was removed in Milestone 4 (finding F17, resolved). Permissions: `activeTab`, `storage`, and (since Milestone 3) `offscreen` — the unused `scripting` permission was also removed in Milestone 4. `web_accessible_resources` is now narrowed to `pyodide/*`/`icons/*` scoped to the two real Kaggle origins (was `["*"]` for `<all_urls>`, F17). `background.service_worker` and `content_security_policy.extension_pages` were added in Milestone 3 — there **is** a background service worker now (see the runtime-contexts diagram above); the earlier "no background service worker" claim in this document was true pre-M3 and is no longer accurate.

## CI/CD

- **ci.yml**: four jobs on push/PR — lint (`npm run lint` = `turbo run lint`; each package now defines a real `"lint": "eslint src --ext .ts,.tsx"` script as of Milestone 4, so this job actually checks something for the first time — F4 was the *CI-wiring* finding and is formally credited to Milestone 5, but the underlying no-op is gone as of this milestone), type-check, test (core and now the lint-engine-consolidation project's additional core test suites; extension still has no test runner), build (uploads extension dist artifact). F5 (dead coverage upload) is still open, Milestone 5.
- **release.yml**: on `v*.*.*` tags — build, zip `packages/extension/dist`, GitHub release with hardcoded "What's New" notes (F28, still open, Milestone 6).

## Settings & versioning

- Settings shape is now `{ linterEngine: 'flake8' | 'ruff', flake8IgnoreCodes: string, ruffIgnoreCodes: string }` persisted in `chrome.storage.sync`'s `linterSettings` key — the old `{ linterEngine: 'handmade'|'flake8', rules: Record<string, boolean> }` shape (and its triple duplication of rule metadata, finding F14) no longer exists; there is no settings migration for users with old stored values (a deliberate decision — see `docs/superpowers/specs/2026-07-09-lint-engine-consolidation-design.md`). Defaults are still independently duplicated between `ContentApp.tsx` and `PopupApp.tsx` (two copies now, not three — no third rule-registry copy exists anymore since there are no rules).
- Version is now single-sourced from root `package.json` into the shipped manifest (via a webpack `CopyPlugin` transform) and the popup footer (via `process.env.EXTENSION_VERSION`, a `DefinePlugin` substitution) — Milestone 4, finding F21, mostly resolved. `public/manifest.json`'s own `"version"` field is a deliberate `"0.0.0"` canary (so a bypassed transform ships something obviously wrong, not silently stale); the three per-package `package.json`s (core/ui-components/extension) still independently say `"2.0.0"`, left as-is since those are internal `*`-linked workspace references that never ship.

## Note: the lint-engine-consolidation project (2026-07-10)

Between Milestone 3 (merged) and Milestone 4 (not yet started), an unplanned project — not part of the original M1-M6 roadmap — deleted the handmade rule engine entirely, rewrote the flake8 engine to use flake8's real API on a whole-notebook single pass (replacing the old per-cell `ContextAwareChecker` hand-rolled cross-cell tracking), and added ruff as a second engine. Full spec: `docs/superpowers/specs/2026-07-09-lint-engine-consolidation-design.md`; full implementation plan and execution ledger: `docs/superpowers/plans/2026-07-09-lint-engine-consolidation.md`. This document, `docs/next_plans/README.md`, `docs/next_plans/DEVELOPER_PROMPTS.md`, and the Milestone 4/5/6 plans were all updated 2026-07-10 to reflect this — see those files' own change notes for what specifically was rescoped or marked moot.
