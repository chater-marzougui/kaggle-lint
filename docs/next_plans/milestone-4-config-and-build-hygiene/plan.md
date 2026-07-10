# Milestone 4: Config & Build Hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the misconfigurations and duplication the pre-agentic era left behind: a correct minimal manifest, an extension build with no `old-linter/` dependency, one source of truth for types and version, and consistent toolchain pins.

**Architecture:** Pure cleanup — no behavior changes. Each task is independently revertible; keep them as separate commits. This milestone touches files Milestones 2/3 also touch (`manifest.json`, `ContentApp.tsx`): if those milestones are running in parallel branches, land this one after rebasing.

**Tech Stack:** Chrome MV3 manifest, webpack, npm workspaces, TypeScript.

**Fixes findings:** F15, F17, F18, F21, F22, F23. (F16, F19, F20 were made moot 2026-07-10 by an unplanned project that deleted the files they described — see Tasks 4-5's inline notes.) Depends on: Milestone 1.

## Global Constraints

- No user-visible behavior change in this milestone; after every task the extension must build and behave identically (`npm run type-check && npm run build`, plus quick unpacked-load sanity check after Tasks 1–2).
- Settings storage shape and message types stay untouched.

---

### Task 1: Manifest cleanup (F17)

**Files:**
- Modify: `packages/extension/public/manifest.json`

- [ ] **Step 1:** Apply exactly:
  - Remove `"https://cdn.jsdelivr.net/pyodide/v0.24.1/full/*"` from `content_scripts.matches` (a content script injected into a CDN is meaningless).
  - Remove `"scripting"` from `permissions` (`chrome.scripting` is used nowhere — re-verify with `grep -rn "chrome.scripting" packages/extension/src`).
  - Narrow `web_accessible_resources` to what pages actually load: `{ "resources": ["pyodide/*", "icons/*"], "matches": ["https://www.kaggle.com/*", "https://kkb-production.jupyter-proxy.kaggle.net/*"] }`.
  - Collapse `host_permissions` to `["https://www.kaggle.com/*", "https://*.kaggleusercontent.com/*", "https://kkb-production.jupyter-proxy.kaggle.net/*"]` (drop the duplicate/overlapping patterns).
- [ ] **Step 2: Verify** — build, load unpacked: no manifest warnings; overlay still appears on a notebook edit page; overlay title icon still loads (it uses `chrome.runtime.getURL('icons/…')` → covered by `icons/*`).
- [ ] **Step 3: Commit** — `fix(extension): remove CDN content-script match, unused permission, over-broad WAR`

---

### Task 2: Cut the old-linter build dependency (F18)

**Files:**
- Create: `packages/extension/src/popup/popup.css` (moved content)
- Modify: `packages/extension/webpack.config.js:60-64`

- [ ] **Step 1:** `git mv old-linter/src/popup/popup.css packages/extension/src/popup/popup.css` (move, don't copy — one source of truth; old-linter's demo doesn't use the popup).
- [ ] **Step 2:** Update the CopyPlugin pattern to `{ from: 'src/popup/popup.css', to: 'popup.css' }`.
- [ ] **Step 3: Verify** — build; open the popup from the toolbar: styled correctly. `grep -rn "old-linter" packages/extension/webpack.config.js` → no matches (this is the acceptance gate that lets Milestone 6 delete the folder).
- [ ] **Step 4: Commit** — `build(extension): move popup.css into the package; drop old-linter build input`

---

### Task 3: Single-source the version (F21)

**Files:**
- Modify: `packages/extension/webpack.config.js`, `packages/extension/src/popup/PopupApp.tsx:351`

- [ ] **Step 1:** In webpack config: `const { version } = require('../../package.json');` and define `'process.env.EXTENSION_VERSION': JSON.stringify(process.env.EXTENSION_VERSION || version)`. Extend the CopyPlugin `manifest.json` pattern with a `transform` that parses the JSON, sets `.version = version`, and re-stringifies — the manifest in `public/` becomes version-agnostic (set it to `"0.0.0"` there so a stale value can never ship silently).
- [ ] **Step 2:** Popup footer renders `v{process.env.EXTENSION_VERSION}` instead of the literal.
- [ ] **Step 3: Verify** — build; `grep '"version"' packages/extension/dist/manifest.json` shows the root package.json version; popup footer shows it too.
- [ ] **Step 4: Commit** — `build: version flows from root package.json into manifest and popup`

---

### Task 4: Deduplicate types (F15, F16)

> **RESCOPED 2026-07-10.** An unplanned "lint-engine-consolidation" project (between M3 and M4) deleted `packages/core/src/engines/LintEngine.ts` and `packages/core/src/engines/Flake8Engine.ts` entirely — F16's target files and the `NotebookCell`/`NotebookError`/`ErrorStats` triplication it names no longer exist (**F16 is moot**; there is nothing left to dedupe there). The real shared shapes now live in `packages/core/src/notebook/buildNotebookSource.ts` (`NotebookCellInput`, `CellOffset`) and `packages/core/src/notebook/severityMapping.ts` (`RawDiagnostic`, and `mapDiagnostics`'s return type `LintError & {cellIndex, cellLine}`), both declared once, not duplicated. **F15 is still real and still needs fixing**: `packages/ui-components/src/types/index.ts` still redeclares `LintError`/`Severity` separately from core's. The task below is rewritten to just that.

**Files:**
- Modify: `packages/ui-components/src/types/index.ts` (delete the duplicated `Severity`/`LintError` interfaces, import from `@kaggle-lint/core` instead), `packages/ui-components/src/index.ts` if it re-exports these types

**Interfaces:**
- Consumes: `LintError`, `Severity` from `@kaggle-lint/core` (already exported).
- Note: `OverlayProps.errors[]`'s inline type also duplicates `LintError`'s shape (plus `cellIndex`/`cellLine`/`element`) — decide during this task whether to also collapse that into `Array<LintError & { cellIndex?: number; cellLine?: number; element?: Element | null }>` or leave it as its own inline type; either is acceptable, note the choice in the commit body.

- [ ] **Step 1:** Read the current `packages/ui-components/src/types/index.ts` and `packages/core/src/types/index.ts` in full before touching anything — verify the exact current shape of both `LintError` interfaces (they may have drifted further since 2026-07-10; the consolidation project added a `code?: string` field to both as a stopgap, but the duplication itself was left for this task).
- [ ] **Step 2:** Delete `ui-components`'s local `Severity`/`LintError` declarations; `import type { Severity, LintError } from '@kaggle-lint/core';` instead. Fix any resulting type errors in `OverlayProps`, `ErrorListProps`, `ErrorItemProps`.
- [ ] **Step 3: Verify** — `npm run type-check && npm run build && npm test` green. `grep -rn "duplicated from core" packages/ui-components/src` → no matches.
- [ ] **Step 4: Commit** — `refactor: ui-components imports LintError/Severity from core instead of duplicating`

---

### Task 5: LintEngine dead branch + typed context hooks (F19, F20)

> **MOOT 2026-07-10.** `packages/core/src/engines/LintEngine.ts`, `packages/core/src/rules/UndefinedVariablesRule.ts`, and `packages/core/src/__tests__/LintEngine.test.ts` were all deleted by the unplanned "lint-engine-consolidation" project — every file this task names is gone. F19 (the dead `emptyCells` branch) and F20 (`as any` context-plumbing coupling) both described code inside `LintEngine.ts`, which no longer exists — they are moot, not fixed-as-planned. **Skip this task entirely.** Do not attempt to execute it against current source; there is nothing left to refactor. If you land here via `superpowers:writing-plans` expansion, drop this task from the generated plan and note the omission in the milestone's `notes.md`.

---

### Task 6: Toolchain consistency (F22, F23)

**Files:**
- Modify: root `package.json`, `packages/*/package.json`, `packages/ui-components/package.json` build script, `README.md:42-45`

- [ ] **Step 1:** React types: remove `@types/react`/`@types/react-dom` v19 pins from `packages/ui-components` and `packages/extension` devDeps — the hoisted v18 root pins (matching the React 18 runtime) are the single source. Run `npm install`, confirm `npm ls @types/react` resolves to one 18.x version.
- [ ] **Step 2:** Node floor: pick the enforced one (root `engines` says `>=22.19.0`; CI uses Node 22) and make `README.md` prerequisites say Node 22+ / npm 10+.
- [ ] **Step 3:** ui-components dist (F23): the package is only ever consumed via webpack's `src/` alias — make that official instead of shipping a broken dist: in `packages/ui-components/package.json` set `"main": "src/index.ts"`, `"private": true` (all three packages are unpublished; mark core and extension `"private": true` too), and simplify `build` to `tsc --noEmit` renamed responsibility (keep `build` running `tsc` for the type gate only if turbo ordering needs an output — simpler: keep `build: tsc` but add a `copyfiles` step for `*.css` like core does for pyodide, so dist is honest). Choose the `copyfiles` route only if you want dist usable; otherwise document src-consumption in the package README. **Pick one, implement it, note the choice in the commit body.**
- [ ] **Step 4:** Add per-package `lint` scripts groundwork for Milestone 5: in each package.json, `"lint": "eslint src --ext .ts,.tsx --max-warnings 0"`. (M5 wires CI; adding the scripts here keeps this milestone the config-owner.) Run `npm run lint` — fix or explicitly downgrade any new violations it surfaces (expect `@typescript-eslint/no-explicit-any` warnings; `--max-warnings 0` may need to start as a plain `eslint src --ext .ts,.tsx` if the backlog is large — record the decision).
- [ ] **Step 5: Verify** — `npm install && npm run lint && npm run type-check && npm run build && npm test` all pass.
- [ ] **Step 6: Commit** — `chore: align react types and node floor; real per-package lint scripts; honest ui-components packaging`
