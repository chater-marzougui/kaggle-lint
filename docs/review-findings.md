# Whole-Repo Review Findings

Full review performed 2026-07-09 on `main` (aac0c02 + uncommitted working-tree changes). Each finding has an ID (referenced by the milestone plans in `next_plans/`), a severity, and exact locations.

Severity scale: **P0** = product is broken for users · **P1** = incorrect behavior / silent failure · **P2** = hygiene, duplication, misconfiguration · **P3** = polish.

---

## P0 — Broken as shipped

### F1. Flake8 engine cannot work inside the extension (isolated-world violation)
`packages/core/src/engines/Flake8Engine.ts:313-332` loads Pyodide by appending a `<script src=".../pyodide.js">` tag to the document. In an MV3 content script that script executes in the page's **MAIN world**, but the engine then reads `window.loadPyodide` from the content script's **isolated world** — where it will never appear. The old implementation solved exactly this with `old-linter/src/pageInjection.js` (MAIN-world script + message bridge); the migration dropped it. Additionally, even if loading worked, WASM compilation in the content-script context is subject to the page's CSP (`wasm-unsafe-eval`), which Kaggle does not grant.
**Consequence:** selecting "Flake8" in the popup hangs forever on first lint.
**Fix:** Milestone 3 (run Pyodide in an extension-owned context — offscreen document).

### F2. Infinite re-lint loop in the content script
`packages/extension/src/content/ContentApp.tsx:183-217`. The mount effect (`useEffect(..., [domParser, runLinter])`) schedules `runLinter()` after 1 s. `runLinter` is a `useCallback` whose deps include `isLinting` and `settings`, so its identity changes every time a lint starts and finishes → the mount effect re-runs → schedules another lint → forever. The extension lints continuously every ~1 s + lint duration for the lifetime of the page, burning CPU and spamming the console.
**Fix:** Milestone 1, Task 1.

### F3. CodeMirror API extraction path is dead code; extraction is lossy DOM scraping
`packages/extension/src/utils/KaggleDomParser.ts:160-171`: `(editorElement as any).cmView` is a page-JS expando property — invisible from the isolated world, so "Method 1 (most reliable)" never fires. All extraction falls through to scraping `.cm-line` textContent, which (a) only sees lines CodeMirror has rendered (long cells are virtualized → truncated code), (b) only sees cells currently in the DOM (Kaggle virtualizes the notebook → off-screen cells missed), and (c) the "force render" workaround (`scrollIntoView` per cell, `KaggleDomParser.ts:144-148`) fights the user's scroll position. The file itself admits it: "*This is a simplified version - the full implementation would be ~400 lines*" (`KaggleDomParser.ts:74`).
**Fix:** Milestone 2 (restore MAIN-world extraction via a bridge, merge with the cell store).

---

## P1 — Incorrect or silently failing behavior

### F4. `npm run lint` checks nothing
Root `package.json` maps `lint` → `turbo run lint`, but **no workspace package defines a `lint` script**, so turbo runs zero tasks and exits 0. The CI "Lint" job (`.github/workflows/ci.yml:26-27`) is therefore a no-op (only the separate `format:check` step does anything). ESLint only ever runs via `lint:fix`.
**Fix:** Milestone 5, Task 1.

### F5. CI coverage upload is dead
`.github/workflows/ci.yml:70-75` uploads `./packages/core/coverage/lcov.info` to codecov, but the `test` job runs `npm test` → plain `jest`, which never writes coverage. Also, `jest.config.js` sets a 70% global `coverageThreshold`, which would likely fail if coverage ever were enabled, since only 2 of 11 core source areas have tests.
**Fix:** Milestone 5, Tasks 4–5.

### F6. First lint races settings load
`ContentApp.tsx:192-214`: `chrome.storage.sync.get` is async and un-awaited; the initial lint fires after 1 s regardless. A user who disabled rules or selected Flake8 gets one lint with defaults first.
**Fix:** Milestone 1, Task 2.

### F7. CodeMirrorManager is write-only (dead code path)
`ContentApp.tsx:140` calls `codeMirrorManager.syncCells(cells)`, but nothing ever calls `getAllCells()`/`getCell()`. The store — whose entire purpose is surviving Kaggle's lazy cell unloading — is populated and never read, so its virtualization benefit is lost.
**Fix:** Milestone 2, Task 4 (wire it into extraction) — not deletion, because it's the right tool for F3(b).

### F8. No re-lint on edit, despite "real-time" claims
No MutationObserver / editor-event hook exists anywhere in the extension. Linting runs on mount (in a loop, per F2), on Ctrl+Shift+L, and on popup messages only. `README.md` advertises "Provides real-time code quality feedback".
**Fix:** Milestone 2, Task 5.

### F9. Flake8 requires network access to PyPI at runtime
`Flake8Engine.ts:96-99` runs `micropip.install('flake8')`, fetching wheels from PyPI at runtime. The extension ships 19 MB of Pyodide runtime (`packages/core/src/pyodide/`) but not the ~200 KB of flake8/pyflakes/pycodestyle/mccabe wheels that make it useful. Offline or CSP-restricted → engine fails.
**Fix:** Milestone 3, Task 3 (bundle wheels, install from extension URLs).

### F10. `flake8Status` is plumbed but never rendered
`ContentApp.tsx:320` passes `flake8Status` to `<Overlay/>`; `OverlayProps` declares it (`ui-components/src/types/index.ts:35`) but `Overlay.tsx` never destructures or renders it. Pyodide's 10–30 s first load shows zero feedback (moot until F1 is fixed, but the UI gap is real).
**Fix:** Milestone 1, Task 6.

### F11. Overlay close button permanently desyncs from React state
`Overlay.tsx:265-275`: close sets `overlayRef.current.style.display = 'none'` directly. React still believes `visible === true`, so the popup's "Toggle Overlay" (which flips React state true→false→true) needs two presses to bring it back, and any re-render can resurrect the overlay unexpectedly. Same file mixes direct DOM style manipulation throughout minimize/expand (`Overlay.tsx:135-176`).
**Fix:** Milestone 1, Task 5 (close button); full React-ification in Milestone 6, Task 1.

### F12. Popup messaging has no error handling and wrong page detection
`PopupApp.tsx:109-118` treats any `kaggle.com` URL as "in a notebook", but the content script only injects on `/code/*/*/edit` — on other Kaggle pages every button silently does nothing (plus "Unchecked runtime.lastError" noise, since no `sendMessage` callback checks `chrome.runtime.lastError`).
**Fix:** Milestone 6, Task 3.

### F13. Busy-wait poll while Flake8 loads
`ContentApp.tsx:96-102`: `while (!isReady) await sleep(100)` — a polling loop keyed off `flake8Status` state captured in a stale closure. The engine already exposes a `loadPromise`; this should await it.
**Fix:** Milestone 3, Task 5 (engine client rewrite supersedes this code).

---

## P2 — Duplication, dead code, bad config

### F14. Rule metadata duplicated in three places
- `PopupApp.tsx:12-67` — `RULES` array (id, display name, description, default).
- `ContentApp.tsx:33-59` — `DEFAULT_SETTINGS.rules` + `RULE_MAP` (id → class factory).
- `packages/core/src/rules/index.ts` — `DEFAULT_RULES`.
Adding a rule requires touching all three (plus the README table). Descriptions have already drifted (popup says "Detect missing indentation after colons"; README says "mixed tabs/spaces, unexpected indents").
**Fix:** Milestone 1, Task 3 (single registry in core).

### F15. Core types duplicated into ui-components
`packages/ui-components/src/types/index.ts:6-16` redeclares `Severity`/`LintError` with the comment "duplicated from core to avoid circular dependency" — but ui-components already depends on `@kaggle-lint/core` (its package.json `dependencies`), and no cycle exists. The duplicate has already drifted (missing `code?: string`).
**Fix:** Milestone 4, Task 4.

### F16. Engine-local type triplication
`NotebookCell`, `NotebookError`, `ErrorStats` are declared privately in both `LintEngine.ts:15-36` and `Flake8Engine.ts:23-39` instead of `types/index.ts`. `getStats()` is also implemented twice.
**Fix:** Milestone 4, Task 4.

### F17. Manifest misconfiguration
`packages/extension/public/manifest.json`:
- `content_scripts.matches` includes `https://cdn.jsdelivr.net/pyodide/v0.24.1/full/*` (`manifest.json:39`) — injects the whole linter into CDN pages; nonsense left over from a Pyodide-loading experiment.
- `web_accessible_resources: [{ "resources": ["*"], "matches": ["<all_urls>"] }]` — exposes every extension file to every website (fingerprinting surface); only `pyodide/*` and `icons/*` are needed, only on Kaggle origins.
- `permissions` includes `scripting` — never used (`chrome.scripting` appears nowhere).
- `host_permissions` has five overlapping Kaggle patterns where two suffice.
**Fix:** Milestone 4, Task 1.

### F18. Extension build depends on `old-linter/`
`webpack.config.js:61-63` copies `old-linter/src/popup/popup.css` → `popup.css`. Deleting the legacy folder breaks the build. The popup markup lives in the new package but its stylesheet lives in the old one.
**Fix:** Milestone 4, Task 2.

### F19. Dead/duplicate branch in LintEngine
`LintEngine.ts:90-100`: the `emptyCells` special case executes exactly the same call as the default branch (comment claims it "needs cellIndex passed through context" — it isn't passed). Three branches, two identical.
**Fix:** Milestone 4, Task 5.

### F20. Context plumbing via `as any` private-method calls
`LintEngine.ts:151-201` reaches into `UndefinedVariablesRule` with `(rule as any).resetContext()` and `(rule as any).extractDefinedNamesPublic()` — untyped structural coupling that TypeScript can't check. The `LintRule` interface should declare optional `resetContext?()`/`extractDefinedNames?()`.
**Fix:** Milestone 4, Task 5.

### F21. Version scattered across seven files
"2.0.0" is independently hardcoded in root/3× package.json, `manifest.json:5`, `PopupApp.tsx:351` footer, and `webpack.config.js:49` default. A release bump is a seven-file hunt.
**Fix:** Milestone 4, Task 3.

### F22. Toolchain version inconsistencies
- Root `package.json` engines: `node >=22.19.0`; `README.md:44` says "Node.js 18+".
- Root devDeps pin `@types/react` **18**; core/ui/extension devDeps pin `@types/react` **19** while the runtime dependency is React **18** — hoisting roulette decides which types win.
**Fix:** Milestone 4, Task 6.

### F23. ui-components package build is broken for standalone use
Its `build` is plain `tsc`; `dist/` gets JS that still contains `import './Overlay.css'` but no CSS file (tsc doesn't copy assets). The advertised `main: dist/index.js` can't be consumed. Works today only because webpack aliases to `src/`.
**Fix:** Milestone 4, Task 6 (decide: internal-only package or fix the build).

### F24. README inaccuracies
"21 unit tests passing / All core rules tested" — only 2 test files exist (`LintEngine`, `UndefinedVariablesRule`); 8 of 9 rules are untested. Links at README.md:390-392 point to `EXTENSION_USAGE.md` / `IMPLEMENTATION_SUMMARY.md` / `MIGRATION.md`, deleted in the working tree. "View documentation: check the `/docs` folder and wiki" — `/docs` did not exist until now.
**Fix:** Milestone 6, Task 4.

---

## P3 — Polish / smaller items

### F25. `scrollToLine()` is a placeholder (`KaggleDomParser.ts:200-204` — logs to console).
### F26. `getHandmadeLintEngine()` rebuilds the engine and all rule instances on every lint (`ContentApp.tsx:77-87`), ignoring the ref cache it maintains.
### F27. Console noise: `KaggleDomParser.DEBUG = true` hardcoded; `console.log` throughout ContentApp/engines with no debug gate (webpack defines `process.env.DEBUG` but nothing reads it).
### F28. Release notes are hardcoded marketing text in `release.yml:44-68` — every release claims "TypeScript + React migration complete" regardless of content.
### F29. `errors: any[]` state and `error: any` handlers in ContentApp despite well-defined `LintError` types one import away.
### F30. Old-linter contains a committed `.env` file (`old-linter/.env`) — currently trivial but a bad pattern; should be gitignored/removed with the folder.
### F31. Popup "Built-in Rules" section hides when Flake8 is selected but there is no Flake8 configuration (select ignored codes, severity mapping) — acceptable for now, note for Milestone 6.

---

## Addendum (2026-07-10): findings obsoleted by the lint-engine-consolidation project

An unplanned project — not part of the M1-M6 roadmap, landed between Milestone 3 and Milestone 4 — deleted the entire handmade rule engine (`rules/`, `LintEngine.ts`) and rewrote the flake8 engine. This section is appended, not edited into the findings above, to keep the original review's historical record intact (per the documented convention in `docs/next_plans/milestone-3-working-flake8/notes.md`). Full detail: `docs/superpowers/specs/2026-07-09-lint-engine-consolidation-design.md`.

The following findings are now **moot** — not fixed via their originally-planned milestone task, but obsoleted because the subsystem they described was deleted outright:

- **F14** (rule metadata duplicated in three places) — moot. There are no rules and no rule metadata anymore.
- **F16** (`NotebookCell`/`NotebookError`/`ErrorStats` triplicated across `LintEngine.ts`/`Flake8Engine.ts`) — moot. Both files are deleted; the real shared types now live in `packages/core/src/notebook/` and `packages/core/src/types/index.ts`, declared once.
- **F19** (dead `emptyCells` branch in `LintEngine.lintCell`) — moot. `LintEngine.ts` is deleted.
- **F20** (`as any` private-method coupling for cross-cell context in `LintEngine`) — moot. The whole cross-cell-context mechanism it described (hand-rolled `LintContext`/`resetContext`/`extractDefinedNamesPublic`) is gone, replaced by real Python/Rust scoping over one concatenated whole-notebook source (`packages/core/src/notebook/buildNotebookSource.ts`).
- **F31** (no flake8 ignore-codes configuration UI) — resolved as a side effect, not deferred. The consolidation project shipped a per-engine ignore-codes UI (`PopupApp.tsx`'s "Ignore Codes" section) for both flake8 and ruff.

**F15** (core types duplicated into ui-components) is still open and unaffected by the deletion — the duplicate (`packages/ui-components/src/types/index.ts`) still exists against the surviving `packages/core/src/types/index.ts`. Its `code?: string` gap specifically was patched during the consolidation project (the overlay needed to display violation codes), but the underlying duplication (Milestone 4, Task 4) remains.

**F1's and F13's fix locations have moved again**: F1's `Flake8Engine.ts` (fixed in M3 by deletion) and M3's own replacement, `flake8Shim.ts`, was itself rewritten by the consolidation project to call flake8's real `Application`/`StyleGuide` API on one whole-notebook source instead of per-cell raw pyflakes — both are resolved-and-superseded, not open.

## Summary table

| ID | Severity | Area | One-liner | Milestone |
|-----|----------|------|-----------|-----------|
| F1 | P0 | Flake8 | Pyodide loaded across world boundary — can't work | M3 |
| F2 | P0 | Content script | Infinite re-lint loop | M1 |
| F3 | P0 | Extraction | CM6 API path dead; DOM scrape lossy on virtualized cells | M2 |
| F4 | P1 | CI | `npm run lint` is a no-op | M5 |
| F5 | P1 | CI | Coverage never generated; codecov upload dead | M5 |
| F6 | P1 | Content script | First lint races settings load | M1 |
| F7 | P1 | Extraction | CodeMirrorManager written, never read | M2 |
| F8 | P1 | UX | No re-lint on edit despite "real-time" claim | M2 |
| F9 | P1 | Flake8 | flake8 wheels not bundled; runtime PyPI fetch | M3 |
| F10 | P1 | UI | flake8Status prop passed but never rendered | M1 |
| F11 | P1 | UI | Close button desyncs DOM from React state | M1/M6 |
| F12 | P1 | Popup | No sendMessage error handling; wrong page detection | M6 |
| F13 | P1 | Flake8 | Busy-wait poll instead of awaiting loadPromise | M3 |
| F14 | P2 | Duplication | Rule metadata in 3 places | ~~M1~~ **moot (2026-07-10) — rule system deleted** |
| F15 | P2 | Duplication | Core types copy-pasted into ui-components | M4 |
| F16 | P2 | Duplication | NotebookCell/ErrorStats/getStats duplicated across engines | ~~M4~~ **moot (2026-07-10) — LintEngine.ts/Flake8Engine.ts deleted** |
| F17 | P2 | Config | Manifest: CDN match, WAR `*`, unused `scripting` perm | M4 |
| F18 | P2 | Build | webpack copies popup.css from old-linter | M4 |
| F19 | P2 | Dead code | emptyCells branch identical to default | ~~M4~~ **moot (2026-07-10) — LintEngine.ts deleted** |
| F20 | P2 | Types | `as any` private-method coupling in LintEngine | ~~M4~~ **moot (2026-07-10) — LintEngine.ts deleted** |
| F21 | P2 | Config | Version hardcoded in 7 files | M4 |
| F22 | P2 | Config | Node/React-types version conflicts | M4 |
| F23 | P2 | Build | ui-components dist unusable (CSS not emitted) | M4 |
| F24 | P2 | Docs | README claims false test coverage, dead links | M6 |
| F25–F30 | P3 | Various | Placeholders, console noise, hardcoded release notes, `any`s | M4/M6 |
| F31 | P3 | UX | No flake8 ignore-codes config UI | ~~M6~~ **resolved (2026-07-10) — ignore-codes UI shipped for both engines** |
