# Milestone 5: Tests & CI That Tell the Truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every CI job actually checks something: lint runs eslint, tests cover all 9 rules plus the extension's pure logic, and coverage is generated, thresholded honestly, and uploaded.

**Architecture:** Core gets per-rule Jest suites (pure functions — cheap to test). The extension gets a Jest+jsdom setup for its two pure-logic units (`KaggleDomParser` DOM extraction against HTML fixtures, `CodeMirrorManager` store) — no browser automation in CI (manual gates in M1–M3/M6 cover E2E). CI is repaired rather than extended.

**Tech Stack:** Jest, ts-jest, jsdom, GitHub Actions.

**Fixes findings:** F4, F5, and the test-coverage half of F24. Depends on: Milestone 1; Milestone 4 (merged 2026-07-10) — its Task 6 already landed the per-package lint scripts Task 4 needs, see that task's inline note. **(2026-07-10 note: the "registry exists" dependency below is stale — the rule registry was deleted by an unplanned project between M3 and M4; see Task 1's inline note.)**

## Global Constraints

- Test style: table-driven per rule; each case is `{ name, code, expect: partial errors[] }` asserting on `line`, `severity`, and message substring — not exact message equality (messages may be reworded later).
- Multi-line Python snippets in tests must not rely on template-literal indentation — use explicit `\n` joins or a `dedent` helper defined once in a shared test util.
- Every task ends with `npm test` green from repo root.

---

### Task 1: Per-rule test suites for the 8 untested rules

> **MOOT 2026-07-10.** An unplanned "lint-engine-consolidation" project (between M3 and M4) deleted `packages/core/src/rules/` entirely — all 9 rule classes (including the 8 this task targets), `BaseRule`, and the registry are gone. There is nothing left to write per-rule tests for. **Skip this task.**
>
> What replaced it already has its own thorough Jest coverage, written by the consolidation project itself: `packages/core/src/__tests__/buildNotebookSource.test.ts` (magic/shell-line blanking, bracket/quote/comment-aware continuation detection), `packages/core/src/__tests__/severityMapping.test.ts` (severity classification, diagnostic mapping), `packages/core/src/__tests__/lintWithSyntaxIsolation.test.ts` (the syntax-error-isolation retry loop), `packages/core/src/__tests__/flake8Shim.test.ts` (Python shim string-inspection). If this milestone still wants a dedicated coverage-audit task, replace this one with: run `npx jest --coverage` in `packages/core`, read the actual line/branch coverage on those four files, and decide whether any gaps are worth closing — don't write new rule suites for deleted rules.

---

### Task 2: Engine and registry coverage

> **RESCOPED 2026-07-10.** `packages/core/src/__tests__/LintEngine.test.ts` and the file it tested (`LintEngine.ts`) are both deleted. The specific behaviors this task wanted covered (cross-cell context accumulation, per-rule error isolation) don't exist in that form anymore — cross-cell scoping is now achieved via real Python/Rust semantics over one concatenated whole-notebook source (`buildNotebookSource.ts`, already tested), and per-cell error isolation is now `lintWithSyntaxIsolation.ts`'s syntax-error retry loop (already tested, 5 test cases covering termination/correctness). Before writing anything new, read those three test files and judge whether they already cover this task's intent. If a real gap remains (e.g. `mapDiagnostics`'s `engineName` tagging, or an end-to-end multi-engine scenario), write it against the current `packages/core/src/notebook/*` modules — do not target the deleted `LintEngine.test.ts` path.

**Files:**
- Modify or extend: `packages/core/src/__tests__/{buildNotebookSource,severityMapping,lintWithSyntaxIsolation}.test.ts` as needed, not `LintEngine.test.ts` (deleted)

- [ ] **Step 1:** Run `cd packages/core && npx jest --coverage -v` and read the actual coverage for `notebook/*`. Identify any genuine gap against this task's original intent (grouping/stats/error-isolation/cross-cell behaviors) that isn't already exercised.
- [ ] **Step 2:** Write tests for any real gap found, following the existing files' table-driven style. If no real gap exists, note that in the commit body instead of writing tests for coverage's sake.
- [ ] **Step 3:** `cd packages/core && npx jest -v` → green.
- [ ] **Step 4: Commit** — `test(core): close notebook-pipeline coverage gaps` (or skip the commit if Step 1 found nothing to add)

---

### Task 3: Extension test infra + pure-logic tests

**Files:**
- Create: `packages/extension/jest.config.js` (ts-jest preset, `testEnvironment: 'jsdom'`), `packages/extension/src/__tests__/CodeMirrorManager.test.ts`, `packages/extension/src/__tests__/KaggleDomParser.test.ts`, `packages/extension/src/__tests__/fixtures/notebook.html` (minimal `.jp-Cell`/`.jp-CodeCell`/`.cm-editor`/`.cm-line` markup — derive from a saved snippet of a real Kaggle notebook DOM, 2 code cells + 1 markdown cell)
- Modify: `packages/extension/package.json` (add `"test": "jest"`, devDeps `jest`, `ts-jest`, `@types/jest`, `jest-environment-jsdom`)

- [ ] **Step 1:** CodeMirrorManager: `syncCells` add/update counts, `getAllCells` ordering by cellIndex, uuid-vs-index keying, `updateCell` no-op on identical code.
- [ ] **Step 2:** KaggleDomParser (DOM-fallback path only — the bridge path from M2 needs a browser): load the fixture into jsdom (`document.body.innerHTML = fixture`), assert `extractCells()` returns 2 cells with joined `.cm-line` text, skips the markdown cell, and `detectTheme()` honors `theme--dark` class. Mock the M2 bridge request to time out fast if M2 has landed (inject a 1 ms timeout or stub `requestFromPage`).
- [ ] **Step 3:** `cd packages/extension && npx jest -v` → green; root `npm test` now runs both packages via turbo.
- [ ] **Step 4: Commit** — `test(extension): jsdom infra; parser and cell-store suites`

---

### Task 4: Repair CI (F4, F5)

> **2026-07-10 note:** Milestone 4 (merged) already landed Step 1's `"lint": "eslint src --ext .ts,.tsx"` script in all three packages' `package.json`s, plus a root `eslint-plugin-react-hooks` registration and 3 `prefer-const` fixes that a real lint run surfaced for the first time — `.github/workflows/ci.yml`'s lint job already calls `npm run lint`, so it has been enforcing (not a no-op) since M4 merged, with a currently-clean run (0 errors, ~23 warnings, all `@typescript-eslint/no-explicit-any` plus one accepted `react-hooks/exhaustive-deps` in `Overlay.tsx:131`). Step 1 below is now just a verification step, not new work — confirm the scripts are still present and the sanity check (break a file, confirm `npm run lint` fails, revert) still holds, don't re-add what's already there.

**Files:**
- Modify: `.github/workflows/ci.yml`, `packages/core/jest.config.js`

- [ ] **Step 1:** Lint job: verify every package still has `"lint": "eslint src --ext .ts,.tsx"` (landed in Milestone 4) so `turbo run lint` does real work. Sanity: break a file locally, confirm `npm run lint` fails, revert.
- [ ] **Step 2:** Test job: run `npm test -- -- --coverage` won't thread through turbo cleanly — instead change core's `test` script to `jest --coverage` (coverage always; it's cheap) and extension's likewise. Now `packages/core/coverage/lcov.info` exists and the existing codecov step works; add the extension lcov path to the upload.
- [ ] **Step 3:** Set coverage thresholds to reality: measure actual post-Task-1-3 coverage (`npx jest --coverage` locally), set core's `coverageThreshold` ~5 points below measured (not the aspirational 70% that was never enforced), extension threshold modest (its React components are untested by design until M6). Record measured numbers in the commit body.
- [ ] **Step 4:** Verify by pushing the branch: all four CI jobs green, codecov upload no longer warns about missing files, and deliberately breaking a rule test in a scratch commit turns the Test job red (then drop the scratch commit).
- [ ] **Step 5: Commit** — `ci: real lint job, coverage generation and honest thresholds`
