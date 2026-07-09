# Milestone 5: Tests & CI That Tell the Truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every CI job actually checks something: lint runs eslint, tests cover all 9 rules plus the extension's pure logic, and coverage is generated, thresholded honestly, and uploaded.

**Architecture:** Core gets per-rule Jest suites (pure functions — cheap to test). The extension gets a Jest+jsdom setup for its two pure-logic units (`KaggleDomParser` DOM extraction against HTML fixtures, `CodeMirrorManager` store) — no browser automation in CI (manual gates in M1–M3/M6 cover E2E). CI is repaired rather than extended.

**Tech Stack:** Jest, ts-jest, jsdom, GitHub Actions.

**Fixes findings:** F4, F5, and the test-coverage half of F24. Depends on: Milestone 1 (registry exists); Task 4 needs Milestone 4 Task 6's per-package lint scripts (add them here if M4 hasn't landed).

## Global Constraints

- Test style: table-driven per rule; each case is `{ name, code, expect: partial errors[] }` asserting on `line`, `severity`, and message substring — not exact message equality (messages may be reworded later).
- Multi-line Python snippets in tests must not rely on template-literal indentation — use explicit `\n` joins or a `dedent` helper defined once in a shared test util.
- Every task ends with `npm test` green from repo root.

---

### Task 1: Per-rule test suites for the 8 untested rules

**Files:**
- Create: `packages/core/src/__tests__/rules/<RuleName>.test.ts` × 8 (capitalizationTypos, duplicateFunctions, emptyCells, importIssues, indentationErrors, missingReturn, redefinedVariables, unclosedBrackets)
- Create: `packages/core/src/__tests__/helpers.ts` (`dedent`, `runRule(rule, code, context?)`)

**Interfaces:**
- Consumes: each rule class from `../rules`; `LintError` from `../types`.

- [ ] **Step 1:** For each rule, write ≥ 4 cases first (red where a rule is genuinely broken): (a) one clear positive per behavior the popup description promises, (b) one clean-code negative, (c) one boundary (empty string / comment-only / string-literal containing the trigger token, e.g. `x = "import *"` must not flag), (d) line-number correctness with `cellOffset = 10`. Example shape (CapitalizationTypos):

```ts
const cases = [
  { name: 'flags lowercase true', code: 'x = true', want: [{ line: 1, severity: 'warning', msgHas: 'True' }] },
  { name: 'clean code', code: 'x = True', want: [] },
  { name: 'inside string not flagged', code: 'x = "true"', want: [] },
  { name: 'offset applied', code: 'x = true', offset: 10, want: [{ line: 11 }] },
];
```

- [ ] **Step 2:** Run: `cd packages/core && npx jest rules -v`. **If a rule fails a reasonable case, the case is right and the rule is wrong** — fix the rule (root cause, minimal diff) in the same task and note it in the commit body. Expect the regex-based rules to have false-positive bugs (esp. importIssues/unclosedBrackets inside strings); fixing every conceivable case is out of scope — fix what your written cases catch, document known gaps as `it.skip` with a comment.
- [ ] **Step 3: Commit per rule or in two batches** — `test(core): table-driven suite for <rule> (+ fixes)`

---

### Task 2: Engine and registry coverage

**Files:**
- Modify: `packages/core/src/__tests__/LintEngine.test.ts`

- [ ] **Step 1:** Add missing engine behaviors: `filterBySeverity` ordering, `groupByCell`/`groupByRule`, `getStats` counts, a rule that throws is isolated (engine returns other rules' errors — assert via a stub rule `{ name: 'boom', run() { throw new Error('x'); } }`), and cross-cell context accumulation across ≥ 3 cells.
- [ ] **Step 2:** `cd packages/core && npx jest LintEngine -v` → green.
- [ ] **Step 3: Commit** — `test(core): engine grouping, stats, error isolation, cross-cell context`

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

**Files:**
- Modify: `.github/workflows/ci.yml`, `packages/core/jest.config.js`, per-package `package.json` if M4 Task 6's lint scripts are missing

- [ ] **Step 1:** Lint job: ensure every package has `"lint": "eslint src --ext .ts,.tsx"` so `turbo run lint` does real work. Sanity: break a file locally, confirm `npm run lint` fails, revert.
- [ ] **Step 2:** Test job: run `npm test -- -- --coverage` won't thread through turbo cleanly — instead change core's `test` script to `jest --coverage` (coverage always; it's cheap) and extension's likewise. Now `packages/core/coverage/lcov.info` exists and the existing codecov step works; add the extension lcov path to the upload.
- [ ] **Step 3:** Set coverage thresholds to reality: measure actual post-Task-1-3 coverage (`npx jest --coverage` locally), set core's `coverageThreshold` ~5 points below measured (not the aspirational 70% that was never enforced), extension threshold modest (its React components are untested by design until M6). Record measured numbers in the commit body.
- [ ] **Step 4:** Verify by pushing the branch: all four CI jobs green, codecov upload no longer warns about missing files, and deliberately breaking a rule test in a scratch commit turns the Test job red (then drop the scratch commit).
- [ ] **Step 5: Commit** — `ci: real lint job, coverage generation and honest thresholds`
