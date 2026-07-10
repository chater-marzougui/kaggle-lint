# Milestone 4: Config & Build Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove leftover misconfiguration and duplication in the repo's config/build layer: a correct minimal manifest, an extension build with no `old-linter/` dependency, one source of truth for version, `ui-components`'s duplicated core types deleted, and toolchain (React types, Node floor, package publishing metadata, real per-package lint scripts) brought into alignment.

**Architecture:** Pure cleanup — no behavior changes. Every task below was independently verified against the real current source in this session (not just against `docs/next_plans/milestone-4-config-and-build-hygiene/plan.md`'s text, which was written 2026-07-09 and has since drifted in a few places — each task's "Verified deviations from the milestone plan" block calls those out). Tasks are independent commits; any one can be reverted without touching the others.

**Tech Stack:** Chrome MV3 manifest, webpack 5, npm workspaces, Turborepo, TypeScript 5.9 (strict), ESLint 8, Jest.

**Fixes findings:** F15, F17, F18, F21, F22, F23 (F16, F19, F20 are moot — see Task 5 below; F14/F31 already resolved by the unplanned lint-engine-consolidation project, not this milestone's concern).

## Global Constraints

- No user-visible behavior change in this milestone. After every task: `npm run type-check && npm run build` from repo root must pass (Git Bash — package `clean` scripts use `rm -rf`).
- `chrome.storage.sync` settings shape and `chrome.runtime` message types stay untouched — no task here touches them.
- Bridge protocol (`bridgeProtocol.ts`, `pageExtractor.ts`) is untouched by this milestone.
- Commit per task, conventional-commit style messages (given per task below).
- No manual USER-GATE for this milestone (per `docs/next_plans/README.md` rule 4 — only M6/M7/M8 require one). The final task's automated verification (`npm install && npm run lint && npm run type-check && npm run build && npm test`) is the milestone's closing gate; a human "load unpacked, no manifest warnings" spot-check is a good idea but not a blocking checkpoint, and is folded into P3 (the whole-branch final review) instead of a task here.

---

### Task 1: Manifest cleanup (F17)

**Files:**

- Modify: `packages/extension/public/manifest.json`

**Verified against real source (2026-07-10):** current file read in full (69 lines). `grep -rn "chrome.scripting" packages/extension/src` → zero matches, confirming `scripting` permission is genuinely unused. `grep -n "runtime.getURL" packages/ui-components/src/Overlay/Overlay.tsx` → line 204, `chrome?.runtime?.getURL?.('icons/icon48.png')`, used as an `<img src>` rendered into the Kaggle page's DOM by the isolated-world content script — this is the one real web-accessible-resource consumer the narrowed `web_accessible_resources` must keep covering. All `chrome.runtime.getURL` calls for `pyodide/*` and `ruff/*` (`packages/extension/src/offscreen/pyodideRuntime.ts`, `packages/extension/src/offscreen/ruffRuntime.ts`) run inside the **offscreen document**, an extension page — extension pages read their own `chrome-extension://` resources without needing `web_accessible_resources` at all, so narrowing WAR to `pyodide/*, icons/*` (the milestone plan's literal instruction) is safe; `pyodide/*` is over-inclusive relative to what's strictly required but matches the milestone plan's exact text, so it's kept rather than re-opening that decision.

- [ ] **Step 1: Confirm the failing state (the misconfigurations are present)**

```bash
grep -n "cdn.jsdelivr.net" packages/extension/public/manifest.json
grep -n '"scripting"' packages/extension/public/manifest.json
grep -n '"resources": \["\*"\]' packages/extension/public/manifest.json
```

Expected: all three commands print a matching line (bug confirmed present).

- [ ] **Step 2: Replace `packages/extension/public/manifest.json` with exactly this content**

```json
{
  "manifest_version": 3,
  "name": "Kaggle Python Linter",
  "description": "A linter extension for Python code in Kaggle notebooks",
  "version": "2.0.0",
  "permissions": ["activeTab", "storage", "offscreen"],
  "background": {
    "service_worker": "background.js"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
    "256": "icons/icon256.png",
    "512": "icons/icon512.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
      "256": "icons/icon256.png",
      "512": "icons/icon512.png"
    },
    "default_title": "Kaggle Python Linter Options"
  },
  "host_permissions": [
    "https://www.kaggle.com/*",
    "https://*.kaggleusercontent.com/*",
    "https://kkb-production.jupyter-proxy.kaggle.net/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://www.kaggle.com/code/*/*/edit",
        "https://kkb-production.jupyter-proxy.kaggle.net/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle",
      "all_frames": true
    },
    {
      "matches": [
        "https://www.kaggle.com/code/*/*/edit",
        "https://kkb-production.jupyter-proxy.kaggle.net/*"
      ],
      "js": ["pageExtractor.js"],
      "world": "MAIN",
      "run_at": "document_idle",
      "all_frames": true
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["pyodide/*", "icons/*"],
      "matches": [
        "https://www.kaggle.com/*",
        "https://kkb-production.jupyter-proxy.kaggle.net/*"
      ]
    }
  ]
}
```

Note: `content_scripts[0].matches` and `all_frames: true` are both kept exactly as-is (minus the CDN entry) — do **not** narrow them further here. M7's runtime mount gate (`content/index.tsx`'s `#kaggle-linter-root` guard checking for `.jp-Notebook`) is what fixes F32's duplicate-overlay bug; this manifest still legitimately needs to match both the outer `kaggle.com` shell and the notebook iframe.

- [ ] **Step 3: Verify the fix**

```bash
grep -n "cdn.jsdelivr.net" packages/extension/public/manifest.json    # expect: no output
grep -n '"scripting"' packages/extension/public/manifest.json          # expect: no output
grep -n '"resources": \["\*"\]' packages/extension/public/manifest.json  # expect: no output
npm run build
```

Expected: build succeeds; `packages/extension/dist/manifest.json` reflects the same narrowed content (webpack's CopyPlugin just copies `public/manifest.json` verbatim at this point — Task 3 adds a transform on top of this file later, don't be surprised if `dist/manifest.json`'s `version` still reads whatever Task 3 leaves it as by the time you run this after later tasks).

Optional 2-minute manual sanity check (not blocking, do it if you have Chrome handy): load `packages/extension/dist/` unpacked at `chrome://extensions`, confirm no manifest warnings shown on the extension card, open a Kaggle notebook in edit mode, confirm the overlay still appears and its title-bar icon still renders (proves `icons/*` WAR coverage is sufficient).

- [ ] **Step 4: Commit**

```bash
git add packages/extension/public/manifest.json
git commit -m "fix(extension): remove CDN content-script match, unused permission, over-broad WAR"
```

---

### Task 2: Cut the old-linter build dependency (F18)

**Files:**

- Create (via move): `packages/extension/src/popup/popup.css`
- Modify: `packages/extension/webpack.config.js`

**Verified against real source (2026-07-10):** `packages/extension/src/popup/` currently contains `PopupApp.tsx`, `index.tsx`, `popup.html` — no `popup.css` yet, so the move lands cleanly with no name collision. `old-linter/src/popup/popup.css` is 431 lines. Current webpack.config.js copies it from `../../old-linter/src/popup/popup.css` (a `CopyPlugin` pattern inside the `patterns` array, alongside the manifest/icons/content.css/pyodide/ruff-wasm patterns already there).

- [ ] **Step 1: Confirm the failing state**

```bash
grep -n "old-linter" packages/extension/webpack.config.js
```

Expected: one match — the `popup.css` CopyPlugin pattern's `from` path.

- [ ] **Step 2: Move the file (not copy — one source of truth)**

```bash
git mv old-linter/src/popup/popup.css packages/extension/src/popup/popup.css
```

- [ ] **Step 3: Edit `packages/extension/webpack.config.js`** — find this block inside the `CopyPlugin` `patterns` array:

```js
        // Copy popup CSS from old-linter
        {
          from: '../../old-linter/src/popup/popup.css',
          to: 'popup.css'
        },
```

Replace with:

```js
        // Copy popup CSS (owned by this package, not old-linter)
        {
          from: 'src/popup/popup.css',
          to: 'popup.css'
        },
```

- [ ] **Step 4: Verify**

```bash
grep -n "old-linter" packages/extension/webpack.config.js   # expect: no output — this is the acceptance gate M6 needs before it can delete old-linter/
npm run build
grep -c "." packages/extension/dist/popup.css                 # expect: a large positive number (file copied, non-empty)
```

Optional manual check: open the popup from the toolbar, confirm it's still styled identically to before.

- [ ] **Step 5: Commit**

```bash
git add old-linter/src/popup/popup.css packages/extension/src/popup/popup.css packages/extension/webpack.config.js
git commit -m "build(extension): move popup.css into the package; drop old-linter build input"
```

---

### Task 3: Single-source the version (F21)

**Files:**

- Create: `packages/extension/src/types/env.d.ts`
- Modify: `packages/extension/webpack.config.js`, `packages/extension/public/manifest.json`, `packages/extension/src/popup/PopupApp.tsx`

**Verified against real source, and the whole mechanism was built and run end-to-end in this session (2026-07-10) before writing this plan** — not just read, actually compiled and bundled:

1. **Line-number drift from the milestone plan:** the plan's own text cites `PopupApp.tsx:351` for the version footer; the real current line is **272**: `<span className="footer-version">v2.0.0</span>`. Use line 272, not 351.
2. **A real TypeScript gap the milestone plan didn't anticipate:** `packages/extension/tsconfig.json` sets `"types": ["chrome"]`, which excludes `@types/node`'s ambient `process` global. `packages/extension/src` currently has **zero** `process.env.*` references anywhere (confirmed via repo-wide grep) — the webpack `DefinePlugin` already defines `process.env.DEBUG`/`NODE_ENV`, but nothing reads them yet. Adding `process.env.EXTENSION_VERSION` to `PopupApp.tsx` as the milestone plan asks is therefore the _first_ `process.env` usage in this package's source, and it does **not** compile without a `process` ambient declaration (`tsc --noEmit` fails with "Cannot find name 'process'" otherwise — confirmed by testing both ways in this session). Adding `"node"` to `tsconfig.json`'s `types` array would fix it but pulls in all of `@types/node`'s globals, including a different `setTimeout`/`clearTimeout` return-type overload (`NodeJS.Timeout` vs. the DOM lib's `number`) that several files in this codebase already type explicitly via `ReturnType<typeof setTimeout>` (`KaggleDomParser.ts`, `lineMarkers.ts`) — safe either way for those specific call sites, but a broader ambient-global change than this task needs. Step 1 below adds a narrow 4-line ambient declaration instead, scoped to exactly this one variable.
3. **The full mechanism (ambient decl + webpack `DefinePlugin` + `CopyPlugin` `transform` + popup JSX change) was built for real in this session**: `npx tsc --noEmit` passed clean, a full `npx webpack --config webpack.config.js` build succeeded, `dist/manifest.json`'s `"version"` field showed the root `package.json`'s `"2.0.0"`, and `dist/popup.js` contained the substituted string (`children:["v","2.0.0"]`) confirming the `DefinePlugin` substitution reaches the bundle. All test edits were reverted before writing this plan — the steps below reproduce that verified state.

- [ ] **Step 1: Confirm the failing state**

```bash
grep -n '"version"' packages/extension/public/manifest.json     # "2.0.0" hardcoded
grep -n "v2.0.0" packages/extension/src/popup/PopupApp.tsx      # line 272, hardcoded literal
grep -n "'2.0.0'" packages/extension/webpack.config.js          # DefinePlugin default, hardcoded
```

Expected: all three find a hardcoded `"2.0.0"`.

- [ ] **Step 2: Create `packages/extension/src/types/env.d.ts`**

```ts
export {};

declare global {
  const process: { env: { EXTENSION_VERSION?: string } };
}
```

- [ ] **Step 3: Edit `packages/extension/webpack.config.js`** — add the `require` near the top:

```js
const webpack = require('webpack');
const { version } = require('../../package.json');

const ruffWasmDir = path.dirname(
  require.resolve('@astral-sh/ruff-wasm-web/package.json')
);
```

Change the `DefinePlugin` default from `'2.0.0'` to the imported `version`:

```js
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'process.env.DEBUG': JSON.stringify(process.env.DEBUG || 'false'),
      'process.env.EXTENSION_VERSION': JSON.stringify(process.env.EXTENSION_VERSION || version),
    }),
```

Add a `transform` to the manifest.json `CopyPlugin` pattern (currently `{ from: 'public/manifest.json', to: 'manifest.json' }`):

```js
        {
          from: 'public/manifest.json',
          to: 'manifest.json',
          transform(content) {
            const manifest = JSON.parse(content.toString());
            manifest.version = process.env.EXTENSION_VERSION || version;
            return JSON.stringify(manifest, null, 2);
          },
        },
```

- [ ] **Step 4: Edit `packages/extension/public/manifest.json`** — set the version field so a stale value can never ship silently if the transform is ever accidentally bypassed:

```json
  "version": "0.0.0",
```

- [ ] **Step 5: Edit `packages/extension/src/popup/PopupApp.tsx:272`**

```tsx
<span className="footer-version">v{process.env.EXTENSION_VERSION}</span>
```

- [ ] **Step 6: Verify**

```bash
npm run type-check   # must pass — confirms env.d.ts resolves process.env.EXTENSION_VERSION
npm run build
grep '"version"' packages/extension/dist/manifest.json   # expect: shows root package.json's version (2.0.0), not 0.0.0
grep -o '"v","[0-9.]*"' packages/extension/dist/popup.js  # expect: ["v","2.0.0"] — confirms the popup substitution reached the bundle
```

Optional manual check: open the popup, confirm the footer shows "v2.0.0" (or whatever root `package.json`'s version currently is).

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/types/env.d.ts packages/extension/webpack.config.js packages/extension/public/manifest.json packages/extension/src/popup/PopupApp.tsx
git commit -m "build: version flows from root package.json into manifest and popup"
```

---

### Task 4: Deduplicate ui-components types (F15)

**Files:**

- Modify: `packages/ui-components/src/types/index.ts`

**Verified against real source (2026-07-10) — this task is narrower than the milestone plan's text, not wider:** the milestone plan's own "Interfaces" note asks the implementer to _decide_ whether `OverlayProps.errors[]`'s inline enriched type should be collapsed into `LintError & {cellIndex, cellLine, element}` — reading the actual current file shows **this was already done**, as part of Milestone 7/8 work that landed after the milestone plan's 2026-07-09 text was written. The file now has a real `LintUIError extends LintError` interface (with `cellLine`, `element`, and a `uuid` field added in M7 for the scroll bridge) consumed throughout `OverlayProps`/`ErrorListProps`/`ErrorItemProps` — there is no inline type left to collapse. Confirmed both `LintError` shapes (`packages/core/src/types/index.ts` and `packages/ui-components/src/types/index.ts`) are structurally identical (`line`, `column?`, `msg`, `severity`, `rule?`, `code?`, `cellIndex?`) — the `code?: string` gap the milestone plan's F15 note mentions was already patched by the consolidation project. Confirmed `packages/core/src/index.ts` exports `Severity`/`LintError` from its root (`export * from './types'`), so `@kaggle-lint/core` is the correct import specifier. Confirmed no other file in `packages/ui-components/src` imports `Severity`/`LintError` from `../types` except the composite prop-type files (`Overlay.tsx`, `ErrorList.tsx`, `ErrorItem.tsx`), all of which only use `OverlayProps`/`ErrorListProps`/`ErrorItemProps`/`LintUIError`/`ErrorStats` — none import bare `Severity`/`LintError` directly, so this change is contained entirely to `types/index.ts`. Confirmed `packages/extension/src` never imports `Severity`/`LintError` from `@kaggle-lint/ui-components` (only `Overlay`, `LintUIError`, `OverlayUiState`) — no ripple effect there either.

- [ ] **Step 1: Confirm the failing state**

```bash
grep -n "duplicated from core" packages/ui-components/src/types/index.ts
```

Expected: one match (the stale comment at line 6).

- [ ] **Step 2: Edit `packages/ui-components/src/types/index.ts`** — replace lines 1–17 (the header comment through the closing brace of the local `LintError` interface):

```ts
/**
 * UI Component Types
 * Re-export core types and add UI-specific types
 */

// Note: These types are duplicated from core to avoid circular dependency during build
export type Severity = 'error' | 'warning' | 'info';

export interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: Severity;
  rule?: string;
  code?: string;
  cellIndex?: number;
}
```

with:

```ts
/**
 * UI Component Types
 * Re-export core types and add UI-specific types
 */

export type { Severity, LintError } from '@kaggle-lint/core';
```

Leave everything below (the `LintUIError`, `OverlayUiState`, `OverlayProps`, `ErrorStats`, `ErrorListProps`, `ErrorItemProps` interfaces) exactly as-is — none of them need to change.

- [ ] **Step 3: Verify**

```bash
npm run type-check && npm run build && npm test
grep -rn "duplicated from core" packages/ui-components/src   # expect: no output
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui-components/src/types/index.ts
git commit -m "refactor: ui-components imports LintError/Severity from core instead of duplicating

LintUIError (the OverlayProps.errors[] element type) already correctly
extends LintError with cellLine/element/uuid as of Milestone 7/8 — no
further collapsing needed, this task only removes the duplicate base
interfaces."
```

---

### Task 5: LintEngine dead branch + typed context hooks (F19, F20) — SKIPPED, moot

`packages/core/src/engines/LintEngine.ts` and `packages/core/src/rules/UndefinedVariablesRule.ts` — the files F19 and F20 describe — were deleted entirely by the unplanned "lint-engine-consolidation" project (2026-07-10, between Milestone 3 and this one). Confirmed via `git log --all --oneline -- packages/core/src/engines/LintEngine.ts` and the milestone plan's own inline note at the top of Task 5's section. There is nothing left to refactor: no dead `emptyCells` branch, no `as any` context-plumbing coupling, because the whole hand-rolled cross-cell-context mechanism they were part of no longer exists (replaced by real Python/Rust scoping over one concatenated whole-notebook source, per `packages/core/src/notebook/buildNotebookSource.ts`).

**No steps, no commit for this task.** Record the omission in `docs/next_plans/milestone-4-config-and-build-hygiene/notes.md` when the milestone completes (Task 6's own commit or a small standalone doc commit — executor's choice, not worth its own task).

---

### Task 6: Toolchain consistency (F22, F23)

**Files:**

- Modify: root `.eslintrc.js`, root `package.json`, `packages/core/package.json`, `packages/ui-components/package.json`, `packages/extension/package.json`, `packages/extension/src/content/lineMarkers.ts`, `packages/extension/src/utils/KaggleDomParser.ts`, `README.md`

**Verified against real source (2026-07-10) — this task has more real work than the milestone plan's text describes, discovered by actually running the tools, not just reading config:**

1. **React types (F22):** confirmed root `package.json` devDependencies pin `@types/react@^18.3.27`/`@types/react-dom@^18.3.7`; `packages/ui-components/package.json` and `packages/extension/package.json` both independently pin `@types/react@^19.2.8`/`@types/react-dom@^19.2.3` in their own devDependencies, while the actual runtime `react`/`react-dom` dependency everywhere is `^18.3.1`. Confirmed exact — matches the milestone plan's finding as-written.
2. **Node floor (F22):** the milestone plan's text cites `README.md:42-45`; the real current lines are **29–30**: `- Node.js 18+` / `- npm 8+`. Root `package.json` `engines` says `node: ">=22.19.0"`, `npm: ">=10.9.3"`; `.github/workflows/ci.yml` uses `node-version: '22'` consistently across all four jobs. Use lines 29–30, not 42–45.
3. **ui-components packaging (F23) — the milestone plan leaves this as an open decision ("pick one, implement it"); it was resolved empirically in this session, not by inspection alone.** The obvious-looking fix (point `package.json`'s `main`/`types` straight at `src/index.ts`, matching how webpack's `resolve.alias` already treats it) was actually **built and tested** and turned out to be a red herring: `packages/extension/tsconfig.json` directly `include`s `../ui-components/src/**/*` (not just resolving the bare specifier), and `packages/ui-components/tsconfig.json` marks that project `"composite": true`. TypeScript's composite-project checker (`TS6305`) requires a real, up-to-date `dist/**/*.d.ts` for any composite-marked source file pulled into another program's `include` list — **regardless of what `package.json`'s `main`/`types` fields say.** Confirmed by deleting `packages/ui-components/dist` and re-running `npx tsc --noEmit` in `packages/extension` both with the original `dist/index.js` main-field and with a `src/index.ts` main-field: both configurations fail identically with `TS6305` errors once `dist/` is absent, and both succeed once it's rebuilt. So the "nothing consumes ui-components' dist" premise behind switching to `src/` is false — the composite/`include` interaction is a real, structural dependency on `dist/` existing, independent of the packaging metadata. **Decision: keep `main`/`types` pointing at `dist/index.js`/`dist/index.d.ts` unchanged**, and instead fix the concrete bug F23 actually describes — `dist/Overlay/Overlay.js` contains `import './Overlay.css';` (confirmed via `grep -n css` on the built output) but no `Overlay.css` is ever copied into `dist/`. Tested and confirmed: adding a `copyfiles` step mirroring `packages/core`'s own existing `copy-pyodide` pattern (`copyfiles -u 1 "src/**/*.css" dist` run after `tsc`) produces `dist/Overlay/Overlay.css` correctly. This is the smaller, lower-risk fix, it reuses a pattern already established in this repo (`packages/core/package.json`'s `copy-pyodide` script), and it doesn't touch the TS6305 composite-project machinery at all.
4. **A real, previously-invisible bug this task must fix, not just "expect":** the milestone plan's Step 4 says "expect `@typescript-eslint/no-explicit-any` warnings" when adding per-package `lint` scripts — true, but running `npx eslint packages/extension/src --ext .ts,.tsx` (and `packages/ui-components/src`) in this session surfaced two categories of real **errors**, not warnings, that the milestone plan's author never saw because `npm run lint` has been a silent no-op (F4) this whole time:
   - **3× `prefer-const` errors** — `packages/extension/src/content/lineMarkers.ts:43` and `packages/extension/src/utils/KaggleDomParser.ts:129,177`. All three are the identical shape: `let timeoutId: ReturnType<typeof setTimeout>;` declared, then assigned exactly once a few lines later (`timeoutId = setTimeout(...)`) inside a bridge-request `Promise` executor, read only from closures (`cleanup`) defined _before_ the assignment but not _invoked_ until after it. Confirmed real by reading the surrounding code in both files — genuinely fixable by declaring `const timeoutId = setTimeout(...)` at the point of assignment instead of `let` + separate declaration; no behavior change (the closures only read the binding when they run, after the `const` would already be initialized).
   - **2× `"Definition for rule 'react-hooks/exhaustive-deps' was not found"` errors** — `packages/ui-components/src/Overlay/Overlay.tsx:73` and `packages/extension/src/content/ContentApp.tsx:261` both have a `// eslint-disable-next-line react-hooks/exhaustive-deps` comment (deliberately suppressing the rule for legitimate mount-only `useEffect(() => {...}, [])` calls), but `eslint-plugin-react-hooks` was never installed or registered in the root `.eslintrc.js` — so ESLint doesn't recognize the rule name the disable comment references and errors instead of silently no-op'ing. **This was invisible until now for the same reason as the `prefer-const` errors: `npm run lint` never actually ran.** Verified in this session (temporarily installed the plugin, registered it, ran the full three-package lint): adding `eslint-plugin-react-hooks` makes both existing disable comments valid again (0 errors), and additionally surfaces **one genuine, previously-uncaught warning** — `Overlay.tsx:131`, a `useEffect` missing `onStateChange` in its dependency array. This is real and worth knowing about, but fixing it changes runtime callback-timing behavior that Milestone 7/8 hard-won and tested live — out of scope for a "no behavior change" hygiene milestone. **Do not fix it in this task**; leave it as a warning (this repo's `lint` scripts intentionally don't use `--max-warnings 0`, see point 5) and note it in `notes.md` for a future milestone.
5. **`--max-warnings 0` decision:** the milestone plan's Step 4 leaves this as a fallback ("may need to start as a plain `eslint src --ext .ts,.tsx` if the backlog is large"). Confirmed the backlog is real: `packages/extension/src` has 22 `@typescript-eslint/no-explicit-any` warnings across 6 files (`ContentApp.tsx`, `pyodideRuntime.ts`, `pageExtractor.ts`, `PopupApp.tsx`, `CodeMirrorManager.ts`, `KaggleDomParser.ts`) plus the one new `react-hooks/exhaustive-deps` warning above — converting all of those to real types is out of scope for this milestone (it's not in F22/F23, and "no behavior change" doesn't preclude it but the milestone's own scope does). **Decision: `"lint": "eslint src --ext .ts,.tsx"` with no `--max-warnings 0`**, for all three packages, so `npm run lint` passes today without a large unrelated refactor, while still catching real errors (which is what actually matters for CI, see point 6).
6. **A consequence worth flagging explicitly:** `.github/workflows/ci.yml`'s `lint` job already runs `npm run lint` (line 27) — it's been silently green this whole time only because no package defined a `lint` script (F4, still nominally "Milestone 5's fix," but this task's Step 4 is what actually flips the CI lint job from no-op to enforcing, as an unavoidable side effect of adding the scripts F22/F23 groundwork calls for). This makes fixing the `prefer-const`/`react-hooks` errors in this task **mandatory, not optional polish** — merging Task 6 without them would turn CI's lint job red on the very next push.

- [ ] **Step 1: React types — confirm the failing state**

```bash
npm ls @types/react
```

Expected: shows more than one resolved version (18.x at root, 19.x nested under ui-components/extension).

- [ ] **Step 2: Remove the duplicate pins.** Edit `packages/ui-components/package.json` and `packages/extension/package.json`: delete `@types/react` and `@types/react-dom` from each `devDependencies` block (the hoisted root 18.x pins become the only source).

- [ ] **Step 3: Node floor.** Edit `README.md` lines 29–30:

```md
- Node.js 22+
- npm 10+
```

- [ ] **Step 4: ui-components packaging — make `dist/` honest.** Edit `packages/ui-components/package.json`:

```json
{
  "name": "@kaggle-lint/ui-components",
  "version": "2.0.0",
  "description": "React UI components for Kaggle Python Linter",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc && npm run copy-css",
    "copy-css": "copyfiles -u 1 \"src/**/*.css\" dist",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "clean": "rm -rf dist"
  },
  "peerDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "dependencies": {
    "@kaggle-lint/core": "*"
  },
  "keywords": ["linter", "react", "components"],
  "author": "",
  "license": "MIT",
  "devDependencies": {
    "copyfiles": "^2.4.1"
  }
}
```

- [ ] **Step 5: Mark core and extension `private` too, add their `lint` scripts.** Edit `packages/core/package.json` — add `"private": true` (after `"description"`) and `"lint": "eslint src --ext .ts,.tsx"` to `scripts`. Edit `packages/extension/package.json` — same two additions.

- [ ] **Step 6: Register `eslint-plugin-react-hooks`.** Edit root `package.json` devDependencies, add:

```json
    "eslint-plugin-react-hooks": "^4.6.2",
```

Edit root `.eslintrc.js`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'react-hooks'],
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
```

- [ ] **Step 7: Fix the 3 real `prefer-const` errors.** Edit `packages/extension/src/content/lineMarkers.ts` — replace:

```ts
const requestId = crypto.randomUUID();
let settled = false;
let timeoutId: ReturnType<typeof setTimeout>;

const cleanup = () => {
  window.removeEventListener('message', handleMessage);
  clearTimeout(timeoutId);
};
```

with:

```ts
const requestId = crypto.randomUUID();
let settled = false;

const cleanup = () => {
  window.removeEventListener('message', handleMessage);
  clearTimeout(timeoutId);
};
```

and replace:

```ts
    window.addEventListener('message', handleMessage);

    timeoutId = setTimeout(() => {
```

with:

```ts
    window.addEventListener('message', handleMessage);

    const timeoutId = setTimeout(() => {
```

Edit `packages/extension/src/utils/KaggleDomParser.ts` — apply the identical pair of edits **twice** (once for the `requestFromPage()` method around line 129, once for the `scrollToCellLine()` method around line 177): in each of the two `Promise` executors, delete the standalone `let timeoutId: ReturnType<typeof setTimeout>;` declaration line, and change the later `timeoutId = setTimeout(() => {` to `const timeoutId = setTimeout(() => {`.

- [ ] **Step 8: Verify**

```bash
npm install
npm run lint
```

Expected: zero errors across all packages (some `@typescript-eslint/no-explicit-any` warnings and the one `react-hooks/exhaustive-deps` warning in `Overlay.tsx:131` remain — that's expected per point 4/5 above, not a failure).

```bash
npm ls @types/react   # expect: single 18.x version
npm run type-check && npm run build && npm test
find packages/ui-components/dist -name "*.css"   # expect: dist/Overlay/Overlay.css exists
```

- [ ] **Step 9: Commit**

```bash
git add .eslintrc.js package.json package-lock.json README.md \
  packages/core/package.json packages/ui-components/package.json packages/extension/package.json \
  packages/extension/src/content/lineMarkers.ts packages/extension/src/utils/KaggleDomParser.ts
git commit -m "chore: align react types and node floor; real per-package lint scripts; honest ui-components packaging

ui-components packaging: kept main/types pointing at dist/ (switching to
src/ was tested and found to not remove the dist/ dependency at all —
packages/extension/tsconfig.json directly includes ui-components' composite-
marked src tree, which requires a built dist/ regardless of package.json's
main/types field); fixed the actual bug instead, a copy-css build step so
dist/Overlay/Overlay.css exists alongside the .js that imports it.

Adding real lint scripts flips CI's lint job (ci.yml already calls
npm run lint) from silent no-op to enforcing on the next push, so the
3 real prefer-const errors and the 2 missing-plugin react-hooks/
exhaustive-deps errors this surfaced had to be fixed here, not deferred."
```

---

## Post-milestone note

After Task 6 lands, create `docs/next_plans/milestone-4-config-and-build-hygiene/notes.md` recording:

- Task 5 skipped as moot (files deleted by the lint-engine-consolidation project).
- The one new `react-hooks/exhaustive-deps` warning surfaced in `Overlay.tsx:131` (missing `onStateChange` dep) — real, deliberately not fixed here (would change M7/M8-tested callback timing), flag for a future milestone.
- `old-linter/.env` is already gitignored via `old-linter/.gitignore` and was never tracked (`git log --all -- old-linter/.env` is empty) — F30 (P3, still nominally open per the summary table) turns out to already be a non-issue in practice; worth a one-line correction next time `review-findings.md` gets a pass, not urgent.

This milestone has no manual USER-GATE. Once Task 6 is committed, hand off to P3 (`docs/next_plans/DEVELOPER_PROMPTS.md` §2) — a fresh-session whole-branch review — followed by a quick 2-minute unpacked-load sanity check, per the milestone's batch map.
