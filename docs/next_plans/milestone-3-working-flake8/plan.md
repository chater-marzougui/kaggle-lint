# Milestone 3: A Flake8 Engine That Actually Works — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Flake8/Pyodide engine functional inside the extension: Pyodide runs in an extension-owned context with WASM allowed, flake8 wheels ship in the bundle (no runtime PyPI), and the content script talks to it over `chrome.runtime` messaging.

**Architecture:** Pyodide cannot run in the content script (isolated world + page CSP blocks `wasm-unsafe-eval` — root cause of F1). It runs instead in an **offscreen document** (`chrome.offscreen`), an extension page whose CSP we control. A minimal background service worker creates the offscreen document on demand. The content script sends `LINT_NOTEBOOK` messages; the offscreen document loads Pyodide + bundled wheels, runs the existing Python shim (kept, moved), and replies with errors. `packages/core`'s `Flake8Engine` shrinks to the pure parts (the Python shim source + result mapping); the browser glue moves to the extension where it belongs.

**Tech Stack:** Chrome MV3 `offscreen` API + background service worker, Pyodide 0.24.1 (already vendored in `packages/core/src/pyodide/`), micropip with local wheel URLs, `chrome.runtime.sendMessage`.

**Fixes findings:** F1, F9, F13. Depends on: Milestone 1 (Milestone 2 recommended first).

## Global Constraints

- Pyodide version stays 0.24.1 (matches vendored assets). Wheels must be pure-python (`py3-none-any`) versions compatible with Pyodide 0.24's Python 3.11: `flake8`, `pyflakes`, `pycodestyle`, `mccabe`. Pin exact versions in a comment where downloaded.
- No runtime network access: micropip must install exclusively from `chrome.runtime.getURL('pyodide/wheels/…')` URLs.
- Manifest additions: `"offscreen"` permission, `"background": { "service_worker": "background.js" }`, and CSP `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }`.
- Message protocol (exact shapes, both sides import from one module):

```ts
// packages/extension/src/flake8/protocol.ts
export interface Flake8LintRequest  { type: 'FLAKE8_LINT_NOTEBOOK'; cells: Array<{ code: string; cellIndex: number }>; }
export interface Flake8LintResponse { ok: true; errors: Array<LintError & { cellIndex: number; cellLine: number }>; }
                                   | { ok: false; error: string };
export interface Flake8StatusRequest { type: 'FLAKE8_STATUS'; }
export type Flake8Status = 'unloaded' | 'loading' | 'ready' | 'failed';
```
- Every task ends with `npm run type-check && npm run build` green.

---

### Task 1: Background service worker + offscreen scaffolding

**Files:**
- Create: `packages/extension/src/background/index.ts` (webpack entry `background`), `packages/extension/src/offscreen/offscreen.html`, `packages/extension/src/offscreen/index.ts` (webpack entry `offscreen`)
- Modify: `packages/extension/webpack.config.js` (two entries + HtmlWebpackPlugin for offscreen.html), `packages/extension/public/manifest.json` (permission, background, CSP per Global Constraints)

**Interfaces:**
- Produces: background relays any message with `type` starting `FLAKE8_` to the offscreen document, creating it first if absent:

```ts
async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS], // long-running WASM compute
      justification: 'Run Pyodide/Flake8 linter in WASM',
    });
  }
}
```

- [ ] **Step 1:** Implement background: `chrome.runtime.onMessage` listener; for `FLAKE8_*` messages call `ensureOffscreen()` then forward with `chrome.runtime.sendMessage` and pipe the reply back (`return true` for async response). Offscreen stub replies `{ ok: false, error: 'not implemented' }`.
- [ ] **Step 2:** Wire webpack + manifest. Offscreen HTML is minimal: `<script src="offscreen.js"></script>`.
- [ ] **Step 3: Verify** — build; `dist/` contains `background.js`, `offscreen.html`, `offscreen.js`; load unpacked → no manifest errors on `chrome://extensions`.
- [ ] **Step 4: Commit** — `feat(extension): background worker + offscreen document scaffolding for flake8`

---

### Task 2: Move Pyodide bootstrapping into the offscreen document

**Files:**
- Create: `packages/extension/src/offscreen/pyodideRuntime.ts`
- Modify: `packages/extension/src/offscreen/index.ts`

**Interfaces:**
- Consumes: `PYTHON_SHIM` from core (Task 4 extracts it; until then import the string from `Flake8Engine.ts` — see Task 4 ordering note).
- Produces: `class PyodideRuntime { load(): Promise<void>; status: Flake8Status; lintNotebook(cells): Promise<Array<LintError & {cellIndex; cellLine}>> }` — single instance in the offscreen document, load deduped via a stored promise (the pattern `Flake8Engine.load()` already uses; **await the promise, no polling** — F13).

- [ ] **Step 1:** In `pyodideRuntime.ts`, load `pyodide.js` with a `<script>` tag pointing at `chrome.runtime.getURL('pyodide/pyodide.js')` — legal here because the offscreen document is an extension page (same world, `'self'` CSP) — then `loadPyodide({ indexURL: chrome.runtime.getURL('pyodide/') })`.
- [ ] **Step 2:** Port the notebook-context lint flow from `Flake8Engine.ts:410-437`: `reset_notebook_context()` once per notebook, `lint_cell_with_notebook_context(code)` per cell, offset bookkeeping (`cellLine = line`, global `line += offset`) identical to current logic. Skip magic/shell cells (`%%`, `!`) as today.
- [ ] **Step 3:** Handle `FLAKE8_LINT_NOTEBOOK` and `FLAKE8_STATUS` in `offscreen/index.ts` using the runtime; errors reply `{ ok: false, error: String(e) }` and set status `failed`.
- [ ] **Step 4: Verify** — build passes. Functional check happens in Task 6 (needs wheels from Task 3 first).
- [ ] **Step 5: Commit** — `feat(extension): pyodide runtime in offscreen document`

---

### Task 3: Bundle flake8 wheels; no runtime network (F9)

**Files:**
- Create: `packages/core/src/pyodide/wheels/` (four `.whl` files), `scripts/fetch-wheels.md` (one-paragraph doc: exact URLs + sha256 of the pinned wheels, so they can be re-fetched reproducibly)
- Modify: `packages/extension/src/offscreen/pyodideRuntime.ts` (install step)

- [ ] **Step 1:** Download pure-python wheels compatible with Python 3.11 from PyPI (pin: latest flake8 6.x line — flake8, pyflakes 3.1.x, pycodestyle 2.11.x, mccabe 0.7.x; `py3-none-any` only) into `packages/core/src/pyodide/wheels/`. Record URLs + hashes in `scripts/fetch-wheels.md`. The existing `copy-pyodide` script (`copyfiles -u 2 "src/pyodide/**/*"`) already sweeps subdirectories — verify `dist/pyodide/wheels/` appears after `cd packages/core && npm run build`.
- [ ] **Step 2:** Replace `micropip.install('flake8')` with local-URL installs, dependencies first:

```ts
const wheels = ['mccabe-…', 'pycodestyle-…', 'pyflakes-…', 'flake8-…'] // exact filenames
  .map((w) => chrome.runtime.getURL(`pyodide/wheels/${w}`));
await pyodide.runPythonAsync(
  `import micropip\nawait micropip.install(${JSON.stringify(wheels)}, deps=False)`
);
```

- [ ] **Step 3: Verify** — `npm run build`; `ls packages/extension/dist/pyodide/wheels/` shows 4 wheels; `grep -rn "micropip.install('flake8')" packages/` → no matches.
- [ ] **Step 4: Commit** — `feat: bundle flake8 wheels; offline flake8 install`

---

### Task 4: Shrink core's Flake8Engine to pure logic

**Files:**
- Create: `packages/core/src/engines/flake8Shim.ts` (exports `PYTHON_SHIM: string` — the Python source currently inlined at `Flake8Engine.ts:102-292`, verbatim), `packages/core/src/engines/flake8Mapping.ts` (exports `mapFlake8Results(raw: RawFlake8Error[], cellOffset: number): LintError[]` — the mapping at `Flake8Engine.ts:384-390`)
- Test: `packages/core/src/__tests__/flake8Mapping.test.ts`
- Modify: `packages/core/src/engines/Flake8Engine.ts` → **delete** (its browser glue now lives in the offscreen runtime); update `engines/index.ts`, `packages/core/src/index.ts`, and `packages/extension/src/offscreen/pyodideRuntime.ts` to import the shim + mapper from core.

**Interfaces:**
- Produces: `PYTHON_SHIM` and `mapFlake8Results` as above. **Breaking export change:** `Flake8Engine` disappears from `@kaggle-lint/core` — Task 5 removes its last consumer (`ContentApp`) in the same milestone; order Tasks 4→5 back-to-back or in one PR.

- [ ] **Step 1: Failing test** for `mapFlake8Results`: given `[{ line: 2, column: 0, code: 'F821', msg: "undefined name 'y'", severity: 'error' }]` and offset 10 → `[{ line: 12, …, rule: 'flake8' }]`. Run `cd packages/core && npx jest flake8Mapping -v` → fail.
- [ ] **Step 2:** Implement both modules by extraction (copy, don't rewrite, the Python string). Delete `Flake8Engine.ts`. Fix exports. Test passes.
- [ ] **Step 3: Verify** — `npm test && npm run type-check` (build of extension will fail until Task 5 if ContentApp still imports Flake8Engine — acceptable mid-PR, note it; or do Step 4 of Task 5 first).
- [ ] **Step 4: Commit** — `refactor(core): extract python shim + result mapping; drop browser-bound Flake8Engine`

---

### Task 5: Content-script client (replaces in-page engine, F13)

**Files:**
- Create: `packages/extension/src/flake8/protocol.ts` (Global Constraints shapes), `packages/extension/src/flake8/Flake8Client.ts`
- Modify: `packages/extension/src/content/ContentApp.tsx`

**Interfaces:**
- Produces: `class Flake8Client { lintNotebook(cells): Promise<NotebookError[]>; getStatus(): Promise<Flake8Status> }` — thin wrappers over `chrome.runtime.sendMessage`; `lintNotebook` throws on `{ ok: false }`.
- Consumes: background relay (Task 1), offscreen runtime (Task 2).

- [ ] **Step 1:** Implement client. In `ContentApp`, replace `flake8EngineRef` + `initializeFlake8` (including the `while(!isReady) sleep(100)` busy-wait) with the client; drive `flake8Status` state from a `FLAKE8_STATUS` poll only *while* a lint is in flight (or have offscreen push status messages — pick simpler: request status once before lint, set `'loading'`, set `'ready'`/error from the lint response).
- [ ] **Step 2:** Strip DOM `element` references before sending cells (protocol is JSON-only); re-attach elements to returned errors by `cellIndex` on receipt.
- [ ] **Step 3: Verify** — `npm run type-check && npm run build && npm test` all green; `grep -rn "Flake8Engine" packages/extension/src packages/core/src` → no matches.
- [ ] **Step 4: Commit** — `feat(extension): flake8 lints via offscreen document; remove busy-wait`

---

### Task 6: Manual verification gate

- [ ] **Step 1:** Build, reload extension, open a Kaggle notebook, switch popup engine to Flake8.
- [ ] **Step 2:** Acceptance:
  - Overlay shows the loading status (Milestone 1 Task 5 UI) during first load; within ~30 s errors appear.
  - `x = y + 1` in cell 1 flags `F821 undefined name 'y'`; defining `y = 1` in an **earlier** cell clears it after re-lint (notebook-context shim works end-to-end).
  - DevTools → Network for the offscreen document: **zero** requests to pypi.org / jsdelivr (F9 acceptance).
  - Switching back to Built-in engine still works.
- [ ] **Step 3:** Inspect offscreen console via `chrome://extensions` → service worker / offscreen targets for Python tracebacks; fix with superpowers:systematic-debugging if any.
- [ ] **Step 4: Commit** fixes; milestone complete.
