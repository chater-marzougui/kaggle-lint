# Milestone 3: A Flake8 Engine That Actually Works — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Flake8/Pyodide engine functional inside the extension: Pyodide runs in an extension-owned context with WASM allowed, flake8 wheels ship in the bundle (no runtime PyPI), and the content script talks to it over `chrome.runtime` messaging.

**Architecture:** Pyodide cannot run in the content script (isolated world + page CSP blocks `wasm-unsafe-eval` — root cause of F1). It runs instead in an **offscreen document** (`chrome.offscreen`), an extension page whose CSP we control. A minimal background service worker creates the offscreen document on demand and relays `FLAKE8_*` messages to it. The content script sends a `FLAKE8_LINT_NOTEBOOK` message; the offscreen document loads Pyodide + bundled wheels, runs the existing Python shim (kept, moved to core), and replies with errors. `packages/core`'s `Flake8Engine` shrinks to the pure parts (the Python shim source + result mapping, both now unit-tested); the browser glue moves to the extension where it belongs.

**Tech Stack:** Chrome MV3 `offscreen` API + background service worker, Pyodide 0.24.1 (already vendored in `packages/core/src/pyodide/`), micropip with local wheel URLs, `chrome.runtime.sendMessage`, TypeScript 5.9 strict (`noUnusedLocals`/`noUnusedParameters`/`isolatedModules` — see Global Constraints).

**Fixes findings:** F1 (Pyodide loaded across world boundary), F9 (flake8 wheels not bundled, runtime PyPI fetch), F13 (busy-wait poll instead of awaiting a promise). See `docs/review-findings.md`. Depends on: Milestone 1 (merged 2026-07-09, commit `02405e0`) and Milestone 2 (merged 2026-07-09, commit `3bd5b0f`).

**Source-of-truth check (done 2026-07-09):** every file this plan touches or reads from was opened in full from the current working tree: `packages/core/src/engines/Flake8Engine.ts` (459 lines — the Python shim is lines 102–292 verbatim, `loadPyodideScript` is lines 313–332, the per-cell mapping is lines 384–390, `lintNotebook` is lines 410–437; all four line ranges the milestone plan cites matched byte-for-byte, so **F1/F9/F13's cited locations are unaffected by M1/M2** — Milestone 2 touched extraction (`KaggleDomParser.ts`, `pageExtractor.ts`, `ContentApp.tsx`'s `runLinter`), not the Flake8 engine itself), `packages/extension/src/content/ContentApp.tsx` (399 lines, current shape confirmed — see below), `packages/extension/webpack.config.js`, `packages/extension/public/manifest.json`, `packages/extension/src/utils/CodeMirrorManager.ts`, `packages/extension/src/page/bridgeProtocol.ts`, `packages/core/src/index.ts`, `packages/core/src/engines/index.ts`, `packages/core/src/types/index.ts`, `packages/core/package.json`, `packages/ui-components/src/types/index.ts`, `packages/ui-components/src/Overlay/Overlay.tsx` (status block at lines 276–281), `packages/extension/package.json`, `packages/extension/tsconfig.json`, `tsconfig.base.json`, root `package.json`, `turbo.json`. `@types/chrome` (extension's own nested copy, resolved version 0.0.246) was grepped directly and confirms `chrome.offscreen.Reason.WORKERS`, `chrome.offscreen.createDocument`, and `chrome.offscreen.hasDocument` all exist with the signatures the milestone plan's Task 1 snippet uses — no substitution needed there.

**Deviations from the milestone plan text** (documented per `docs/next_plans/README.md` rule 5 — none of these change the plan's decisions, all are implementation-ordering/syntax fixes needed because the milestone plan's own snippets left them open or contained a typo):
1. **`packages/extension/src/flake8/protocol.ts` is created in Task 1, not Task 5.** The milestone's Global Constraints already fix the exact protocol shapes and say "both sides import from one module" — but the background worker (Task 1) and the offscreen runtime (Task 2) both need the exact message-type string constants before Task 5's file list would otherwise create the module. Task 5 now only adds `Flake8Client.ts` to that existing directory.
2. **`Flake8LintResponse` is a `type` union, not an `interface`.** The milestone plan's Global Constraints snippet writes `export interface Flake8LintResponse { ok: true; ... } | { ok: false; ... };` — that's not valid TypeScript (you cannot union two interface bodies with `|`). This plan uses `export type Flake8LintResponse = { ok: true; errors: ... } | { ok: false; error: string };`, which is what the snippet's intent requires.
3. **`offscreen.html` has no manual `<script>` tag.** The milestone's Task 1 text says "Offscreen HTML is minimal: `<script src="offscreen.js"></script>`," but this repo's existing `HtmlWebpackPlugin` pattern (see `popup.html`, which has no script tag — webpack injects it via the `chunks` option) auto-injects the entry's script tag. Writing one manually would double-inject it. `offscreen.html` follows the same convention as `popup.html`: a bare `<div>`-free skeleton with no explicit `<script>`, `chunks: ['offscreen']` handles the rest.
4. **Task 4's `npm run type-check`/`npm run build` scope is core-only, not root.** Task 4's own Step 3 already flags that the root build breaks until Task 5 (`ContentApp.tsx` still imports the now-deleted `Flake8Engine`) and calls this "acceptable mid-PR." This plan makes that explicit: Task 4's Verify step runs `cd packages/core && npm test && npm run type-check` only; the Global Constraint "every task ends with root `npm run type-check && npm run build` green" does not apply to Task 4 in isolation — root-level green is required again starting at Task 5's Verify step.

## Global Constraints

- Node >= 22.19.0; run all commands from repo root unless a task says otherwise; Windows executors use Git Bash for `rm -rf`/`&&` (see `docs/next_plans/DEVELOPER_PROMPTS.md` §6).
- Every task **except Task 4** ends with root `npm run type-check && npm run build` passing (see Deviation 4 above for why Task 4 is scoped to `packages/core`).
- Pyodide version stays 0.24.1 (matches vendored assets in `packages/core/src/pyodide/`, confirmed present: `pyodide.js`, `pyodide.asm.js`, `pyodide.asm.wasm`, `pyodide-lock.json`, `python_stdlib.zip`, plus the pre-existing `micropip-0.5.0-py3-none-any.whl` and `packaging-23.1-py3-none-any.whl`). Wheels added in Task 3 must be pure-python versions compatible with Pyodide 0.24's Python 3.11: `flake8`, `pyflakes`, `pycodestyle`, `mccabe`.
- No runtime network access: micropip must install exclusively from `chrome.runtime.getURL('pyodide/wheels/…')` URLs — never `micropip.install('flake8')` (the current F9 bug), never a CDN.
- `tsconfig.base.json` has `"noUnusedLocals": true`, `"noUnusedParameters": true`, and `"isolatedModules": true`. The last one matters for every file that imports only types across the new module boundaries (`protocol.ts`, `flake8Shim.ts`, `flake8Mapping.ts`): use `import { type X }` / `import type { X }`, not a bare `import { X }` for type-only names, or `ts-loader`'s `transpileOnly: true` (`webpack.config.js:24`) can emit a broken runtime import.
- Extension package has **no test runner** (only `packages/core` has Jest — confirmed: `packages/extension/package.json` scripts are `build`/`dev`/`type-check`/`clean` only, no `test`). Verify extension-side tasks with `type-check && build` plus the static `grep`/`ls` checks each task specifies; do not invent a Jest suite for the extension package — that's Milestone 5's job.
- Do not change the `chrome.storage.sync` settings shape `{ linterEngine: 'handmade' | 'flake8', rules: Record<string, boolean> }`.
- No effect in `ContentApp.tsx` may list `runLinter` (or any callback whose identity changes across renders) in its dependency array — always go through `runLinterRef.current()` (the F2 fix from Milestone 1, confirmed still in place: `ContentApp.tsx:170-172` syncs `runLinterRef.current = runLinter` in its own effect, and every other effect/handler calls `runLinterRef.current()`).
- Message protocol (exact shapes, all three contexts import from `packages/extension/src/flake8/protocol.ts`):

```ts
export const FLAKE8_LINT_NOTEBOOK = 'FLAKE8_LINT_NOTEBOOK' as const;
export const FLAKE8_STATUS = 'FLAKE8_STATUS' as const;

export interface Flake8CellInput {
  code: string;
  cellIndex: number;
}

export interface Flake8LintRequest {
  type: typeof FLAKE8_LINT_NOTEBOOK;
  cells: Flake8CellInput[];
}

export type Flake8ResultError = LintError & { cellIndex: number; cellLine: number };

export type Flake8LintResponse =
  | { ok: true; errors: Flake8ResultError[] }
  | { ok: false; error: string };

export interface Flake8StatusRequest {
  type: typeof FLAKE8_STATUS;
}

export type Flake8Status = 'unloaded' | 'loading' | 'ready' | 'failed';

export interface Flake8StatusResponse {
  status: Flake8Status;
}
```

- Manifest additions (on top of the current `packages/extension/public/manifest.json`, confirmed to currently have `"permissions": ["activeTab", "storage", "scripting"]`, no `background` key, no `content_security_policy` key): add `"offscreen"` to `permissions`, add `"background": { "service_worker": "background.js" }`, add `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }`. Do **not** touch the existing two `content_scripts` entries (the leftover CDN match in the first entry is F17, out of scope — Milestone 4's job) or the `web_accessible_resources` block (also F17/Milestone 4).

## File Structure

| File | Responsibility after this milestone |
|---|---|
| `packages/extension/src/flake8/protocol.ts` (new, Task 1) | Single source of truth for the `FLAKE8_LINT_NOTEBOOK`/`FLAKE8_STATUS` message shapes and the `Flake8Status` type — imported by background, offscreen, and the content-script client. |
| `packages/extension/src/background/index.ts` (new, Task 1) | MV3 service worker. Forwards `FLAKE8_*` messages that originate from a content script (`sender.tab` set) to the offscreen document, creating it on demand via `chrome.offscreen`. |
| `packages/extension/src/offscreen/offscreen.html` + `index.ts` (new, Tasks 1–2) | Extension page (real DOM, `'self'`+`'wasm-unsafe-eval'` CSP) hosting a single `PyodideRuntime` instance; answers `FLAKE8_LINT_NOTEBOOK`/`FLAKE8_STATUS`. |
| `packages/extension/src/offscreen/pyodideRuntime.ts` (new, Task 2) | `PyodideRuntime` class: loads Pyodide + the Python shim once (deduped promise, matches the existing `Flake8Engine.load()` pattern), exposes `lintNotebook(cells)`. |
| `packages/core/src/pyodide/wheels/*.whl` (new, Task 3) | Bundled flake8/pyflakes/pycodestyle/mccabe wheels, swept into `dist/pyodide/wheels` by the existing `copy-pyodide` script (`copyfiles -u 2 "src/pyodide/**/*" dist/pyodide` — already recursive, confirmed in `packages/core/package.json`) and from there into the extension bundle by the existing webpack `CopyPlugin` pattern that copies `../core/dist/pyodide` → `pyodide`. |
| `packages/core/src/engines/flake8Shim.ts` (new, Task 4) | Exports `PYTHON_SHIM: string` — the Python source, moved verbatim out of `Flake8Engine.ts`. |
| `packages/core/src/engines/flake8Mapping.ts` (new, Task 4) | Exports `mapFlake8Results(raw, cellOffset): LintError[]` — the per-error line-offset + `rule: 'flake8'` tagging logic, moved out of `Flake8Engine.lintCell`. |
| `packages/core/src/engines/Flake8Engine.ts` | **Deleted** in Task 4 — its browser glue now lives in `offscreen/pyodideRuntime.ts`, its pure logic in `flake8Shim.ts`/`flake8Mapping.ts`. |
| `packages/extension/src/flake8/Flake8Client.ts` (new, Task 5) | Thin `chrome.runtime.sendMessage` wrapper: `lintNotebook(cells)`, `getStatus()`. Replaces `ContentApp`'s direct `Flake8Engine` instance and its busy-wait poll. |
| `packages/extension/src/content/ContentApp.tsx` | Task 5: drops the `Flake8Engine` import/ref/`initializeFlake8`, uses `Flake8Client`; `flake8Status` state gains `'failed'`; DOM elements are stripped before sending cells and re-attached to returned errors by `cellIndex`. |
| `packages/ui-components/src/types/index.ts` + `Overlay.tsx` | Task 5: `OverlayProps.flake8Status` widens to include `'failed'`; `Overlay.tsx` renders a failed-state message alongside the existing loading message. |

---

### Task 1: Shared protocol module + background service worker + offscreen scaffolding

**Files:**
- Create: `packages/extension/src/flake8/protocol.ts`
- Create: `packages/extension/src/background/index.ts`
- Create: `packages/extension/src/offscreen/offscreen.html`
- Create: `packages/extension/src/offscreen/index.ts`
- Modify: `packages/extension/webpack.config.js` (currently `entry: { content, popup, pageExtractor }` at lines 8–12; one `HtmlWebpackPlugin` instance at lines 73–77 for `popup.html`)
- Modify: `packages/extension/public/manifest.json` (currently 63 lines; `permissions` at line 6, no `background`/`content_security_policy` keys)

**Interfaces:**
- Produces (consumed by every later task in this plan): the `protocol.ts` shapes from Global Constraints, plus `ensureOffscreen(): Promise<void>` (background-internal, not exported — nothing outside `background/index.ts` needs it).
- The offscreen stub in this task replies `{ ok: false, error: 'not implemented' }` to any `FLAKE8_LINT_NOTEBOOK`/`FLAKE8_STATUS` message; Task 2 replaces its body.

- [ ] **Step 1: Create the shared protocol module**

Create `packages/extension/src/flake8/protocol.ts`:

```ts
/**
 * Message protocol shared between the content script (isolated world),
 * the background service worker, and the offscreen document running
 * Pyodide. All three contexts import from this single module.
 */

import type { LintError } from '@kaggle-lint/core';

export const FLAKE8_LINT_NOTEBOOK = 'FLAKE8_LINT_NOTEBOOK' as const;
export const FLAKE8_STATUS = 'FLAKE8_STATUS' as const;

export interface Flake8CellInput {
  code: string;
  cellIndex: number;
}

export interface Flake8LintRequest {
  type: typeof FLAKE8_LINT_NOTEBOOK;
  cells: Flake8CellInput[];
}

export type Flake8ResultError = LintError & { cellIndex: number; cellLine: number };

export type Flake8LintResponse =
  | { ok: true; errors: Flake8ResultError[] }
  | { ok: false; error: string };

export interface Flake8StatusRequest {
  type: typeof FLAKE8_STATUS;
}

export type Flake8Status = 'unloaded' | 'loading' | 'ready' | 'failed';

export interface Flake8StatusResponse {
  status: Flake8Status;
}
```

- [ ] **Step 2: Implement the background service worker**

Create `packages/extension/src/background/index.ts`:

```ts
/**
 * Background service worker. Pyodide/WASM cannot run in the content
 * script (isolated-world content scripts inherit the page's CSP, which
 * Kaggle does not grant 'wasm-unsafe-eval' for — F1). This worker's only
 * job is bridging chrome.runtime messages from the content script to the
 * offscreen document, which is an extension page and gets this
 * extension's own CSP instead (see manifest.json's content_security_policy).
 */

import { FLAKE8_LINT_NOTEBOOK, FLAKE8_STATUS } from '../flake8/protocol';

const FLAKE8_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
]);

const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run Pyodide/Flake8 linter in WASM',
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type !== 'string' || !FLAKE8_MESSAGE_TYPES.has(message.type)) {
    return false;
  }

  // Only forward messages that came from a content script running in a
  // tab. chrome.runtime.sendMessage() below has no single-recipient form
  // for extension-page targets, so it broadcasts — this same listener
  // will see its own forwarded message again (and so will the offscreen
  // document's listener). The re-broadcast has no sender.tab (it
  // originates from this service worker, an extension page, not a tab),
  // so this guard prevents an infinite forward loop while still letting
  // the offscreen document's listener (which checks message.type, not
  // sender) answer it.
  if (!sender.tab) {
    return false;
  }

  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage(message))
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
```

- [ ] **Step 3: Add the offscreen stub**

Create `packages/extension/src/offscreen/offscreen.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>kaggle-lint offscreen</title>
</head>
<body>
</body>
</html>
```

Create `packages/extension/src/offscreen/index.ts`:

```ts
/**
 * Offscreen document entry point. Runs Pyodide (WASM allowed here — this
 * is an extension page, not a content script). Task 2 replaces the stub
 * response below with a real PyodideRuntime-backed handler.
 */

import { FLAKE8_LINT_NOTEBOOK, FLAKE8_STATUS } from '../flake8/protocol';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== FLAKE8_LINT_NOTEBOOK && message?.type !== FLAKE8_STATUS) {
    return false;
  }
  sendResponse({ ok: false, error: 'not implemented' });
  return false;
});
```

- [ ] **Step 4: Wire webpack**

In `packages/extension/webpack.config.js`, change the `entry` block (currently lines 8–12):

```js
  entry: {
    content: './src/content/index.tsx',
    popup: './src/popup/index.tsx',
    pageExtractor: './src/page/pageExtractor.ts',
    background: './src/background/index.ts',
    offscreen: './src/offscreen/index.ts',
  },
```

Add a second `HtmlWebpackPlugin` instance after the existing one (currently lines 73–77, for `popup.html`):

```js
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/offscreen/offscreen.html',
      filename: 'offscreen.html',
      chunks: ['offscreen'],
    }),
```

- [ ] **Step 5: Update the manifest**

In `packages/extension/public/manifest.json`, change `"permissions"` (currently line 6):

```json
  "permissions": ["activeTab", "storage", "scripting", "offscreen"],
```

Add `"background"` and `"content_security_policy"` as new top-level keys (e.g. right after `"permissions"`):

```json
  "background": {
    "service_worker": "background.js"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  },
```

Leave both existing `content_scripts` entries and `web_accessible_resources` untouched.

- [ ] **Step 6: Verify**

```bash
npm run build
ls packages/extension/dist/background.js packages/extension/dist/offscreen.html packages/extension/dist/offscreen.js
node -e "JSON.parse(require('fs').readFileSync('packages/extension/dist/manifest.json','utf8')); console.log('manifest.json is valid JSON')"
npm run type-check
```

Expected: all files listed exist; the `node -e` line prints `manifest.json is valid JSON`; `type-check` passes. (A full "load unpacked, confirm zero console errors" browser check is folded into Task 6's manual gate rather than repeated here — this step only confirms the build artifacts and manifest shape are correct.)

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/flake8/protocol.ts packages/extension/src/background packages/extension/src/offscreen packages/extension/webpack.config.js packages/extension/public/manifest.json
git commit -m "feat(extension): background worker + offscreen document scaffolding for flake8"
```

---

### Task 2: Move Pyodide bootstrapping into the offscreen document

**Files:**
- Create: `packages/extension/src/offscreen/pyodideRuntime.ts`
- Modify: `packages/extension/src/offscreen/index.ts`

**Interfaces:**
- Consumes: `Flake8CellInput`, `Flake8ResultError`, `Flake8Status` from `../flake8/protocol` (Task 1); `FLAKE8_LINT_NOTEBOOK`, `FLAKE8_STATUS` message constants.
- Produces: `class PyodideRuntime { status: Flake8Status; load(): Promise<void>; lintNotebook(cells: Flake8CellInput[]): Promise<Flake8ResultError[]>; }` — single instance created in `offscreen/index.ts`. `load()` dedupes concurrent calls via a stored promise (the same pattern `Flake8Engine.load()` at `Flake8Engine.ts:51-58` already uses — confirmed: `if (this.isLoading && this.loadPromise) return this.loadPromise;`); `lintNotebook()` always awaits `load()` itself, so callers never poll (fixes F13's busy-wait, which lived at `Flake8Engine.ts` call sites — the pre-M1/M2 review-findings.md cites `ContentApp.tsx:96-102` for the busy-wait itself, which after M1/M2 is now at `ContentApp.tsx:67-71`'s `initializeFlake8`; Task 5 deletes that function entirely).

**Note on `PYTHON_SHIM`:** this task copies the Python source verbatim (byte-for-byte) out of `Flake8Engine.ts:107-291` — the content between the opening and closing backticks of the template literal at `Flake8Engine.ts:102` and `Flake8Engine.ts:292`, i.e. everything from `import sys` through the closing `return results` of `lint_cell_with_notebook_context`. Task 4 later cuts this same string out of this file and moves it to `packages/core/src/engines/flake8Shim.ts` (a `PYTHON_SHIM` export other packages can import) — do not retype it there, move it.

- [ ] **Step 1: Implement `PyodideRuntime`**

Create `packages/extension/src/offscreen/pyodideRuntime.ts`:

```ts
/**
 * Loads Pyodide + the flake8/pyflakes Python shim inside the offscreen
 * document (an extension page — WASM and 'wasm-unsafe-eval' are allowed
 * here, unlike in the content script's isolated world; see F1 in
 * docs/review-findings.md). Single instance, created once in
 * offscreen/index.ts.
 *
 * PYTHON_SHIM below is a temporary local copy of Flake8Engine.ts:107-291,
 * moved verbatim. Task 4 of the M3 plan cuts it out of this file and into
 * packages/core/src/engines/flake8Shim.ts so core owns the one copy.
 */

import type { Flake8CellInput, Flake8ResultError, Flake8Status } from '../flake8/protocol';

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

interface PyodideInterface {
  loadPackage(name: string): Promise<void>;
  runPythonAsync(code: string): Promise<string>;
}

interface RawFlake8Error {
  line: number;
  column: number;
  code: string;
  msg: string;
  severity: 'error' | 'warning' | 'info';
}

const PYODIDE_INDEX_URL = chrome.runtime.getURL('pyodide/');

const PYTHON_SHIM = `
import sys
import ast
from io import StringIO

def extract_imports_and_names(code):
    """
    Extract all imported names and defined names from code.
    Returns: (imports_set, defined_names_set)
    """
    imports = set()
    defined = set()

    try:
        tree = ast.parse(code)

        for node in ast.walk(tree):
            # Track imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname if alias.asname else alias.name
                    imports.add(name.split('.')[0])

            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    if alias.name == '*':
                        # Can't track * imports precisely
                        continue
                    name = alias.asname if alias.asname else alias.name
                    imports.add(name)

            # Track assignments
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined.add(target.id)
                    elif isinstance(target, ast.Tuple) or isinstance(target, ast.List):
                        for elt in target.elts:
                            if isinstance(elt, ast.Name):
                                defined.add(elt.id)

            elif isinstance(node, ast.AnnAssign):
                if isinstance(node.target, ast.Name):
                    defined.add(node.target.id)

            # Track function definitions
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                defined.add(node.name)

            # Track class definitions
            elif isinstance(node, ast.ClassDef):
                defined.add(node.name)

    except SyntaxError:
        pass

    return imports, defined

def lint_code_with_context(code, known_names=None):
    """
    Lint Python code with awareness of previously defined names.
    known_names: set of variable/function/class names defined in previous cells
    """
    import ast
    results = []

    if known_names is None:
        known_names = set()

    # Check for syntax errors first
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        results.append({
            'line': e.lineno or 1,
            'column': e.offset or 0,
            'code': 'E999',
            'msg': f"SyntaxError: {e.msg}",
            'severity': 'error'
        })
        return results, set()

    # Extract what this cell defines
    imports, defined = extract_imports_and_names(code)
    new_names = imports | defined

    # Use pyflakes for undefined name checking
    try:
        from pyflakes import api as pyflakes_api
        from pyflakes import checker

        class ContextAwareChecker(checker.Checker):
            """Custom checker that knows about notebook context."""

            def __init__(self, tree, filename='<input>', known_context=None):
                super().__init__(tree, filename)
                self.known_context = known_context or set()

            def report(self, messageClass, *args, **kwargs):
                # Filter out undefined name errors for known context
                if messageClass.__name__ == 'UndefinedName':
                    if args and args[1] in self.known_context:
                        return  # Skip this error
                super().report(messageClass, *args, **kwargs)

        class CollectingReporter:
            def __init__(self):
                self.messages = []

            def unexpectedError(self, filename, msg):
                pass

            def syntaxError(self, filename, msg, lineno, offset, text):
                self.messages.append({
                    'line': lineno or 1,
                    'column': offset or 0,
                    'code': 'E999',
                    'msg': msg,
                    'severity': 'error'
                })

            def flake(self, message):
                code = message.__class__.__name__

                # Skip undefined name errors for known context
                if code == 'UndefinedName':
                    # Extract the undefined name
                    msg_str = str(message)
                    if "'" in msg_str:
                        name = msg_str.split("'")[1]
                        if name in known_names:
                            return  # Skip - it's defined in a previous cell

                severity = 'warning'
                if 'Undefined' in code or 'Import' in code:
                    severity = 'error'

                msg_text = str(message).split(':', 1)[-1].strip()

                self.messages.append({
                    'line': message.lineno,
                    'column': getattr(message, 'col', 0),
                    'code': code,
                    'msg': msg_text,
                    'severity': severity
                })

        reporter = CollectingReporter()

        # Create a context-aware checker
        w = ContextAwareChecker(tree, '<input>', known_names)

        # Collect messages
        for message in w.messages:
            reporter.flake(message)

        results.extend(reporter.messages)

    except ImportError:
        pass
    except Exception as e:
        print(f"Linting error: {e}")

    return results, new_names

# Store for global context
_notebook_context = set()

def reset_notebook_context():
    """Reset the global notebook context."""
    global _notebook_context
    _notebook_context = set()

def get_notebook_context():
    """Get current notebook context."""
    return _notebook_context.copy()

def update_notebook_context(new_names):
    """Update notebook context with new names."""
    global _notebook_context
    _notebook_context.update(new_names)

def lint_cell_with_notebook_context(code):
    """
    Lint a single cell with full notebook context.
    Automatically updates context with names defined in this cell.
    """
    results, new_names = lint_code_with_context(code, _notebook_context)
    update_notebook_context(new_names)
    return results
`;

export class PyodideRuntime {
  status: Flake8Status = 'unloaded';
  private pyodide: PyodideInterface | null = null;
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.status === 'ready') {
      return Promise.resolve();
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.status = 'loading';
    this.loadPromise = (async () => {
      try {
        if (!window.loadPyodide) {
          await this.loadPyodideScript();
        }
        this.pyodide = await window.loadPyodide!({ indexURL: PYODIDE_INDEX_URL });
        await this.pyodide.loadPackage('micropip');
        await this.pyodide.runPythonAsync(PYTHON_SHIM);
        this.status = 'ready';
      } catch (error) {
        this.status = 'failed';
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  private loadPyodideScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.loadPyodide) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = PYODIDE_INDEX_URL + 'pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide script'));
      document.head.appendChild(script);
    });
  }

  async lintNotebook(cells: Flake8CellInput[]): Promise<Flake8ResultError[]> {
    await this.load();
    await this.pyodide!.runPythonAsync('reset_notebook_context()');

    const allErrors: Flake8ResultError[] = [];
    let lineOffset = 0;

    for (const cell of cells) {
      const code = cell.code;
      const trimmed = code.trim();
      const shouldLint = trimmed.length > 0 && !trimmed.startsWith('%%') && !trimmed.startsWith('!');

      if (shouldLint) {
        const raw = await this.pyodide!.runPythonAsync(`
import json
results = lint_cell_with_notebook_context(${JSON.stringify(code)})
json.dumps(results)
        `);
        const rawResults = JSON.parse(raw) as RawFlake8Error[];

        rawResults.forEach((error) => {
          allErrors.push({
            ...error,
            line: error.line + lineOffset,
            rule: 'flake8',
            cellIndex: cell.cellIndex,
            cellLine: error.line,
          });
        });
      }

      lineOffset += code.split('\n').length;
    }

    return allErrors;
  }
}
```

- [ ] **Step 2: Wire the runtime into the offscreen message handler**

**Plan update (post-Task-1, documented per `docs/next_plans/README.md` rule 5):** Task 1's own review found that a raw broadcast forward causes the offscreen document to receive every client message twice (once directly from the content script's broadcast, once via background's re-forward — `chrome.runtime.sendMessage` reaches every listener, not just the intended recipient). The fix, already implemented in `background/index.ts` and the offscreen stub, wraps forwarded messages in a `FLAKE8_OFFSCREEN_REQUEST` envelope (`{ type: 'FLAKE8_OFFSCREEN_REQUEST', payload: <original message> }`) that only the offscreen document acts on; the client-facing `FLAKE8_LINT_NOTEBOOK`/`FLAKE8_STATUS` types are unchanged. `protocol.ts` already has `FLAKE8_OFFSCREEN_REQUEST` and `Flake8OffscreenRequest` (confirm they're there — Task 1 added them). The code below replaces the **current** offscreen stub (which already unwraps the envelope but replies `{ ok: false, error: 'not implemented' }`) — match its existing envelope-unwrapping shape, just swap the stub reply for real `PyodideRuntime` calls:

Replace the contents of `packages/extension/src/offscreen/index.ts`:

```ts
/**
 * Offscreen document entry point. Hosts the single PyodideRuntime
 * instance. Only acts on FLAKE8_OFFSCREEN_REQUEST envelopes forwarded by
 * the background service worker (see protocol.ts) — the raw client-facing
 * FLAKE8_LINT_NOTEBOOK/FLAKE8_STATUS broadcast also reaches this listener
 * directly (chrome.runtime.sendMessage has no single-recipient targeting),
 * but the type check below makes that a no-op, so each logical request is
 * only ever answered once.
 */

import {
  FLAKE8_OFFSCREEN_REQUEST,
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
  type Flake8LintRequest,
  type Flake8LintResponse,
  type Flake8StatusResponse,
} from '../flake8/protocol';
import { PyodideRuntime } from './pyodideRuntime';

const runtime = new PyodideRuntime();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== FLAKE8_OFFSCREEN_REQUEST) {
    return false;
  }
  const payload = message.payload;

  if (payload?.type === FLAKE8_STATUS) {
    const response: Flake8StatusResponse = { status: runtime.status };
    sendResponse(response);
    return false;
  }

  if (payload?.type === FLAKE8_LINT_NOTEBOOK) {
    const request = payload as Flake8LintRequest;
    runtime
      .lintNotebook(request.cells)
      .then((errors) => {
        const response: Flake8LintResponse = { ok: true, errors };
        sendResponse(response);
      })
      .catch((error) => {
        const response: Flake8LintResponse = { ok: false, error: String(error) };
        sendResponse(response);
      });
    return true;
  }

  return false;
});
```

- [ ] **Step 3: Verify**

```bash
npm run build && npm run type-check
```

Expected: both pass. Functional verification (does linting actually work end-to-end) is deferred to Task 6 — Task 3 hasn't bundled the flake8 wheels yet, so pyflakes isn't installed in the Pyodide environment: the Python shim's `from pyflakes import api as pyflakes_api` import inside `lint_code_with_context` will fail at runtime and fall into the `except ImportError: pass` branch, producing zero lint errors rather than crashing. That's expected until Task 3 lands — not a bug to chase now.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/offscreen/pyodideRuntime.ts packages/extension/src/offscreen/index.ts
git commit -m "feat(extension): pyodide runtime in offscreen document"
```

---

### Task 3: Bundle flake8 wheels; no runtime network (F9)

**Files:**
- Create: `packages/core/src/pyodide/wheels/` (four `.whl` files, fetched by Step 1, not authored)
- Create: `scripts/fetch-wheels.md`
- Modify: `packages/extension/src/offscreen/pyodideRuntime.ts` (`load()` method)

**Interfaces:**
- No new exported symbols. `PyodideRuntime.load()` gains a wheel-install step between `loadPackage('micropip')` and running `PYTHON_SHIM` (the shim's `from pyflakes import api as pyflakes_api` needs pyflakes already installed).

- [ ] **Step 1: Download the wheels**

Confirmed via `Glob` that `packages/core/src/pyodide/` currently has no `wheels/` subdirectory and no flake8/pyflakes/pycodestyle/mccabe wheels — only `micropip-0.5.0-py3-none-any.whl` and `packaging-23.1-py3-none-any.whl` (micropip's own dependency, pre-existing, untouched by this task).

Run from repo root (requires a Python 3 with `pip`, used only as a download tool — the wheels themselves run inside Pyodide, not this host Python):

```bash
mkdir -p packages/core/src/pyodide/wheels
pip download flake8==6.1.0 pyflakes==3.1.0 pycodestyle==2.11.1 mccabe==0.7.0 \
  --no-deps \
  --only-binary=:all: \
  --python-version 311 \
  --implementation py3 \
  --abi none \
  --platform any \
  -d packages/core/src/pyodide/wheels/
ls packages/core/src/pyodide/wheels/
```

Expected: exactly 4 `.whl` files, one per package, filenames like `flake8-6.1.0-py2.py3-none-any.whl`, `pyflakes-3.1.0-py2.py3-none-any.whl`, `pycodestyle-2.11.1-py2.py3-none-any.whl`, `mccabe-0.7.0-py2.py3-none-any.whl` (pure-python wheels are commonly tagged `py2.py3-none-any` rather than `py3-none-any` — use whatever `ls` actually shows; the exact tag doesn't matter to Pyodide/micropip, only that all four are `none-any` pure-python wheels with no compiled extensions).

Record the exact filenames and hashes in `scripts/fetch-wheels.md`:

```bash
cd packages/core/src/pyodide/wheels
sha256sum *.whl > /tmp/wheel-hashes.txt
cd -
cat /tmp/wheel-hashes.txt
```

Create `scripts/fetch-wheels.md` (replace the `<...>` placeholders with the real filenames/hashes from the commands above — this doc's job is making the pin reproducible, not being generic):

```markdown
# Fetching flake8 wheels for the Pyodide offscreen runtime

Pinned versions (flake8 6.1.0's own dependency pins: pyflakes>=3.1.0,<3.2.0;
pycodestyle>=2.11.0,<2.12.0; mccabe>=0.7.0,<0.8.0):

- flake8 6.1.0
- pyflakes 3.1.0
- pycodestyle 2.11.1
- mccabe 0.7.0

Re-fetch with:

\`\`\`bash
pip download flake8==6.1.0 pyflakes==3.1.0 pycodestyle==2.11.1 mccabe==0.7.0 \
  --no-deps --only-binary=:all: --python-version 311 --implementation py3 \
  --abi none --platform any -d packages/core/src/pyodide/wheels/
\`\`\`

Downloaded wheel filenames and sha256 (fill in from `sha256sum packages/core/src/pyodide/wheels/*.whl`
after running the command above):

- `<flake8 filename>` — `<sha256>`
- `<pyflakes filename>` — `<sha256>`
- `<pycodestyle filename>` — `<sha256>`
- `<mccabe filename>` — `<sha256>`
```

- [ ] **Step 2: Install from bundled URLs instead of PyPI**

In `packages/extension/src/offscreen/pyodideRuntime.ts`, add a `WHEEL_FILENAMES` constant near the top (fill in the exact filenames `ls packages/core/src/pyodide/wheels/` reported in Step 1 — dependencies first so the array order matches how you'd install them by hand, though `deps=False` below means micropip won't try to resolve order itself):

```ts
const WHEEL_FILENAMES = [
  'mccabe-0.7.0-py2.py3-none-any.whl',
  'pycodestyle-2.11.1-py2.py3-none-any.whl',
  'pyflakes-3.1.0-py2.py3-none-any.whl',
  'flake8-6.1.0-py2.py3-none-any.whl',
];
```

In `load()`, insert a wheel-install step between `await this.pyodide.loadPackage('micropip')` and `await this.pyodide.runPythonAsync(PYTHON_SHIM)`:

```ts
        this.pyodide = await window.loadPyodide!({ indexURL: PYODIDE_INDEX_URL });
        await this.pyodide.loadPackage('micropip');

        const wheelUrls = WHEEL_FILENAMES.map((name) =>
          chrome.runtime.getURL(`pyodide/wheels/${name}`)
        );
        await this.pyodide.runPythonAsync(
          `import micropip\nawait micropip.install(${JSON.stringify(wheelUrls)}, deps=False)`
        );

        await this.pyodide.runPythonAsync(PYTHON_SHIM);
```

- [ ] **Step 3: Verify**

```bash
npm run build
ls packages/extension/dist/pyodide/wheels/
grep -rn "micropip.install('flake8')" packages/
```

Expected: `dist/pyodide/wheels/` lists the same 4 files as `packages/core/src/pyodide/wheels/`; the `grep` for the old PyPI-fetching call returns no matches anywhere in the repo (the only remaining `Flake8Engine.ts` still has it until Task 4 deletes that file — if Task 3 runs before Task 4 in your execution order, expect exactly one match there and confirm it disappears after Task 4).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/pyodide/wheels packages/extension/src/offscreen/pyodideRuntime.ts scripts/fetch-wheels.md
git commit -m "feat: bundle flake8 wheels; offline flake8 install"
```

---

### Task 4: Shrink core's Flake8Engine to pure logic

**Files:**
- Create: `packages/core/src/engines/flake8Shim.ts`
- Create: `packages/core/src/engines/flake8Mapping.ts`
- Test: `packages/core/src/__tests__/flake8Mapping.test.ts`
- Modify: `packages/core/src/engines/index.ts` (currently `export * from './LintEngine'; export * from './Flake8Engine';`)
- Modify: `packages/extension/src/offscreen/pyodideRuntime.ts` (import `PYTHON_SHIM` from core instead of the local copy; use `mapFlake8Results` instead of the inline mapping added in Task 2)
- Delete: `packages/core/src/engines/Flake8Engine.ts`

**Interfaces:**
- Produces: `PYTHON_SHIM: string` (from `flake8Shim.ts`) and `mapFlake8Results(raw: RawFlake8Error[], cellOffset: number): LintError[]` + `RawFlake8Error` (from `flake8Mapping.ts`), both re-exported from `@kaggle-lint/core` via `engines/index.ts` → `core/src/index.ts`'s existing `export * from './engines'`.
- **Breaking export change:** `Flake8Engine` disappears from `@kaggle-lint/core`. Its only consumer is `packages/extension/src/content/ContentApp.tsx:12` (`import { LintEngine, Flake8Engine, createEnabledRules, defaultRuleToggles } from '@kaggle-lint/core';`) — this task does **not** touch that import (Task 5 does). Root `npm run type-check`/`npm run build` will fail after this task until Task 5 lands; per Deviation 4 (top of this document), that's expected and this task's own Verify step is scoped to `packages/core` only. Do Tasks 4 and 5 back-to-back with no `/clear` between them.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/__tests__/flake8Mapping.test.ts`:

```ts
import { mapFlake8Results } from '../engines/flake8Mapping';

describe('mapFlake8Results', () => {
  it('adjusts line numbers by the cell offset and tags the flake8 rule', () => {
    const raw = [
      { line: 2, column: 0, code: 'F821', msg: "undefined name 'y'", severity: 'error' as const },
    ];

    const result = mapFlake8Results(raw, 10);

    expect(result).toEqual([
      { line: 12, column: 0, code: 'F821', msg: "undefined name 'y'", severity: 'error', rule: 'flake8' },
    ]);
  });

  it('applies the same offset to every error in a multi-error cell', () => {
    const raw = [
      { line: 1, column: 0, code: 'E999', msg: 'SyntaxError: invalid syntax', severity: 'error' as const },
      { line: 3, column: 4, code: 'F401', msg: "'os' imported but unused", severity: 'warning' as const },
    ];

    const result = mapFlake8Results(raw, 5);

    expect(result.map((e) => e.line)).toEqual([6, 8]);
    expect(result.every((e) => e.rule === 'flake8')).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(mapFlake8Results([], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cd packages/core && npx jest flake8Mapping -v
```

Expected: FAIL — `Cannot find module '../engines/flake8Mapping'`.

- [ ] **Step 3: Move the Python shim out of `Flake8Engine.ts`**

Create `packages/core/src/engines/flake8Shim.ts`. Its content is `Flake8Engine.ts:107-291` (the Python source between the two backticks), moved verbatim — this is byte-for-byte the same string Task 2 Step 1 already pasted into `pyodideRuntime.ts`, just given a proper module home in core. Wrap it as:

```ts
/**
 * Python shim run once inside the Pyodide runtime: wraps pyflakes with
 * notebook-wide "known names from earlier cells" context tracking, so
 * `x = y` doesn't flag `y` as undefined if an earlier cell already
 * defined it. Moved verbatim from the old Flake8Engine.ts (pre-M3, when
 * the engine ran directly in the content script).
 */

export const PYTHON_SHIM = `
import sys
import ast
from io import StringIO

def extract_imports_and_names(code):
    """
    Extract all imported names and defined names from code.
    Returns: (imports_set, defined_names_set)
    """
    imports = set()
    defined = set()

    try:
        tree = ast.parse(code)

        for node in ast.walk(tree):
            # Track imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname if alias.asname else alias.name
                    imports.add(name.split('.')[0])

            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    if alias.name == '*':
                        # Can't track * imports precisely
                        continue
                    name = alias.asname if alias.asname else alias.name
                    imports.add(name)

            # Track assignments
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined.add(target.id)
                    elif isinstance(target, ast.Tuple) or isinstance(target, ast.List):
                        for elt in target.elts:
                            if isinstance(elt, ast.Name):
                                defined.add(elt.id)

            elif isinstance(node, ast.AnnAssign):
                if isinstance(node.target, ast.Name):
                    defined.add(node.target.id)

            # Track function definitions
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                defined.add(node.name)

            # Track class definitions
            elif isinstance(node, ast.ClassDef):
                defined.add(node.name)

    except SyntaxError:
        pass

    return imports, defined

def lint_code_with_context(code, known_names=None):
    """
    Lint Python code with awareness of previously defined names.
    known_names: set of variable/function/class names defined in previous cells
    """
    import ast
    results = []

    if known_names is None:
        known_names = set()

    # Check for syntax errors first
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        results.append({
            'line': e.lineno or 1,
            'column': e.offset or 0,
            'code': 'E999',
            'msg': f"SyntaxError: {e.msg}",
            'severity': 'error'
        })
        return results, set()

    # Extract what this cell defines
    imports, defined = extract_imports_and_names(code)
    new_names = imports | defined

    # Use pyflakes for undefined name checking
    try:
        from pyflakes import api as pyflakes_api
        from pyflakes import checker

        class ContextAwareChecker(checker.Checker):
            """Custom checker that knows about notebook context."""

            def __init__(self, tree, filename='<input>', known_context=None):
                super().__init__(tree, filename)
                self.known_context = known_context or set()

            def report(self, messageClass, *args, **kwargs):
                # Filter out undefined name errors for known context
                if messageClass.__name__ == 'UndefinedName':
                    if args and args[1] in self.known_context:
                        return  # Skip this error
                super().report(messageClass, *args, **kwargs)

        class CollectingReporter:
            def __init__(self):
                self.messages = []

            def unexpectedError(self, filename, msg):
                pass

            def syntaxError(self, filename, msg, lineno, offset, text):
                self.messages.append({
                    'line': lineno or 1,
                    'column': offset or 0,
                    'code': 'E999',
                    'msg': msg,
                    'severity': 'error'
                })

            def flake(self, message):
                code = message.__class__.__name__

                # Skip undefined name errors for known context
                if code == 'UndefinedName':
                    # Extract the undefined name
                    msg_str = str(message)
                    if "'" in msg_str:
                        name = msg_str.split("'")[1]
                        if name in known_names:
                            return  # Skip - it's defined in a previous cell

                severity = 'warning'
                if 'Undefined' in code or 'Import' in code:
                    severity = 'error'

                msg_text = str(message).split(':', 1)[-1].strip()

                self.messages.append({
                    'line': message.lineno,
                    'column': getattr(message, 'col', 0),
                    'code': code,
                    'msg': msg_text,
                    'severity': severity
                })

        reporter = CollectingReporter()

        # Create a context-aware checker
        w = ContextAwareChecker(tree, '<input>', known_names)

        # Collect messages
        for message in w.messages:
            reporter.flake(message)

        results.extend(reporter.messages)

    except ImportError:
        pass
    except Exception as e:
        print(f"Linting error: {e}")

    return results, new_names

# Store for global context
_notebook_context = set()

def reset_notebook_context():
    """Reset the global notebook context."""
    global _notebook_context
    _notebook_context = set()

def get_notebook_context():
    """Get current notebook context."""
    return _notebook_context.copy()

def update_notebook_context(new_names):
    """Update notebook context with new names."""
    global _notebook_context
    _notebook_context.update(new_names)

def lint_cell_with_notebook_context(code):
    """
    Lint a single cell with full notebook context.
    Automatically updates context with names defined in this cell.
    """
    results, new_names = lint_code_with_context(code, _notebook_context)
    update_notebook_context(new_names)
    return results
`;
```

- [ ] **Step 4: Implement `mapFlake8Results` to make the test pass**

Create `packages/core/src/engines/flake8Mapping.ts`:

```ts
/**
 * Maps a cell's raw flake8/pyflakes results (line numbers relative to
 * that cell) into notebook-global LintErrors (line numbers relative to
 * the whole notebook), tagging every error with rule: 'flake8'. Moved
 * out of the old Flake8Engine.lintCell (Flake8Engine.ts:384-390).
 */

import { LintError, Severity } from '../types';

export interface RawFlake8Error {
  line: number;
  column: number;
  code: string;
  msg: string;
  severity: Severity;
}

export function mapFlake8Results(raw: RawFlake8Error[], cellOffset: number): LintError[] {
  return raw.map((error) => ({
    ...error,
    line: error.line + cellOffset,
    rule: 'flake8',
  }));
}
```

- [ ] **Step 5: Run the test again, confirm it passes**

```bash
cd packages/core && npx jest flake8Mapping -v
```

Expected: PASS, all 3 cases.

- [ ] **Step 6: Delete `Flake8Engine.ts` and update exports**

```bash
rm packages/core/src/engines/Flake8Engine.ts
```

Update `packages/core/src/engines/index.ts`:

```ts
/**
 * Engines Index
 * Exports all linting engines
 */

export * from './LintEngine';
export * from './flake8Shim';
export * from './flake8Mapping';
```

(`packages/core/src/index.ts` needs no change — its `export * from './engines'` already re-exports whatever `engines/index.ts` exports.)

- [ ] **Step 7: Update the offscreen runtime to consume core's shim/mapper**

In `packages/extension/src/offscreen/pyodideRuntime.ts`:

Remove the local `PYTHON_SHIM` constant and `RawFlake8Error` interface (both now live in core); add an import:

```ts
import { PYTHON_SHIM, mapFlake8Results, type RawFlake8Error } from '@kaggle-lint/core';
```

Inside `lintNotebook()`'s `if (shouldLint) { ... }` block, replace the last two statements Task 2 wrote — `const rawResults = JSON.parse(raw) as RawFlake8Error[];` and the `rawResults.forEach(...)` block after it — with (this re-declares `rawResults`, so make sure you're replacing both statements, not appending after the old `const rawResults` — otherwise you'll get a duplicate-declaration error):

```ts
        const rawResults = JSON.parse(raw) as RawFlake8Error[];
        const mapped = mapFlake8Results(rawResults, lineOffset);

        mapped.forEach((error, i) => {
          allErrors.push({
            ...error,
            cellIndex: cell.cellIndex,
            cellLine: rawResults[i].line,
          } as Flake8ResultError);
        });
```

- [ ] **Step 8: Verify (core only — see Deviation 4)**

```bash
cd packages/core && npm test && npm run type-check
```

Expected: both pass. Do **not** run root `npm run build`/`npm run type-check` yet — `ContentApp.tsx` still imports the now-deleted `Flake8Engine` and will fail until Task 5. Proceed directly to Task 5 without `/clear`.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/engines packages/extension/src/offscreen/pyodideRuntime.ts
git commit -m "refactor(core): extract python shim + result mapping; drop browser-bound Flake8Engine"
```

---

### Task 5: Content-script client (replaces in-page engine, F13)

**Files:**
- Create: `packages/extension/src/flake8/Flake8Client.ts`
- Modify: `packages/extension/src/content/ContentApp.tsx` (399 lines, current shape confirmed by direct read)
- Modify: `packages/ui-components/src/types/index.ts` (`OverlayProps.flake8Status`, currently line 36)
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (status block, currently lines 276–281)

**Interfaces:**
- Produces: `class Flake8Client { lintNotebook(cells: Flake8CellInput[]): Promise<Flake8ResultError[]>; getStatus(): Promise<Flake8Status>; }` — `lintNotebook` throws on `{ ok: false }`.
- Consumes: background relay (Task 1), offscreen runtime (Task 2–4).

- [ ] **Step 1: Implement `Flake8Client`**

Create `packages/extension/src/flake8/Flake8Client.ts`:

```ts
/**
 * Thin chrome.runtime.sendMessage wrapper the content script uses to talk
 * to the offscreen Pyodide runtime (via the background service worker's
 * relay). Replaces the old in-content-script Flake8Engine instance and
 * its busy-wait poll (F13) — every call here is a single awaited message
 * round-trip, no polling.
 */

import {
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
  type Flake8CellInput,
  type Flake8LintResponse,
  type Flake8ResultError,
  type Flake8Status,
  type Flake8StatusResponse,
} from './protocol';

export class Flake8Client {
  async lintNotebook(cells: Flake8CellInput[]): Promise<Flake8ResultError[]> {
    const response = (await chrome.runtime.sendMessage({
      type: FLAKE8_LINT_NOTEBOOK,
      cells,
    })) as Flake8LintResponse;

    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.errors;
  }

  async getStatus(): Promise<Flake8Status> {
    const response = (await chrome.runtime.sendMessage({
      type: FLAKE8_STATUS,
    })) as Flake8StatusResponse;
    return response.status;
  }
}
```

- [ ] **Step 2: Update `ContentApp.tsx` imports and state**

Replace the import block (currently lines 10–14):

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Overlay } from '@kaggle-lint/ui-components';
import { LintEngine, Flake8Engine, createEnabledRules, defaultRuleToggles } from '@kaggle-lint/core';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
```

with:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Overlay } from '@kaggle-lint/ui-components';
import { LintEngine, createEnabledRules, defaultRuleToggles } from '@kaggle-lint/core';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
import { Flake8Client } from '../flake8/Flake8Client';
```

Replace the `flake8Status` state declaration (currently line 34):

```tsx
  const [flake8Status, setFlake8Status] = useState<'unloaded' | 'loading' | 'ready'>('unloaded');
```

with:

```tsx
  const [flake8Status, setFlake8Status] = useState<'unloaded' | 'loading' | 'ready' | 'failed'>('unloaded');
```

Replace the engine ref declaration (currently line 37):

```tsx
  const flake8EngineRef = React.useRef<Flake8Engine>(new Flake8Engine());
```

with:

```tsx
  const flake8ClientRef = React.useRef(new Flake8Client()).current;
```

- [ ] **Step 3: Delete `initializeFlake8`**

Delete the entire `initializeFlake8` function (currently lines 59–88, the block from `/** * Initialize Flake8 engine if needed */` through its closing `}, [flake8Status]);`) — this is the F13 busy-wait (`while (!flake8EngineRef.current.isReady()) { await new Promise(resolve => setTimeout(resolve, 100)); }` at what were lines 69-71). `Flake8Client.lintNotebook` now handles loading implicitly (the offscreen `PyodideRuntime.lintNotebook` awaits its own `load()`), so there is nothing left for this function to do.

- [ ] **Step 4: Rewrite the flake8 branch of `runLinter`**

The full `runLinter` callback currently spans lines 94–168. Replace lines 139–153 — the existing `let lintErrors;` declaration, the blank line after it, and the `if (settings.linterEngine === 'handmade') { ... } else { ... }` block — with (this reproduces the `let lintErrors;` declaration too; don't leave the old one in place above this block, or you'll get a duplicate-declaration error):

```tsx
      let lintErrors;

      if (settings.linterEngine === 'handmade') {
        // Run handmade linter
        console.log('[Linter] Running handmade engine...');
        const engine = getHandmadeLintEngine();
        lintErrors = engine.lintNotebook(cellsForLinting);
        console.log(`[Linter] Handmade engine found ${lintErrors.length} errors`);
      } else {
        // Run flake8 via the offscreen document. The protocol is
        // JSON-only (no DOM elements cross chrome.runtime messaging), so
        // strip elements before sending and re-attach them to the
        // returned errors by cellIndex — error-click-to-scroll needs them.
        console.log('[Linter] Running flake8 engine...');
        setFlake8Status('loading');
        try {
          const elementByCellIndex = new Map(
            cellsForLinting.map((cell) => [cell.cellIndex, cell.element])
          );
          const rawErrors = await flake8ClientRef.lintNotebook(
            cellsForLinting.map(({ code, cellIndex }) => ({ code, cellIndex }))
          );
          lintErrors = rawErrors.map((error) => ({
            ...error,
            element: elementByCellIndex.get(error.cellIndex) ?? null,
          }));
          setFlake8Status('ready');
          console.log(`[Linter] Flake8 engine found ${lintErrors.length} errors`);
        } catch (error) {
          setFlake8Status('failed');
          throw error;
        }
      }
```

(The surrounding `try`/`catch`/`finally` and the cell-extraction code above this block are unchanged — only the `if/else` body changes. The outer `catch` block's existing `console.warn('[Linter] Flake8 failed, you may need to reload the page')` stays as-is; it now runs after `setFlake8Status('failed')` has already fired.)

Update the `useCallback` dependency array (currently line 168):

```tsx
  }, [domParser, codeMirrorManager, settings, getHandmadeLintEngine, initializeFlake8]);
```

to:

```tsx
  }, [domParser, codeMirrorManager, settings, getHandmadeLintEngine, flake8ClientRef]);
```

- [ ] **Step 5: Widen `OverlayProps.flake8Status`**

In `packages/ui-components/src/types/index.ts`, replace line 36:

```ts
  flake8Status?: 'unloaded' | 'loading' | 'ready';
```

with:

```ts
  flake8Status?: 'unloaded' | 'loading' | 'ready' | 'failed';
```

In `packages/ui-components/src/Overlay/Overlay.tsx`, add a failed-state message after the existing loading block (currently lines 276–281):

```tsx
        {flake8Status === 'loading' && (
          <div className="kaggle-lint-engine-status">
            Loading Flake8 (Pyodide)… first load can take up to 30 s
          </div>
        )}
        {flake8Status === 'failed' && (
          <div className="kaggle-lint-engine-status">
            Flake8 failed to load — check the offscreen document's console
            (chrome://extensions → this extension → inspect the "service
            worker" / "offscreen document" links) or try re-linting.
          </div>
        )}
```

- [ ] **Step 6: Verify**

```bash
npm run type-check && npm run build && npm test
grep -rn "Flake8Engine" packages/extension/src packages/core/src
```

Expected: `type-check`, `build`, and `test` all green (root-level again, per Deviation 4 — this is the first task since Task 4 where root verification is required); the `grep` returns no matches.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/flake8/Flake8Client.ts packages/extension/src/content/ContentApp.tsx packages/ui-components/src/types/index.ts packages/ui-components/src/Overlay/Overlay.tsx
git commit -m "feat(extension): flake8 lints via offscreen document; remove busy-wait"
```

---

### Task 6: Manual verification gate — USER-GATE

This repo has no e2e scripts (per `docs/next_plans/README.md` rule 4 and `docs/next_plans/DEVELOPER_PROMPTS.md` §1); this gate requires a real Chrome browser and a logged-in Kaggle notebook. **If you cannot drive a browser, stop here and hand this checklist to the user — do not claim the milestone done.**

- [ ] **Step 1: Build and load**

```bash
npm run build
```

Load `packages/extension/dist/` as an unpacked extension at `chrome://extensions` (or reload it if already loaded — content-script changes need both an extension reload *and* a page refresh, per `docs/next_plans/DEVELOPER_PROMPTS.md` §6). Open a Kaggle notebook in edit mode (`kaggle.com/code/*/*/edit`). Open the popup and switch the engine radio to **Flake8**.

- [ ] **Step 2: Acceptance checks**

- The overlay shows the loading message ("Loading Flake8 (Pyodide)… first load can take up to 30 s") during first load; within ~30 s, results appear (or the failed-state message appears — if it does, that's a bug to fix before continuing, not something to route around).
- Type `x = y + 1` into a cell with no prior definition of `y`: the overlay flags `F821 undefined name 'y'`. Add `y = 1` in an **earlier** cell and re-lint (Ctrl+Shift+L): the `F821` clears — this confirms the notebook-context shim (`_notebook_context` / `reset_notebook_context()` per-notebook, `update_notebook_context()` per-cell) still works end-to-end after the move to the offscreen document.
- Open `chrome://extensions` → this extension → click the "service worker" inspect link, then separately inspect the offscreen document (Chrome exposes it in the same extension's "Inspect views" list once created) → Network tab: **zero** requests to `pypi.org`, `files.pythonhosted.org`, or `cdn.jsdelivr.net` during the whole load-and-lint cycle (F9 acceptance — confirms wheels installed from bundled `chrome.runtime.getURL` paths only, never the network).
- Switch the popup engine radio back to **Built-in**: linting still works (handmade engine untouched by this milestone).
- Switch back to **Flake8** again: no reload needed, lints immediately (confirms `PyodideRuntime`'s single instance + `status === 'ready'` short-circuit in `load()` — Pyodide isn't reloaded on every engine switch).

- [ ] **Step 3: If anything fails**

Inspect the offscreen document's console (via the same "Inspect views" link from Step 2) for Python tracebacks or `micropip` install errors. Debug with `superpowers:systematic-debugging` — do not guess-fix. Common failure classes to check first, given this plan's design:
  - If the overlay never leaves "loading": check the offscreen console for a `micropip.install` failure (wrong wheel filenames in `WHEEL_FILENAMES` vs. what `ls packages/core/src/pyodide/wheels/` actually produced in Task 3 — a filename mismatch fails silently into the wheel not being found).
  - If `F821` never clears despite an earlier-cell definition: check that `reset_notebook_context()` runs once per `lintNotebook()` call (not per cell) and that `cells` arrives at the offscreen document in notebook order — `Flake8Client.lintNotebook` doesn't sort; it trusts `ContentApp`'s `cellsForLinting` (already sorted by `codeMirrorManager.getAllCells()`, confirmed at `CodeMirrorManager.ts:80` — `cells.sort((a, b) => a.cellIndex - b.cellIndex)`).
  - If network requests to PyPI/CDN appear: grep for any remaining `micropip.install(` call missing the `deps=False` + local-URL pattern (Task 3, Step 2).

- [ ] **Step 4: Commit fixes and record deviations**

Commit any fixes found during this gate. If Kaggle's actual DOM/API shape disagreed with anything this plan assumed (e.g. Chrome's offscreen API behaved differently than documented, or wheel install order mattered despite `deps=False`), record it in `docs/next_plans/milestone-3-working-flake8/notes.md` per `docs/next_plans/README.md` rule 5 — do not silently patch around a wrong assumption without writing it down. Once green, milestone complete; proceed to `superpowers:finishing-a-development-branch` for the merge decision.

