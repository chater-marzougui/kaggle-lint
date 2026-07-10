# Lint Engine Consolidation — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the handmade rule-based engine, rewrite flake8 to a whole-notebook single-pass model using flake8's real API, and add ruff (`@astral-sh/ruff-wasm-web`) as a second, parallel engine — sharing one offscreen document and one cell-concatenation/severity-mapping pipeline with flake8.

**Architecture:** A new shared `packages/core/src/notebook/` module concatenates all cells into one source string (magic/shell lines blanked, line counts preserved) plus an offset table. Each engine lints that one string once per lint call: flake8 via a rewritten Python shim calling flake8's real `Application`/`StyleGuide` API (not raw pyflakes), ruff via `@astral-sh/ruff-wasm-web`'s `Workspace.check()`. Both engines' raw diagnostics map back to `(cellIndex, cellLine)` via the same shared offset table and severity heuristic. The background↔offscreen protocol from Milestone 3 generalizes from flake8-specific to engine-parameterized (`ENGINE_LINT_NOTEBOOK{engine: 'flake8'|'ruff'}`), reusing the exact same disjoint-namespace/in-flight-lock design.

**Tech Stack:** Real `flake8` 6.1.0 Python API (`flake8.main.application.Application`, `flake8.api.legacy.StyleGuide`, `flake8.formatting.base.BaseFormatter` — not `flake8.api.legacy.get_style_guide()`, whose convenience wrapper cannot capture structured results, see Task 3), `@astral-sh/ruff-wasm-web` 0.15.x (wasm-pack "web" target, `initSync`/`Workspace`), Pyodide 0.24.1 (unchanged from Milestone 3), Chrome MV3 offscreen document + background relay (unchanged architecture from Milestone 3, generalized message types).

**Spec:** `docs/superpowers/specs/2026-07-09-lint-engine-consolidation-design.md` — read for full rationale; this plan implements it task-by-task. Every design decision there is pre-made — do not re-open them.

**Source-of-truth verification (done 2026-07-09):** every file this plan touches was read in full from the current working tree (`packages/core/src/{rules/**,engines/**,types/index.ts,index.ts,__tests__/**}`, `packages/extension/src/{background,offscreen,flake8,content,popup}/**`, `packages/extension/{webpack.config.js,package.json,public/manifest.json}`, `packages/ui-components/src/{types/index.ts,Overlay/Overlay.tsx}`, `CLAUDE.md`, `README.md`). Additionally, **the two riskiest technical claims in the spec were independently re-verified by direct execution, not re-trusted from the spec doc**:

- flake8's real API wiring (`Application`/`StyleGuide`/`BaseFormatter`, formatter-before-`make_guide()` ordering, file-based not string-based `check_files`) — re-confirmed via the same repro technique against the actual bundled flake8 6.1.0 wheel.
- ruff-wasm's row/column indexing — **newly verified for this plan** (the spec doc did not test this): ran `@astral-sh/ruff-wasm-web` 0.15.21 directly in Node 22 (`initSync` with the raw `.wasm` buffer, bypassing the browser-`fetch` path) against `'import os\n\nx = y + 1\n'`. Confirmed `start_location.row` is **1-indexed** (F821 on `x = y + 1`, the 3rd line, reported `row: 3`) and `start_location.column` is also 1-indexed (F401's `os` in `import os` reported `column: 8`, matching the 1-indexed position of `o`) — i.e., **identical indexing convention to flake8's `line_number`/`column_number`**, so the `Diagnostic → RawDiagnostic` normalization needs no off-by-one adjustment. This was a real risk (many WASM/compiler tools use 0-indexed positions) now closed by direct evidence.

## Global Constraints

- Node >= 22.19.0; run all commands from repo root unless a task says otherwise; Windows executors use Git Bash for `rm -rf`/`&&`.
- Every task ends with root `npm run type-check && npm run build && npm test` passing, **except Task 5**, which — like Milestone 3's Task 4 — deletes a file (`flake8/protocol.ts`) whose last consumer (`flake8/Flake8Client.ts`) isn't migrated until the very next task. Task 5's own Verify step is explicit about this; run Tasks 5 and 6 back-to-back with no other work in between, and don't attempt to force Task 5 green in isolation.
- `tsconfig.base.json` has `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"isolatedModules": true` — type-only imports across module boundaries use `import type` / `import { type X }`.
- Extension package has **no test runner** (only `packages/core` has Jest, confirmed unchanged from Milestone 3). New pure-logic modules (`buildNotebookSource`, `severityMapping`) belong in `packages/core` specifically so they get real Jest coverage; anything that must live in `packages/extension` (the two runtimes, protocol, client, UI) gets `type-check`/`build` verification only, same as Milestone 3's convention.
- Do not touch `packages/extension/src/utils/KaggleDomParser.ts`, `packages/extension/src/utils/CodeMirrorManager.ts`, `packages/extension/src/page/pageExtractor.ts`, or the Milestone 2 extraction pipeline — out of scope, untouched by this plan.
- Do not touch the Milestone 3 offscreen-document/background-relay _architecture_ (single offscreen document, `ensureOffscreen()`'s in-flight lock, the disjoint-message-namespace pattern) — this plan generalizes the message _types_ it carries, not the mechanism itself.
- **No settings migration** (per spec) — do not write code to detect/migrate old `linterEngine: 'handmade'` or `rules: {...}` values.
- Ignore-codes customization is routed to each engine's own native config (flake8's `application.options.ignore`, ruff's `Workspace` `lint.ignore`) — there is deliberately no client-side ignore-filter function anywhere in this plan (see spec's self-review note on the removed `filterIgnored`).

## File Structure

| File                                                                                             | Responsibility after this plan                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/notebook/buildNotebookSource.ts` (new)                                        | Concatenates notebook cells into one source string (nbqa-style magic/shell-line blanking) + per-cell offset table. Pure TS, Jest-tested.                                                                                                                                                                                                                                                                                                                                 |
| `packages/core/src/notebook/severityMapping.ts` (new)                                            | `classifySeverity` (code-prefix heuristic) + `mapDiagnostics` (offset-mapping + severity tagging), engine-agnostic. Pure TS, Jest-tested.                                                                                                                                                                                                                                                                                                                                |
| `packages/core/src/notebook/index.ts` (new)                                                      | Re-exports the above two modules.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/core/src/engines/flake8Shim.ts`                                                        | Rewritten: `PYTHON_SHIM` now defines `lint_source(source, ignore_codes)` calling flake8's real `Application`/`StyleGuide`/`BaseFormatter` API once per call, instead of the old per-cell `ContextAwareChecker`/`_notebook_context` machinery.                                                                                                                                                                                                                            |
| `packages/core/src/engines/flake8Mapping.ts`                                                     | **Deleted** — superseded by `notebook/severityMapping.ts`.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `packages/core/src/engines/index.ts`, `packages/core/src/index.ts`                               | Updated exports across the plan: Task 1 adds `notebook/*` to `core/src/index.ts` early (its consumers need it from Task 3 on); Task 3 drops `flake8Mapping` from `engines/index.ts` (its consumer is fixed in the same task) but deliberately _keeps_ `LintEngine`'s export (its consumer, `ContentApp.tsx`, isn't migrated until Task 6); Task 9 drops both `LintEngine` (from `engines/index.ts`) and `rules` (from `core/src/index.ts`) once nothing references them. |
| `packages/core/src/rules/`                                                                       | **Deleted** — entire directory (9 rule classes, `BaseRule`, `registry.ts`, `index.ts`).                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/core/src/engines/LintEngine.ts`                                                        | **Deleted**.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/core/src/types/index.ts`                                                               | `LintRule`, `LintContext`, `LintResult`, `LintEngineConfig`, `CodeCell` removed (rule-system-specific); `LintError`, `Severity` kept.                                                                                                                                                                                                                                                                                                                                    |
| `packages/core/src/__tests__/{LintEngine,UndefinedVariablesRule,registry,flake8Mapping}.test.ts` | **Deleted** (test the deleted code).                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/core/src/__tests__/flake8Shim.test.ts`                                                 | Rewritten — old `ContextAwareChecker`-ordering test replaced with a new one asserting `application.formatter` is assigned before `make_guide()` is called (the ordering that matters in the _new_ shim).                                                                                                                                                                                                                                                                 |
| `packages/extension/src/offscreen/pyodideRuntime.ts`                                             | Rewritten: `lintNotebook(cells, ignoreCodes)` builds the notebook source once, makes one Python call, maps results via the shared `notebook/*` pipeline — no more per-cell loop.                                                                                                                                                                                                                                                                                         |
| `packages/extension/src/offscreen/ruffRuntime.ts` (new)                                          | `RuffRuntime` class: one-time WASM bootstrap in `load()`, a fresh `Workspace` constructed per `lintNotebook()` call (so a changed ignore-list takes effect immediately), same shared `notebook/*` pipeline.                                                                                                                                                                                                                                                              |
| `packages/extension/src/offscreen/index.ts`                                                      | Dispatches `ENGINE_OFFSCREEN_REQUEST` envelopes by `payload.engine` to `PyodideRuntime` or `RuffRuntime`.                                                                                                                                                                                                                                                                                                                                                                |
| `packages/extension/src/background/index.ts`                                                     | Generalized from flake8-specific message types to `ENGINE_LINT_NOTEBOOK`/`ENGINE_STATUS`, same disjoint-namespace/lock mechanism.                                                                                                                                                                                                                                                                                                                                        |
| `packages/extension/src/flake8/`                                                                 | **Renamed** to `packages/extension/src/engine/` — `protocol.ts` (generalized `ENGINE_*` types), `EngineClient.ts` (renamed/generalized from `Flake8Client.ts`).                                                                                                                                                                                                                                                                                                          |
| `packages/extension/src/content/ContentApp.tsx`                                                  | Handmade engine entirely removed; `runLinter`'s branch becomes `flake8` vs `ruff`, both via `EngineClient.lintNotebook(engine, cells, ignoreCodes)`; `flake8Status` state renamed `engineStatus`.                                                                                                                                                                                                                                                                        |
| `packages/extension/src/popup/PopupApp.tsx`                                                      | Engine radio becomes `flake8`/`ruff`; "Built-in Rules" section removed entirely; one ignore-codes text input per engine added.                                                                                                                                                                                                                                                                                                                                           |
| `packages/ui-components/src/types/index.ts`, `Overlay.tsx`                                       | `OverlayProps.flake8Status` renamed `engineStatus` (same type, new name — generalizing past a single engine).                                                                                                                                                                                                                                                                                                                                                            |
| `packages/extension/package.json`                                                                | Add `@astral-sh/ruff-wasm-web` dependency.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `packages/extension/webpack.config.js`                                                           | Add a `CopyPlugin` pattern for `ruff_wasm_bg.wasm`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CLAUDE.md`, `README.md`                                                                         | Sections describing the deleted rule system / old engine shape rewritten to match.                                                                                                                                                                                                                                                                                                                                                                                       |

---

### Task 1: Shared notebook-source builder

**Files:**

- Create: `packages/core/src/notebook/buildNotebookSource.ts`
- Test: `packages/core/src/__tests__/buildNotebookSource.test.ts`
- Modify: `packages/core/src/index.ts` (add the `notebook` export — done now, not deferred to Task 9, because Task 3's `PyodideRuntime` imports `buildNotebookSource`/`mapDiagnostics` via the package root `@kaggle-lint/core`, the same way it already imports `PYTHON_SHIM` — deferring this export would leave that import unresolvable from Task 3 through Task 8)

**Interfaces:**

- Produces (consumed by Task 2, Task 4, Task 5):

```ts
export interface NotebookCellInput {
  code: string;
  cellIndex: number;
}
export interface CellOffset {
  cellIndex: number;
  startLine: number;
  lineCount: number;
}
export interface NotebookSource {
  source: string;
  cellOffsets: CellOffset[];
}
export function buildNotebookSource(cells: NotebookCellInput[]): NotebookSource;
export function mapLineToCell(
  globalLine: number,
  cellOffsets: CellOffset[]
): { cellIndex: number; cellLine: number } | null;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/__tests__/buildNotebookSource.test.ts`:

```ts
import {
  buildNotebookSource,
  mapLineToCell,
} from '../notebook/buildNotebookSource';

describe('buildNotebookSource', () => {
  it('concatenates cells in cellIndex order with correct line offsets', () => {
    const { source, cellOffsets } = buildNotebookSource([
      { code: 'import os\nx = 1', cellIndex: 0 },
      { code: 'y = x + 1', cellIndex: 1 },
    ]);

    expect(source).toBe('import os\nx = 1\ny = x + 1');
    expect(cellOffsets).toEqual([
      { cellIndex: 0, startLine: 1, lineCount: 2 },
      { cellIndex: 1, startLine: 3, lineCount: 1 },
    ]);
  });

  it('sorts cells by cellIndex regardless of input order', () => {
    const { source } = buildNotebookSource([
      { code: 'second', cellIndex: 1 },
      { code: 'first', cellIndex: 0 },
    ]);
    expect(source).toBe('first\nsecond');
  });

  it('blanks an individual line-magic line but keeps linting the rest of the cell', () => {
    const { source } = buildNotebookSource([
      {
        code: "%matplotlib inline\nimport pandas as pd\ndf = pd.read_csv('x.csv')",
        cellIndex: 0,
      },
    ]);
    expect(source).toBe("\nimport pandas as pd\ndf = pd.read_csv('x.csv')");
  });

  it('blanks an individual shell-escape line but keeps linting the rest of the cell', () => {
    const { source } = buildNotebookSource([
      { code: '!pip install foo\nimport foo', cellIndex: 0 },
    ]);
    expect(source).toBe('\nimport foo');
  });

  it('blanks an entire cell whose first non-blank line is a cell magic (%%)', () => {
    const { source, cellOffsets } = buildNotebookSource([
      { code: '%%bash\necho hello\npip install foo', cellIndex: 0 },
      { code: 'x = 1', cellIndex: 1 },
    ]);
    expect(source).toBe('\n\n\nx = 1');
    expect(cellOffsets).toEqual([
      { cellIndex: 0, startLine: 1, lineCount: 3 },
      { cellIndex: 1, startLine: 4, lineCount: 1 },
    ]);
  });

  it('treats a cell magic on the first non-blank line as a cell magic even with a leading blank line', () => {
    const { source } = buildNotebookSource([
      { code: '\n%%bash\nls', cellIndex: 0 },
    ]);
    expect(source).toBe('\n\n\n');
  });

  it('leaves ordinary code untouched', () => {
    const { source } = buildNotebookSource([
      { code: 'def f(x):\n    return x + 1', cellIndex: 0 },
    ]);
    expect(source).toBe('def f(x):\n    return x + 1');
  });
});

describe('mapLineToCell', () => {
  const cellOffsets = [
    { cellIndex: 0, startLine: 1, lineCount: 2 },
    { cellIndex: 1, startLine: 3, lineCount: 1 },
  ];

  it('maps a global line back to the correct cell and cell-relative line', () => {
    expect(mapLineToCell(1, cellOffsets)).toEqual({
      cellIndex: 0,
      cellLine: 1,
    });
    expect(mapLineToCell(2, cellOffsets)).toEqual({
      cellIndex: 0,
      cellLine: 2,
    });
    expect(mapLineToCell(3, cellOffsets)).toEqual({
      cellIndex: 1,
      cellLine: 1,
    });
  });

  it('returns null for a line outside any cell range', () => {
    expect(mapLineToCell(0, cellOffsets)).toBeNull();
    expect(mapLineToCell(4, cellOffsets)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx jest buildNotebookSource -v`
Expected: FAIL with `Cannot find module '../notebook/buildNotebookSource'`.

- [ ] **Step 3: Implement**

Create `packages/core/src/notebook/buildNotebookSource.ts`:

```ts
/**
 * Concatenates a notebook's cells into one Python source string suitable
 * for a single whole-notebook lint pass (the "nbqa technique" this
 * project adopts instead of per-cell linting + hand-rolled cross-cell
 * context tracking). Magic commands and shell escapes are blanked in
 * place (preserving line counts, so offsets stay simple) rather than
 * causing a syntax error or losing lint coverage for the rest of the cell.
 */

export interface NotebookCellInput {
  code: string;
  cellIndex: number;
}

export interface CellOffset {
  cellIndex: number;
  /** 1-based line number in the concatenated source where this cell begins. */
  startLine: number;
  lineCount: number;
}

export interface NotebookSource {
  source: string;
  cellOffsets: CellOffset[];
}

function blankCellLines(lines: string[]): string[] {
  const firstNonBlank = lines.find((line) => line.trim().length > 0);
  const isCellMagic =
    firstNonBlank !== undefined && firstNonBlank.trimStart().startsWith('%%');

  if (isCellMagic) {
    // A cell magic (%%bash, %%html, %%writefile, ...) changes the whole
    // cell's language away from Python — blank every line, but keep the
    // same line count so later cells' offsets stay correct.
    return lines.map(() => '');
  }

  return lines.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('%') || trimmed.startsWith('!')) {
      // A line magic (%matplotlib inline) or shell escape (!pip install x)
      // — blank only this line, the rest of the cell still lints.
      return '';
    }
    return line;
  });
}

export function buildNotebookSource(
  cells: NotebookCellInput[]
): NotebookSource {
  const sorted = [...cells].sort((a, b) => a.cellIndex - b.cellIndex);
  const allLines: string[] = [];
  const cellOffsets: CellOffset[] = [];
  let currentLine = 1;

  for (const cell of sorted) {
    const lines = cell.code.split('\n');
    cellOffsets.push({
      cellIndex: cell.cellIndex,
      startLine: currentLine,
      lineCount: lines.length,
    });
    allLines.push(...blankCellLines(lines));
    currentLine += lines.length;
  }

  return { source: allLines.join('\n'), cellOffsets };
}

export function mapLineToCell(
  globalLine: number,
  cellOffsets: CellOffset[]
): { cellIndex: number; cellLine: number } | null {
  for (const offset of cellOffsets) {
    if (
      globalLine >= offset.startLine &&
      globalLine < offset.startLine + offset.lineCount
    ) {
      return {
        cellIndex: offset.cellIndex,
        cellLine: globalLine - offset.startLine + 1,
      };
    }
  }
  return null;
}
```

Create `packages/core/src/notebook/index.ts`:

```ts
export * from './buildNotebookSource';
```

Update `packages/core/src/index.ts` (currently `export * from './types'; export * from './rules'; export * from './engines';`) to add the new export — insert a line between the `types` and `rules` exports:

```ts
/**
 * Kaggle Lint Core Package
 * Main entry point for core linting functionality
 */

// Export types
export * from './types';

// Export the notebook-source builder + severity/diagnostic mapping
// (shared by both the flake8 and ruff engines)
export * from './notebook';

// Export rules
export * from './rules';

// Export engines
export * from './engines';
```

(The `rules` export is still present here — Task 9 removes it once the rule system itself is deleted. This task only adds the new `notebook` line.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx jest buildNotebookSource -v`
Expected: PASS, all 9 cases.

- [ ] **Step 5: Verify**

```bash
npm run type-check && npm run build && npm test
```

Expected: all green (this task only adds new, currently-unconsumed files — nothing else changes yet).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notebook packages/core/src/__tests__/buildNotebookSource.test.ts packages/core/src/index.ts
git commit -m "feat(core): shared notebook-source builder with magic/shell-line blanking"
```

---

### Task 2: Shared severity/diagnostic mapping

**Files:**

- Create: `packages/core/src/notebook/severityMapping.ts`
- Test: `packages/core/src/__tests__/severityMapping.test.ts`
- Modify: `packages/core/src/notebook/index.ts` (add re-export)

**Interfaces:**

- Consumes: `CellOffset`, `mapLineToCell` from `./buildNotebookSource` (Task 1).
- Produces (consumed by Task 3's tests, Task 4, Task 5):

```ts
export interface RawDiagnostic {
  line: number;
  column: number;
  code: string;
  message: string;
}
export function classifySeverity(code: string): Severity;
export function mapDiagnostics(
  diagnostics: RawDiagnostic[],
  cellOffsets: CellOffset[],
  engineName: string
): Array<LintError & { cellIndex: number; cellLine: number }>;
```

**Note on the `engineName` parameter:** the spec's sketch of `mapDiagnostics` omitted this, but the old `mapFlake8Results` it supersedes hardcoded `rule: 'flake8'` — since this function is now shared between two engines, `rule` needs to say _which_ engine produced the diagnostic rather than being hardcoded. This is a mechanical consequence of sharing the function, not a design change.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/__tests__/severityMapping.test.ts`:

```ts
import { classifySeverity, mapDiagnostics } from '../notebook/severityMapping';
import type { CellOffset } from '../notebook/buildNotebookSource';

describe('classifySeverity', () => {
  it('classifies F-prefixed (pyflakes-family) codes as error', () => {
    expect(classifySeverity('F821')).toBe('error');
    expect(classifySeverity('F401')).toBe('error');
  });

  it('classifies everything else as warning', () => {
    expect(classifySeverity('E501')).toBe('warning');
    expect(classifySeverity('W605')).toBe('warning');
    expect(classifySeverity('C901')).toBe('warning');
    expect(classifySeverity('RUF100')).toBe('warning');
    expect(classifySeverity('B006')).toBe('warning');
  });
});

describe('mapDiagnostics', () => {
  const cellOffsets: CellOffset[] = [
    { cellIndex: 0, startLine: 1, lineCount: 2 },
    { cellIndex: 1, startLine: 3, lineCount: 1 },
  ];

  it('maps global line numbers back to cellIndex/cellLine and tags severity + rule', () => {
    const result = mapDiagnostics(
      [{ line: 3, column: 5, code: 'F821', message: "undefined name 'y'" }],
      cellOffsets,
      'flake8'
    );

    expect(result).toEqual([
      {
        line: 3,
        column: 5,
        msg: "undefined name 'y'",
        severity: 'error',
        rule: 'flake8',
        code: 'F821',
        cellIndex: 1,
        cellLine: 1,
      },
    ]);
  });

  it('tags rule with whatever engineName is passed, so the same function works for ruff too', () => {
    const result = mapDiagnostics(
      [
        {
          line: 1,
          column: 8,
          code: 'F401',
          message: "'os' imported but unused",
        },
      ],
      cellOffsets,
      'ruff'
    );
    expect(result[0].rule).toBe('ruff');
    expect(result[0].severity).toBe('error');
  });

  it('drops a diagnostic whose line falls outside every known cell range', () => {
    const result = mapDiagnostics(
      [{ line: 99, column: 0, code: 'E501', message: 'line too long' }],
      cellOffsets,
      'flake8'
    );
    expect(result).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(mapDiagnostics([], cellOffsets, 'flake8')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx jest severityMapping -v`
Expected: FAIL with `Cannot find module '../notebook/severityMapping'`.

- [ ] **Step 3: Implement**

Create `packages/core/src/notebook/severityMapping.ts`:

```ts
/**
 * Shared post-processing for both engines' raw diagnostics: maps a global
 * line number back to (cellIndex, cellLine) and classifies a severity,
 * since neither flake8's nor ruff's real API exposes error/warning
 * severity natively (both only expose rule codes). Ignore-code filtering
 * is NOT done here — that's routed to each engine's own native config
 * (flake8's `ignore=`, ruff's `Workspace` `lint.ignore`), so by the time
 * diagnostics reach this function, the engine has already decided to
 * report them.
 */

import type { LintError } from '../types';
import { mapLineToCell, type CellOffset } from './buildNotebookSource';

export interface RawDiagnostic {
  line: number;
  column: number;
  code: string;
  message: string;
}

export function classifySeverity(code: string): LintError['severity'] {
  return code.startsWith('F') ? 'error' : 'warning';
}

export function mapDiagnostics(
  diagnostics: RawDiagnostic[],
  cellOffsets: CellOffset[],
  engineName: string
): Array<LintError & { cellIndex: number; cellLine: number }> {
  const results: Array<LintError & { cellIndex: number; cellLine: number }> =
    [];

  for (const diagnostic of diagnostics) {
    const mapped = mapLineToCell(diagnostic.line, cellOffsets);
    if (mapped === null) {
      continue;
    }
    results.push({
      line: diagnostic.line,
      column: diagnostic.column,
      msg: diagnostic.message,
      severity: classifySeverity(diagnostic.code),
      rule: engineName,
      code: diagnostic.code,
      cellIndex: mapped.cellIndex,
      cellLine: mapped.cellLine,
    });
  }

  return results;
}
```

Update `packages/core/src/notebook/index.ts`:

```ts
export * from './buildNotebookSource';
export * from './severityMapping';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx jest severityMapping -v`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Verify**

```bash
npm run type-check && npm run build && npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notebook packages/core/src/__tests__/severityMapping.test.ts
git commit -m "feat(core): shared severity classification + diagnostic mapping"
```

---

### Task 3: Rewrite the flake8 engine — shim + PyodideRuntime (whole-notebook single-pass)

**Files:**

- Modify: `packages/core/src/engines/flake8Shim.ts` (rewrite `PYTHON_SHIM` entirely)
- Delete: `packages/core/src/engines/flake8Mapping.ts`
- Delete: `packages/core/src/__tests__/flake8Mapping.test.ts`
- Modify: `packages/core/src/__tests__/flake8Shim.test.ts` (replace the old `ContextAwareChecker`-ordering test)
- Modify: `packages/core/src/engines/index.ts` (drop `flake8Mapping` export)
- Modify: `packages/extension/src/offscreen/pyodideRuntime.ts` (rewrite `lintNotebook` to the single-pass model)

**Interfaces:**

- Consumes: `buildNotebookSource`, `mapDiagnostics`, `RawDiagnostic`, `NotebookCellInput` (Tasks 1–2, from `@kaggle-lint/core`).
- Produces (consumed by Task 6's protocol generalization, which changes `PyodideRuntime.lintNotebook`'s parameter/return types to the generalized `EngineResultError` — until then this task keeps the existing `Flake8CellInput`/`Flake8ResultError` names from `../flake8/protocol`, which still exist untouched at this point in the plan): `PyodideRuntime.lintNotebook(cells, ignoreCodes: string[])` — note the new second parameter; `load()` is unchanged.

**Why shim and runtime move together:** the old `packages/core/src/engines/flake8Mapping.ts` (`mapFlake8Results`) is deleted in this task, but `pyodideRuntime.ts` currently imports it (`import { PYTHON_SHIM, mapFlake8Results, type RawFlake8Error } from '@kaggle-lint/core';`) — deleting it without updating the consumer in the same task would leave the root build broken with no fix until a later task, unlike every other task in this plan. Doing both together (matching the shim's new `lint_source(source, ignore_codes)` signature to what the rewritten runtime calls) keeps the root build green throughout, per this plan's Global Constraints.

**Verified root cause the shim rewrite depends on (already established via direct repro against the real flake8 6.1.0 wheel — see this plan's header):** `flake8.api.legacy.get_style_guide()`'s convenience wrapper cannot capture structured per-violation data — reassigning `application.formatter` after calling it has no effect, because `get_style_guide()` already wired the checking machinery to the _original_ formatter inside `make_file_checker_manager()`. The working pattern constructs `Application()` directly and assigns a custom formatter **before** calling `make_guide()`/`make_file_checker_manager()`.

- [ ] **Step 1: Replace `PYTHON_SHIM`**

Replace the entire contents of `packages/core/src/engines/flake8Shim.ts`:

```ts
/**
 * Python shim run once inside the Pyodide runtime: calls flake8's real
 * Application/StyleGuide API against one whole-notebook source string
 * (built by packages/core/src/notebook/buildNotebookSource.ts) instead of
 * per-cell pyflakes calls with hand-rolled cross-cell context tracking —
 * a single real Python "file" gives correct cross-cell scoping natively.
 *
 * flake8.api.legacy.get_style_guide()'s convenience wrapper cannot
 * capture structured violations (confirmed by direct repro: reassigning
 * application.formatter after calling it has no effect, since
 * make_file_checker_manager() already wired the checking machinery to
 * the original formatter). This shim instead constructs Application()
 * directly and assigns a custom formatter BEFORE make_guide()/
 * make_file_checker_manager() run — the order matters.
 */

export const PYTHON_SHIM = `
from flake8.main.application import Application
from flake8.api.legacy import parse_args, StyleGuide
from flake8.formatting.base import BaseFormatter


class CollectingFormatter(BaseFormatter):
    """Collects structured violations instead of printing them."""

    def after_init(self):
        self.collected = []

    def handle(self, error):
        self.collected.append({
            'line': error.line_number,
            'column': error.column_number,
            'code': error.code,
            'message': error.text,
        })

    def format(self, error):
        return None


def lint_source(source, ignore_codes):
    """
    Lint one whole-notebook source string with flake8's real API.
    ignore_codes is routed straight into flake8's own ignore config —
    codes it covers are never reported at all, not filtered afterward.
    """
    with open('/notebook_source.py', 'w') as f:
        f.write(source)

    application = Application()
    application.plugins, application.options = parse_args([])
    application.options.ignore = ignore_codes
    application.formatter = CollectingFormatter(application.options)
    application.make_guide()
    application.make_file_checker_manager([])
    guide = StyleGuide(application)
    guide.check_files(['/notebook_source.py'])
    return application.formatter.collected
`;
```

- [ ] **Step 2: Delete the superseded mapping module and its test**

```bash
rm packages/core/src/engines/flake8Mapping.ts
rm packages/core/src/__tests__/flake8Mapping.test.ts
```

- [ ] **Step 3: Update `engines/index.ts`**

Only drop the `flake8Mapping` export (superseded by `notebook/severityMapping.ts`, and this task deletes the file). **Keep the `LintEngine` export for now** — `ContentApp.tsx` still imports `LintEngine` from `@kaggle-lint/core` at this point in the plan (Task 6 removes that import); dropping the export here too would break the root build for three tasks (3, 4, 5) instead of the one task-pair (5→6) already accounted for in this plan's Global Constraints. Task 9 drops the `LintEngine` export in the same step that deletes `LintEngine.ts` itself.

```ts
/**
 * Engines Index
 * Exports all linting engines. flake8Mapping is superseded by
 * notebook/severityMapping (see Task 2/3). LintEngine (handmade) is
 * dropped in Task 9, once ContentApp.tsx no longer imports it.
 */

export * from './LintEngine';
export * from './flake8Shim';
```

- [ ] **Step 4: Replace the flake8 shim's regression test**

Replace the entire contents of `packages/core/src/__tests__/flake8Shim.test.ts` (the old test asserted `ContextAwareChecker.__init__`'s line ordering — that class no longer exists in the rewritten shim; this new test asserts the ordering that actually matters now):

```ts
import { PYTHON_SHIM } from '../engines/flake8Shim';

describe('PYTHON_SHIM lint_source formatter wiring', () => {
  it('assigns application.formatter before calling make_guide(), so the collecting formatter actually receives live violations', () => {
    // flake8.api.legacy.get_style_guide()'s convenience wrapper cannot
    // capture structured results this way — confirmed by direct repro,
    // see this plan's header. Regression test for that ordering
    // requirement: reassigning application.formatter AFTER make_guide()/
    // make_file_checker_manager() silently produces empty results.
    const formatterAssignIdx = PYTHON_SHIM.indexOf(
      'application.formatter = CollectingFormatter'
    );
    const makeGuideIdx = PYTHON_SHIM.indexOf('application.make_guide()');

    expect(formatterAssignIdx).toBeGreaterThan(-1);
    expect(makeGuideIdx).toBeGreaterThan(-1);
    expect(formatterAssignIdx).toBeLessThan(makeGuideIdx);
  });

  it('suppresses printing by returning None from format()', () => {
    expect(PYTHON_SHIM).toMatch(
      /def format\(self, error\):\s*\n\s*return None/
    );
  });

  it("routes ignore_codes into flake8's own native config, not a client-side filter", () => {
    expect(PYTHON_SHIM).toContain('application.options.ignore = ignore_codes');
  });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/core && npx jest flake8Shim -v`
Expected: PASS, all 3 cases (this is a string-inspection test, not a Python-execution test — it passes as soon as `PYTHON_SHIM`'s text matches; the actual Python correctness was already verified by direct repro against the real flake8 wheel, documented in this plan's header, since this repo has no Python execution in Jest/CI).

- [ ] **Step 6: Rewrite `PyodideRuntime.lintNotebook`**

Replace the entire contents of `packages/extension/src/offscreen/pyodideRuntime.ts`:

```ts
/**
 * Loads Pyodide + calls the flake8 Python shim inside the offscreen
 * document (an extension page — WASM and 'wasm-unsafe-eval' are allowed
 * here, unlike in the content script's isolated world; see F1 in
 * docs/review-findings.md). Single instance, created once in
 * offscreen/index.ts.
 *
 * lintNotebook builds one whole-notebook source string (via
 * buildNotebookSource) and makes ONE Python call per lint — no more
 * per-cell loop or cross-cell context tracking; a single real Python
 * "file" gives correct cross-cell scoping natively.
 */

import {
  PYTHON_SHIM,
  buildNotebookSource,
  mapDiagnostics,
  type RawDiagnostic,
} from '@kaggle-lint/core';
import type {
  Flake8CellInput,
  Flake8ResultError,
  Flake8Status,
} from '../flake8/protocol';

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
  }
}

interface PyodideInterface {
  loadPackage(name: string): Promise<void>;
  runPythonAsync(code: string): Promise<string>;
}

const PYODIDE_INDEX_URL = chrome.runtime.getURL('pyodide/');

// Bundled flake8/pyflakes/pycodestyle/mccabe wheels (see scripts/fetch-wheels.md
// for provenance/hashes). Installed from these local chrome.runtime.getURL()
// paths only — never from PyPI at runtime (F9).
const WHEEL_FILENAMES = [
  'mccabe-0.7.0-py2.py3-none-any.whl',
  'pycodestyle-2.11.1-py2.py3-none-any.whl',
  'pyflakes-3.1.0-py2.py3-none-any.whl',
  'flake8-6.1.0-py2.py3-none-any.whl',
];

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
        this.pyodide = await window.loadPyodide!({
          indexURL: PYODIDE_INDEX_URL,
        });
        await this.pyodide!.loadPackage('micropip');

        const wheelUrls = WHEEL_FILENAMES.map((name) =>
          chrome.runtime.getURL(`pyodide/wheels/${name}`)
        );
        await this.pyodide!.runPythonAsync(
          `import micropip\nawait micropip.install(${JSON.stringify(wheelUrls)}, deps=False)`
        );

        await this.pyodide!.runPythonAsync(PYTHON_SHIM);
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

  async lintNotebook(
    cells: Flake8CellInput[],
    ignoreCodes: string[]
  ): Promise<Flake8ResultError[]> {
    await this.load();

    const { source, cellOffsets } = buildNotebookSource(cells);

    const raw = await this.pyodide!.runPythonAsync(`
import json
json.dumps(lint_source(${JSON.stringify(source)}, ${JSON.stringify(ignoreCodes)}))
    `);
    const rawResults = JSON.parse(raw) as RawDiagnostic[];

    return mapDiagnostics(rawResults, cellOffsets, 'flake8');
  }
}
```

Note: constructing `Application()` fresh on every `lint_source` call (rather than caching flake8's plugin discovery across calls) is a deliberate choice — it's the exact pattern already verified working by direct repro, and re-discovering flake8's 3 built-in checker plugins (pyflakes, pycodestyle, mccabe — no third-party plugins installed) via `parse_args([])` per call is cheap. Don't "optimize" this into a cached `Application` without a concrete, measured reason — that would deviate from the verified-correct pattern for unverified speculative gain.

- [ ] **Step 7: Verify**

```bash
npm run type-check && npm run build && npm test
grep -rn "ContextAwareChecker\|_notebook_context\|mapFlake8Results" packages/core/src packages/extension/src
```

Expected: type-check/build/test all green (root build stays green throughout this task, per Global Constraints); the `grep` returns no matches anywhere — the old context-tracking machinery and the superseded mapper are fully gone from both packages, since this task updated the shim and its only consumer together.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/engines packages/core/src/__tests__ packages/extension/src/offscreen/pyodideRuntime.ts
git commit -m "refactor: rewrite flake8 engine to use real flake8 API on one whole-notebook source"
```

---

### Task 4: Add the ruff engine (bundled WASM, new offscreen runtime)

**Files:**

- Modify: `packages/extension/package.json` (add dependency)
- Modify: `packages/extension/webpack.config.js` (add `CopyPlugin` pattern)
- Create: `packages/extension/src/offscreen/ruffRuntime.ts`

**Interfaces:**

- Consumes: `NotebookCellInput`, `buildNotebookSource`, `mapDiagnostics` (from `@kaggle-lint/core`, Tasks 1–2).
- Produces (consumed by Task 6's offscreen dispatch): `class RuffRuntime { status: Flake8Status; load(): Promise<void>; lintNotebook(cells, ignoreCodes: string[]): Promise<Flake8ResultError[]>; }` — deliberately the same shape as `PyodideRuntime` (using the same `Flake8Status`/`Flake8ResultError` type names from `../flake8/protocol` for now — Task 6 renames these to the generalized `EngineStatus`/`EngineResultError`, at which point both runtimes' signatures update together).

**Package version:** `@astral-sh/ruff-wasm-web@0.15.21` — confirmed the current published version on npm as of this plan (registry metadata fetched directly). The package's own README warns "This API is experimental and may change at any time," so this plan pins the exact verified version (`0.15.21`, not `^0.15.21`) rather than a caret range, to avoid an unreviewed API change silently landing on the next `npm install`.

**Verified via direct execution (Node 22, not guessed — see this plan's header):** `Workspace.check(source)` returns diagnostics with **1-indexed** `start_location.row`/`start_location.column` — identical convention to flake8's `line_number`/`column_number`, confirmed against `'import os\n\nx = y + 1\n'` (F821 on line 3 reported `row: 3`; F401's `os` at column 8 in `import os` reported `column: 8`). No off-by-one adjustment needed when normalizing into `RawDiagnostic`.

- [ ] **Step 1: Add the dependency**

In `packages/extension/package.json`, add to `"dependencies"` (currently `@kaggle-lint/core`, `@kaggle-lint/ui-components`, `react`, `react-dom`):

```json
    "@astral-sh/ruff-wasm-web": "0.15.21",
```

Run `npm install` from repo root afterward so the lockfile and `node_modules` pick it up.

- [ ] **Step 2: Bundle the wasm asset**

In `packages/extension/webpack.config.js`, add `path` usage for resolving the package's install location robustly (works regardless of npm workspace hoisting — this monorepo's other dependencies have been observed to sometimes hoist to the root `node_modules/` and sometimes nest under `packages/extension/node_modules/` depending on version conflicts elsewhere, so don't hardcode a relative `../../node_modules/...` guess):

At the top of the file (near the existing `const path = require('path');`):

```js
const ruffWasmDir = path.dirname(
  require.resolve('@astral-sh/ruff-wasm-web/package.json')
);
```

Add a new `CopyPlugin` pattern (alongside the existing `pyodide/` one):

```js
        {
          from: path.join(ruffWasmDir, 'ruff_wasm_bg.wasm'),
          to: 'ruff/ruff_wasm_bg.wasm',
        },
```

- [ ] **Step 3: Implement `RuffRuntime`**

Create `packages/extension/src/offscreen/ruffRuntime.ts`:

```ts
/**
 * Loads ruff's WASM build (@astral-sh/ruff-wasm-web) inside the offscreen
 * document — same reason PyodideRuntime lives here (F1: content scripts
 * inherit the host page's CSP for WASM instantiation, and Kaggle's CSP
 * doesn't grant 'wasm-unsafe-eval'), even though ruff needs no Python
 * runtime at all. Much lighter than Pyodide: one ~10.8 MB .wasm asset,
 * no wheels, no Python stdlib.
 */

import {
  initSync,
  Workspace,
  PositionEncoding,
  type Diagnostic,
} from '@astral-sh/ruff-wasm-web';
import {
  buildNotebookSource,
  mapDiagnostics,
  type NotebookCellInput,
} from '@kaggle-lint/core';
import type { Flake8ResultError, Flake8Status } from '../flake8/protocol';

const RUFF_WASM_URL = chrome.runtime.getURL('ruff/ruff_wasm_bg.wasm');

export class RuffRuntime {
  status: Flake8Status = 'unloaded';
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
        const response = await fetch(RUFF_WASM_URL);
        const buffer = await response.arrayBuffer();
        initSync({ module: buffer });
        this.status = 'ready';
      } catch (error) {
        this.status = 'failed';
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  async lintNotebook(
    cells: NotebookCellInput[],
    ignoreCodes: string[]
  ): Promise<Flake8ResultError[]> {
    await this.load();

    // Workspace's settings (including lint.ignore) are fixed at
    // construction time, with no way to update them on an existing
    // instance — construct a fresh one per call (cheap; the expensive
    // part, WASM instantiation, already happened in load()) so a changed
    // ignoreCodes setting takes effect immediately, matching the flake8
    // shim's fresh-Application-per-call pattern.
    const workspace = new Workspace(
      {
        'line-length': 88,
        lint: { select: ['E4', 'E7', 'E9', 'F'], ignore: ignoreCodes },
      },
      PositionEncoding.Utf16
    );

    const { source, cellOffsets } = buildNotebookSource(cells);
    const raw: Diagnostic[] = workspace.check(source);
    workspace.free(); // wasm-bindgen classes need explicit disposal — WASM-side memory isn't GC'd by JS

    const normalized = raw.map((d) => ({
      line: d.start_location.row,
      column: d.start_location.column,
      code: d.code ?? '',
      message: d.message,
    }));

    return mapDiagnostics(normalized, cellOffsets, 'ruff');
  }
}
```

- [ ] **Step 4: Verify**

```bash
npm run type-check && npm run build
ls packages/extension/dist/ruff/ruff_wasm_bg.wasm
```

Expected: type-check and build both pass; the wasm asset is present in `dist/`. If webpack fails to parse `ruff_wasm.js` (the package's `main` entry, an ES module using `import.meta.url` for its own default-path fallback that this code doesn't exercise, since `RuffRuntime` always calls `initSync` with an explicit fetched buffer) — webpack 5 supports `import.meta.url` in ESM natively, so this is not expected to need extra config, but if it does fail, do not route around it silently: read the actual webpack error and report it rather than guessing a fix.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/package.json package-lock.json packages/extension/webpack.config.js packages/extension/src/offscreen/ruffRuntime.ts
git commit -m "feat(extension): add ruff engine via @astral-sh/ruff-wasm-web"
```

---

### Task 5: Generalize the protocol + background/offscreen dispatch

**Files:**

- Create: `packages/extension/src/engine/protocol.ts` (moved/generalized from `packages/extension/src/flake8/protocol.ts`)
- Delete: `packages/extension/src/flake8/protocol.ts`
- Modify: `packages/extension/src/background/index.ts`
- Modify: `packages/extension/src/offscreen/index.ts`
- Modify: `packages/extension/src/offscreen/pyodideRuntime.ts` (swap `../flake8/protocol` import for `../engine/protocol`, `Flake8ResultError`/`Flake8Status` → `EngineResultError`/`EngineStatus`)
- Modify: `packages/extension/src/offscreen/ruffRuntime.ts` (same import swap)

**Interfaces:**

- Consumes: `NotebookCellInput` (from `@kaggle-lint/core`, Task 1), `PyodideRuntime` (Task 3), `RuffRuntime` (Task 4).
- Produces (consumed by Task 6): the generalized protocol types below, plus both runtimes now keyed by `EngineName` in `offscreen/index.ts`.

- [ ] **Step 1: Create the generalized protocol module**

Create `packages/extension/src/engine/protocol.ts`:

```ts
/**
 * Message protocol shared between the content script (isolated world),
 * the background service worker, and the offscreen document running the
 * flake8/ruff engines. All three contexts import from this single
 * module. Generalized from the flake8-only protocol Milestone 3 built —
 * same disjoint-namespace envelope design (see background/index.ts),
 * now parameterized by which engine a request/response is for.
 */

import type { LintError, NotebookCellInput } from '@kaggle-lint/core';

export type EngineName = 'flake8' | 'ruff';

export const ENGINE_LINT_NOTEBOOK = 'ENGINE_LINT_NOTEBOOK' as const;
export const ENGINE_STATUS = 'ENGINE_STATUS' as const;

export interface EngineLintRequest {
  type: typeof ENGINE_LINT_NOTEBOOK;
  engine: EngineName;
  cells: NotebookCellInput[];
  ignoreCodes: string[];
}

export type EngineResultError = LintError & {
  cellIndex: number;
  cellLine: number;
};

export type EngineLintResponse =
  { ok: true; errors: EngineResultError[] } | { ok: false; error: string };

export interface EngineStatusRequest {
  type: typeof ENGINE_STATUS;
  engine: EngineName;
}

export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'failed';

export interface EngineStatusResponse {
  status: EngineStatus;
}

export const ENGINE_OFFSCREEN_REQUEST = 'ENGINE_OFFSCREEN_REQUEST' as const;

export interface EngineOffscreenRequest {
  type: typeof ENGINE_OFFSCREEN_REQUEST;
  payload: EngineLintRequest | EngineStatusRequest;
}
```

Delete the old protocol file: `rm packages/extension/src/flake8/protocol.ts` (note: `packages/extension/src/flake8/Flake8Client.ts` still imports from it — Task 7 handles that file; this task leaves it importing from a now-deleted path, which is fine since Task 6/7 land immediately after with no gap requiring a green build in between — see Task 7's own note on this).

- [ ] **Step 2: Generalize the background worker**

Replace the entire contents of `packages/extension/src/background/index.ts`:

```ts
/**
 * Background service worker. Pyodide/WASM cannot run in the content
 * script (isolated-world content scripts inherit the page's CSP, which
 * Kaggle does not grant 'wasm-unsafe-eval' for — F1). This worker's only
 * job is bridging chrome.runtime messages from the content script to the
 * offscreen document, which is an extension page and gets this
 * extension's own CSP instead (see manifest.json's content_security_policy).
 * Generalized from flake8-only (Milestone 3) to any engine.
 */

import {
  ENGINE_LINT_NOTEBOOK,
  ENGINE_OFFSCREEN_REQUEST,
  ENGINE_STATUS,
} from '../engine/protocol';

const ENGINE_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  ENGINE_LINT_NOTEBOOK,
  ENGINE_STATUS,
]);

const OFFSCREEN_URL = 'offscreen.html';

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run Pyodide/Flake8/Ruff linters in WASM',
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    typeof message?.type !== 'string' ||
    !ENGINE_MESSAGE_TYPES.has(message.type)
  ) {
    return false;
  }

  // Only forward messages that came from a content script running in a
  // tab. This is defense in depth, not the sole guard against re-forward
  // loops: the wrapped message sent below has type ENGINE_OFFSCREEN_REQUEST,
  // which is disjoint from ENGINE_MESSAGE_TYPES, so this listener's own
  // type check (above) already ignores it when chrome.runtime.sendMessage's
  // broadcast reaches this same listener again. It also has no sender.tab
  // (it originates from this service worker, an extension page, not a tab),
  // so the check below would reject it a second time regardless.
  if (!sender.tab) {
    return false;
  }

  ensureOffscreen()
    .then(() =>
      chrome.runtime.sendMessage({
        type: ENGINE_OFFSCREEN_REQUEST,
        payload: message,
      })
    )
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
```

- [ ] **Step 3: Dispatch by engine in the offscreen document**

Replace the entire contents of `packages/extension/src/offscreen/index.ts`:

```ts
/**
 * Offscreen document entry point. Hosts one PyodideRuntime (flake8) and
 * one RuffRuntime (ruff) instance. Only acts on ENGINE_OFFSCREEN_REQUEST
 * envelopes forwarded by the background service worker (see protocol.ts)
 * — the raw client-facing ENGINE_LINT_NOTEBOOK/ENGINE_STATUS broadcast
 * also reaches this listener directly (chrome.runtime.sendMessage has no
 * single-recipient targeting), but the type check below makes that a
 * no-op, so each logical request is only ever answered once.
 */

import {
  ENGINE_OFFSCREEN_REQUEST,
  ENGINE_LINT_NOTEBOOK,
  ENGINE_STATUS,
  type EngineLintRequest,
  type EngineLintResponse,
  type EngineStatusResponse,
} from '../engine/protocol';
import { PyodideRuntime } from './pyodideRuntime';
import { RuffRuntime } from './ruffRuntime';

const runtimes = {
  flake8: new PyodideRuntime(),
  ruff: new RuffRuntime(),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== ENGINE_OFFSCREEN_REQUEST) {
    return false;
  }
  const payload = message.payload;

  if (payload?.type === ENGINE_STATUS) {
    const runtime = runtimes[payload.engine as EngineLintRequest['engine']];
    const response: EngineStatusResponse = { status: runtime.status };
    sendResponse(response);
    return false;
  }

  if (payload?.type === ENGINE_LINT_NOTEBOOK) {
    const request = payload as EngineLintRequest;
    const runtime = runtimes[request.engine];
    runtime
      .lintNotebook(request.cells, request.ignoreCodes)
      .then((errors) => {
        const response: EngineLintResponse = { ok: true, errors };
        sendResponse(response);
      })
      .catch((error) => {
        const response: EngineLintResponse = {
          ok: false,
          error: String(error),
        };
        sendResponse(response);
      });
    return true;
  }

  return false;
});
```

- [ ] **Step 4: Update both runtimes' protocol imports**

In `packages/extension/src/offscreen/pyodideRuntime.ts`, change:

```ts
import type {
  Flake8CellInput,
  Flake8ResultError,
  Flake8Status,
} from '../flake8/protocol';
```

to:

```ts
import type { NotebookCellInput } from '@kaggle-lint/core';
import type { EngineResultError, EngineStatus } from '../engine/protocol';
```

(`buildNotebookSource`/`mapDiagnostics`/`RawDiagnostic` are already imported from `@kaggle-lint/core` per Task 3 — add `NotebookCellInput` to that same import line rather than a separate one.) Update the class body's type annotations: `status: Flake8Status` → `status: EngineStatus`; `lintNotebook(cells: Flake8CellInput[], ignoreCodes: string[]): Promise<Flake8ResultError[]>` → `lintNotebook(cells: NotebookCellInput[], ignoreCodes: string[]): Promise<EngineResultError[]>`.

In `packages/extension/src/offscreen/ruffRuntime.ts`, change:

```ts
import type { Flake8ResultError, Flake8Status } from '../flake8/protocol';
```

to:

```ts
import type { EngineResultError, EngineStatus } from '../engine/protocol';
```

Update `status: Flake8Status` → `status: EngineStatus` and the `lintNotebook` return type `Promise<Flake8ResultError[]>` → `Promise<EngineResultError[]>`.

- [ ] **Step 5: Verify**

```bash
npm run type-check
```

Expected: `packages/extension` type-check FAILS at this point — `packages/extension/src/flake8/Flake8Client.ts` still imports from the just-deleted `./protocol` (relative to `flake8/`, i.e. the deleted `flake8/protocol.ts`). This is expected and resolved by Task 6, which runs immediately next with no other work in between (matching the intent of Milestone 3's Task 4→5 pairing) — do not attempt to make this task's build green in isolation; proceed directly to Task 6.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/engine packages/extension/src/background packages/extension/src/offscreen packages/extension/src/flake8/protocol.ts
git commit -m "refactor(extension): generalize background/offscreen protocol to multiple engines"
```

---

### Task 6: Generalize the client + rewrite ContentApp (remove handmade engine)

**Files:**

- Create: `packages/extension/src/engine/EngineClient.ts` (moved/generalized from `packages/extension/src/flake8/Flake8Client.ts`)
- Delete: `packages/extension/src/flake8/Flake8Client.ts`
- Delete: `packages/extension/src/flake8/` directory (now empty)
- Modify: `packages/extension/src/content/ContentApp.tsx` (full rewrite — see below)

**Interfaces:**

- Consumes: `ENGINE_LINT_NOTEBOOK`, `ENGINE_STATUS`, `EngineName`, `EngineResultError`, `EngineLintResponse`, `EngineStatus`, `EngineStatusResponse` (Task 5's `../engine/protocol`); `NotebookCellInput` (`@kaggle-lint/core`, Task 1).
- Produces: `class EngineClient { lintNotebook(engine: EngineName, cells: NotebookCellInput[], ignoreCodes: string[]): Promise<EngineResultError[]>; getStatus(engine: EngineName): Promise<EngineStatus>; }` — same shape as the old `Flake8Client`, now parameterized by which engine to talk to. `ContentApp`'s `Settings` interface changes shape (see below) — this is consumed by Task 7 (`PopupApp.tsx` writes/reads the same shape via `chrome.storage.sync`).

- [ ] **Step 1: Implement `EngineClient`**

Create `packages/extension/src/engine/EngineClient.ts`:

```ts
/**
 * Thin chrome.runtime.sendMessage wrapper the content script uses to talk
 * to whichever engine (flake8 or ruff) is currently selected, via the
 * background service worker's relay to the offscreen document. Every
 * call here is a single awaited message round-trip, no polling.
 */

import type { NotebookCellInput } from '@kaggle-lint/core';
import {
  ENGINE_LINT_NOTEBOOK,
  ENGINE_STATUS,
  type EngineLintResponse,
  type EngineName,
  type EngineResultError,
  type EngineStatus,
  type EngineStatusResponse,
} from './protocol';

export class EngineClient {
  async lintNotebook(
    engine: EngineName,
    cells: NotebookCellInput[],
    ignoreCodes: string[]
  ): Promise<EngineResultError[]> {
    const response = (await chrome.runtime.sendMessage({
      type: ENGINE_LINT_NOTEBOOK,
      engine,
      cells,
      ignoreCodes,
    })) as EngineLintResponse;

    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.errors;
  }

  async getStatus(engine: EngineName): Promise<EngineStatus> {
    const response = (await chrome.runtime.sendMessage({
      type: ENGINE_STATUS,
      engine,
    })) as EngineStatusResponse;
    return response.status;
  }
}
```

- [ ] **Step 2: Delete the old flake8-specific client**

```bash
rm packages/extension/src/flake8/Flake8Client.ts
rmdir packages/extension/src/flake8
```

- [ ] **Step 3: Rewrite `ContentApp.tsx`**

Replace the entire contents of `packages/extension/src/content/ContentApp.tsx`:

```tsx
/**
 * ContentApp Component
 * Main React component for the content script
 * Integrates linting and UI overlay
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Overlay } from '@kaggle-lint/ui-components';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
import { EngineClient } from '../engine/EngineClient';

interface Settings {
  linterEngine: 'flake8' | 'ruff';
  flake8IgnoreCodes: string;
  ruffIgnoreCodes: string;
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'flake8',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};

export const ContentApp: React.FC = () => {
  const [errors, setErrors] = useState<any[]>([]);
  const [visible, setVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLinting, setIsLinting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [engineStatus, setEngineStatus] = useState<
    'unloaded' | 'loading' | 'ready' | 'failed'
  >('unloaded');

  const engineClientRef = React.useRef(new EngineClient()).current;
  const domParser = React.useRef(new KaggleDomParser()).current;
  const codeMirrorManager = React.useRef(new CodeMirrorManager()).current;

  const runLinterRef = React.useRef<() => Promise<void>>(async () => {});
  const isLintingRef = React.useRef(false);

  /**
   * Run the linter
   */
  const runLinter = useCallback(async () => {
    if (isLintingRef.current) {
      console.log('[Linter] Already linting, skipping...');
      return;
    }

    isLintingRef.current = true;
    setIsLinting(true);
    console.log('[Linter] Starting lint...');
    console.log('[Linter] Current settings:', settings);

    let lintStartTime = 0;

    try {
      lintStartTime = performance.now();
      // Extract cells from DOM (MAIN-world bridge, DOM-scrape fallback)
      const cells = await domParser.extractCells();
      console.log(`[Linter] Extracted ${cells.length} cells`);

      // Never clear() the store here. Both extraction paths are DOM-based:
      // the MAIN-world bridge sees full CodeMirror document text for
      // editors that ARE rendered, but — like the DOM-scrape fallback — it
      // has no visibility into cells Kaggle hasn't mounted a `.cm-editor`
      // for at all (i.e. cells scrolled out of a virtualized notebook). So
      // "bridge succeeded" never means "saw every cell," and clearing on
      // that basis would wipe exactly the virtualized-out coverage this
      // store exists to provide. We only ever merge; a cell the user
      // deletes leaves a stale store entry until the page reloads, which
      // is an accepted tradeoff (extraction can't tell "deleted" apart
      // from "not currently rendered").
      codeMirrorManager.syncCells(cells);

      // Lint from the store (survives cells Kaggle has unloaded from the
      // DOM), enriched with live element references from this extraction
      // pass so error-click-to-scroll keeps working.
      const elementByCellId = new Map(
        cells.map((cell) => [
          codeMirrorManager.getCellId(cell.cellIndex, cell.uuid ?? null),
          cell.element ?? null,
        ])
      );
      const cellsForLinting = codeMirrorManager.getAllCells().map((stored) => ({
        code: stored.code,
        cellIndex: stored.cellIndex,
        element:
          elementByCellId.get(
            codeMirrorManager.getCellId(stored.cellIndex, stored.uuid)
          ) ?? null,
      }));

      // The protocol is JSON-only (no DOM elements cross chrome.runtime
      // messaging), so strip elements before sending and re-attach them
      // to the returned errors by cellIndex — error-click-to-scroll needs
      // them.
      const ignoreCodes = (
        settings.linterEngine === 'flake8'
          ? settings.flake8IgnoreCodes
          : settings.ruffIgnoreCodes
      )
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code.length > 0);

      console.log(`[Linter] Running ${settings.linterEngine} engine...`);
      setEngineStatus('loading');

      let lintErrors;
      try {
        const elementByCellIndex = new Map(
          cellsForLinting.map((cell) => [cell.cellIndex, cell.element])
        );
        const rawErrors = await engineClientRef.lintNotebook(
          settings.linterEngine,
          cellsForLinting.map(({ code, cellIndex }) => ({ code, cellIndex })),
          ignoreCodes
        );
        lintErrors = rawErrors.map((error) => ({
          ...error,
          element: elementByCellIndex.get(error.cellIndex) ?? null,
        }));
        setEngineStatus('ready');
        console.log(
          `[Linter] ${settings.linterEngine} engine found ${lintErrors.length} errors`
        );
      } catch (error) {
        setEngineStatus('failed');
        throw error;
      }

      // Update errors state
      setErrors(lintErrors);
      console.log(
        '[Linter] Updated errors state with',
        lintErrors.length,
        'errors'
      );
    } catch (error) {
      console.error('[Linter] Error during linting:', error);
      console.warn(
        `[Linter] ${settings.linterEngine} failed, you may need to reload the page`
      );
    } finally {
      isLintingRef.current = false;
      setIsLinting(false);
      console.log(
        `[Linter] Lint completed in ${(performance.now() - lintStartTime).toFixed(0)}ms`
      );
    }
  }, [domParser, codeMirrorManager, settings, engineClientRef]);

  useEffect(() => {
    runLinterRef.current = runLinter;
  }, [runLinter]);

  /**
   * Initialize linter on mount
   */
  useEffect(() => {
    console.log('[Linter] Initializing ContentApp...');

    // Detect theme
    const detectedTheme = domParser.detectTheme();
    setTheme(detectedTheme);
    console.log('[Linter] Detected theme:', detectedTheme);

    // Load settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['linterSettings'], (result: any) => {
        if (result.linterSettings) {
          console.log(
            '[Linter] Loaded settings from storage:',
            result.linterSettings
          );
          setSettings({
            ...DEFAULT_SETTINGS,
            ...result.linterSettings,
          });
        } else {
          console.log('[Linter] No saved settings, using defaults');
        }
        setSettingsLoaded(true);
      });
    } else {
      setSettingsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    console.log('[Linter] Running initial lint...');
    const timer = setTimeout(() => runLinterRef.current(), 1000);
    // Kaggle fetches notebook cell content asynchronously (a separate blob
    // download observed racing with page load) — the Jupyter cell widgets
    // can all be present, with some cells' sharedModel content not yet
    // loaded, so the very first lint can read those cells as empty and
    // undercount. A one-time catch-up lint a few seconds later covers
    // content that finished loading after the first pass; every trigger
    // after this one (keyboard shortcut, edits, settings changes) already
    // re-extracts fresh and is unaffected.
    const catchUpTimer = setTimeout(() => runLinterRef.current(), 4000);
    return () => {
      clearTimeout(timer);
      clearTimeout(catchUpTimer);
    };
  }, [settingsLoaded]);

  /**
   * Re-run linter when settings change (but not on initial mount)
   */
  const prevSettingsRef = React.useRef<Settings | null>(null);
  useEffect(() => {
    console.log('[Linter] Settings changed:', settings);
    if (!settingsLoaded) return;
    if (prevSettingsRef.current !== null) {
      runLinterRef.current();
    }
    prevSettingsRef.current = settings;
  }, [settings, settingsLoaded]);

  /**
   * Setup keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+L: Run linter
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        console.log('[Linter] Keyboard shortcut: Re-lint');
        runLinterRef.current();
      }
      // Ctrl+Shift+H: Toggle overlay
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        console.log('[Linter] Keyboard shortcut: Toggle overlay');
        setVisible((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Setup message listener for chrome extension
   */
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const messageListener = (
        message: any,
        _sender: any,
        sendResponse: any
      ) => {
        console.log('[Linter] Received message:', message);

        if (message.type === 'runLinter') {
          console.log('[Linter] Message: runLinter');
          runLinterRef.current();
          sendResponse({ success: true });
        } else if (message.type === 'toggleOverlay') {
          console.log('[Linter] Message: toggleOverlay');
          setVisible((prev) => !prev);
          sendResponse({ success: true });
        } else if (message.type === 'settingsChanged') {
          console.log('[Linter] Message: settingsChanged', message.settings);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...message.settings,
          });
        }

        return true;
      };

      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
    return undefined;
  }, []);

  /**
   * Auto re-lint on cell edits (F8)
   * Debounced MutationObserver watching for changes inside `.cm-content`
   * (CodeMirror's editable text), ignoring mutations inside the overlay's
   * own root (#kaggle-linter-root) so re-rendering lint results doesn't
   * trigger another lint.
   */
  useEffect(() => {
    if (!settingsLoaded) return undefined;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRelint = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        console.log('[Linter] Auto re-lint after edit');
        runLinterRef.current();
      }, 800);
    };

    const overlayRoot = document.getElementById('kaggle-linter-root');

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target;
        const el = target instanceof Element ? target : target.parentElement;
        if (!el) continue;
        if (overlayRoot && overlayRoot.contains(el)) continue;
        const mutatedContent = el.closest('.cm-content');
        if (mutatedContent) {
          // Kaggle's notebook is virtualized: scrolling mounts/unmounts
          // `.cm-line` nodes inside `.cm-content`, which is a childList
          // mutation indistinguishable from a real edit at this point.
          // Only schedule a re-lint if the user is actually editing THIS
          // cell — checking only "is focus in *some* .cm-content" isn't
          // enough: once you've clicked into any cell, focus stays there
          // through subsequent scrolling (scrolling doesn't blur an
          // editor), so a virtualization mutation in a totally different,
          // unfocused cell would still pass a same-any-cm-content check.
          const editorHasFocus =
            document.activeElement instanceof Element &&
            document.activeElement.closest('.cm-content') === mutatedContent;
          if (editorHasFocus) {
            scheduleRelint();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [settingsLoaded]);

  /**
   * Handle error click
   */
  const handleErrorClick = (error: any) => {
    if (error.element) {
      error.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight cell
      error.element.classList.add('kaggle-lint-highlight');
      setTimeout(() => {
        error.element.classList.remove('kaggle-lint-highlight');
      }, 2000);
    }
  };

  return (
    <Overlay
      errors={errors}
      visible={visible}
      theme={theme}
      onErrorClick={handleErrorClick}
      onRefresh={runLinter}
      onClose={() => setVisible(false)}
      isLoading={isLinting}
      engineStatus={engineStatus}
    />
  );
};
```

Note: `engineStatus` is now always passed to `<Overlay>` (previously `flake8Status` was only passed when `settings.linterEngine === 'flake8'`, `undefined` otherwise) — both engines have a loading phase now, so there's no longer a "this prop doesn't apply" case. Task 7 updates `OverlayProps` to accept this unconditionally.

- [ ] **Step 4: Verify**

```bash
npm run type-check
```

Expected: FAILS — `packages/ui-components`'s `OverlayProps` doesn't have an `engineStatus` field yet (Task 7 adds it) and still requires the old `flake8Status` shape. This is expected; Task 7 runs immediately next with no other work in between.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/engine/EngineClient.ts packages/extension/src/content/ContentApp.tsx packages/extension/src/flake8/Flake8Client.ts
git commit -m "refactor(extension): generalize EngineClient; remove handmade engine from ContentApp"
```

---

### Task 7: Rename `flake8Status` → `engineStatus` in ui-components (restores green build)

**Files:**

- Modify: `packages/ui-components/src/types/index.ts`
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx`

**Interfaces:**

- Produces: `OverlayProps.engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed'` (same type, renamed from `flake8Status`, now always passed unconditionally by `ContentApp` per Task 6 rather than only when flake8 was selected).

- [ ] **Step 1: Rename the prop in `OverlayProps`**

In `packages/ui-components/src/types/index.ts`, change line 36:

```ts
  flake8Status?: 'unloaded' | 'loading' | 'ready' | 'failed';
```

to:

```ts
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
```

- [ ] **Step 2: Update `Overlay.tsx`**

Change the destructured prop (currently `flake8Status,` in the component's props destructuring, around line 73):

```tsx
  flake8Status,
```

to:

```tsx
  engineStatus,
```

Change the two status-message blocks (currently lines 277-288):

```tsx
{
  flake8Status === 'loading' && (
    <div className="kaggle-lint-engine-status">
      Loading Flake8 (Pyodide)… first load can take up to 30 s
    </div>
  );
}
{
  flake8Status === 'failed' && (
    <div className="kaggle-lint-engine-status">
      Flake8 failed to load — check the offscreen document's console
      (chrome://extensions → this extension → inspect the "service worker" /
      "offscreen document" links) or try re-linting.
    </div>
  );
}
```

to:

```tsx
{
  engineStatus === 'loading' && (
    <div className="kaggle-lint-engine-status">
      Loading linter engine… first load can take up to 30 s
    </div>
  );
}
{
  engineStatus === 'failed' && (
    <div className="kaggle-lint-engine-status">
      Linter engine failed to load — check the offscreen document's console
      (chrome://extensions → this extension → inspect the "service worker" /
      "offscreen document" links) or try re-linting.
    </div>
  );
}
```

(The copy drops the flake8-specific wording since this message now covers either engine — ruff's cold start is expected to be much faster than 30s given no Python/wheels are involved, but the same message covers both without overclaiming a specific number for ruff that hasn't been measured yet.)

- [ ] **Step 3: Verify**

```bash
npm run type-check && npm run build && npm test
grep -rn "flake8Status" packages/
```

Expected: all green again (this restores the build Task 6 left red); the `grep` returns no matches anywhere in the repo.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-components/src/types/index.ts packages/ui-components/src/Overlay/Overlay.tsx
git commit -m "refactor(ui-components): rename flake8Status to engineStatus"
```

---

### Task 8: Rewrite the popup UI (engine radio, ignore-codes inputs, remove Built-in Rules)

**Files:**

- Modify: `packages/extension/src/popup/PopupApp.tsx` (full rewrite — see below)

**Interfaces:**

- Consumes: nothing new — matches the `Settings` shape `ContentApp.tsx` (Task 6) already reads/writes via `chrome.storage.sync`'s `linterSettings` key: `{ linterEngine: 'flake8' | 'ruff'; flake8IgnoreCodes: string; ruffIgnoreCodes: string; }`.
- Produces: nothing new for later tasks — this is the last consumer-facing piece.

- [ ] **Step 1: Rewrite `PopupApp.tsx`**

Replace the entire contents of `packages/extension/src/popup/PopupApp.tsx`:

```tsx
/**
 * Popup App Component
 * Extension settings panel
 */

import React, { useState, useEffect } from 'react';

interface Settings {
  linterEngine: 'flake8' | 'ruff';
  flake8IgnoreCodes: string;
  ruffIgnoreCodes: string;
}

const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'flake8',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};

export const PopupApp: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isKaggle, setIsKaggle] = useState(true);

  // Load settings from chrome storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['linterSettings'], (result: any) => {
        if (result.linterSettings) {
          // Merge with defaults to ensure all properties exist
          setSettings({
            ...DEFAULT_SETTINGS,
            ...result.linterSettings,
          });
        }
      });
    }
  }, []);

  // Check if current tab is a Kaggle page
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          const isKagglePage = tabs[0].url.includes('kaggle.com');
          setIsKaggle(isKagglePage);
        }
      });
    }
  }, []);

  // Detect and apply theme
  useEffect(() => {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
    if (!prefersDark) {
      document.body.classList.add('light-theme');
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.add('light-theme');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Save settings to chrome storage
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ linterSettings: newSettings });

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'settingsChanged',
            settings: newSettings,
          });
        }
      });
    }
  };

  const handleEngineChange = (engine: 'flake8' | 'ruff') => {
    saveSettings({ ...settings, linterEngine: engine });
  };

  const handleIgnoreCodesChange = (
    engine: 'flake8' | 'ruff',
    value: string
  ) => {
    if (engine === 'flake8') {
      saveSettings({ ...settings, flake8IgnoreCodes: value });
    } else {
      saveSettings({ ...settings, ruffIgnoreCodes: value });
    }
  };

  const handleRefresh = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'runLinter' });
        }
      });
    }
  };

  const handleToggleOverlay = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleOverlay' });
        }
      });
    }
  };

  if (!isKaggle) {
    return (
      <div className="popup-container">
        <div id="not-kaggle-content" className="not-kaggle-container">
          <div className="not-kaggle-message">
            <svg
              className="not-kaggle-icon"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
              <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z" />
            </svg>
            <h2>Not in Kaggle Notebook</h2>
            <p className="not-kaggle-text">
              This extension only works on Kaggle Notebooks.
            </p>
            <a
              href="https://www.kaggle.com/code"
              target="_blank"
              rel="noreferrer"
              className="kaggle-link"
            >
              Open Kaggle
            </a>
          </div>
        </div>
      </div>
    );
  }

  const currentIgnoreCodes =
    settings.linterEngine === 'flake8'
      ? settings.flake8IgnoreCodes
      : settings.ruffIgnoreCodes;

  return (
    <div className="popup-container">
      <div className="header">
        <div className="header-title">
          <img
            src="/icons/icon48.png"
            alt="Kaggle Linter"
            className="header-icon"
          />
          <div className="header-text">
            <h1>Kaggle Linter</h1>
            <p className="subtitle">Python code quality checker</p>
          </div>
        </div>
      </div>

      <div id="kaggle-content">
        {/* Linter Engine Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Linter Engine</h2>
          </div>
          <div className="section-content">
            <div className="option-group">
              <label className="option-item">
                <input
                  type="radio"
                  name="linter-engine"
                  value="flake8"
                  checked={settings.linterEngine === 'flake8'}
                  onChange={() => handleEngineChange('flake8')}
                />
                <div className="option-info">
                  <span className="option-label">Flake8</span>
                  <span className="option-description">
                    Industry-standard Python linter (pyflakes + pycodestyle +
                    mccabe)
                  </span>
                </div>
              </label>
              <label className="option-item">
                <input
                  type="radio"
                  name="linter-engine"
                  value="ruff"
                  checked={settings.linterEngine === 'ruff'}
                  onChange={() => handleEngineChange('ruff')}
                />
                <div className="option-info">
                  <span className="option-label">Ruff</span>
                  <span className="option-description">
                    Fast Rust-based Python linter — no Python runtime needed
                  </span>
                </div>
              </label>
            </div>
            <div className="status-message">
              {settings.linterEngine} will be loaded on first lint
            </div>
          </div>
        </div>

        {/* Ignore Codes Section */}
        <div className="section" id="ignore-codes-section">
          <div className="section-header">
            <h2 className="section-title">Ignore Codes</h2>
          </div>
          <div className="section-content">
            <label className="option-item" style={{ display: 'block' }}>
              <span className="option-description">
                Comma-separated codes to ignore for {settings.linterEngine}{' '}
                (e.g. E501, F401)
              </span>
              <input
                type="text"
                value={currentIgnoreCodes}
                onChange={(e) =>
                  handleIgnoreCodesChange(settings.linterEngine, e.target.value)
                }
                placeholder="E501, F401"
              />
            </label>
          </div>
        </div>

        {/* Actions Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Actions</h2>
          </div>
          <div className="section-content">
            <button
              id="refresh-btn"
              className="action-btn action-btn-primary"
              onClick={handleRefresh}
            >
              <svg className="btn-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
              </svg>
              Re-lint Now
            </button>
            <button
              id="toggle-overlay-btn"
              className="action-btn action-btn-secondary"
              onClick={handleToggleOverlay}
            >
              <svg className="btn-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
              </svg>
              Toggle Overlay
            </button>
          </div>
        </div>
      </div>

      <div className="footer">
        <span className="footer-version">v2.0.0</span>
        <a
          href="https://github.com/chater-marzougui/kaggle-lint"
          target="_blank"
          rel="noreferrer"
          className="footer-link"
        >
          <svg className="footer-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
      </div>
    </div>
  );
};
```

Note: no CSS classes new to this file are introduced beyond ones the existing `popup.css` (copied from `old-linter/src/popup/popup.css` per `webpack.config.js`) already defines generically (`section`, `section-content`, `option-item`, `option-description`) — the plain `<input type="text">` for ignore codes relies on the browser's default text-input styling plus whatever `input` rules already exist in that stylesheet; if it renders unstyled/cramped during the manual gate, that's a polish item for a later pass, not a functional blocker.

- [ ] **Step 2: Verify**

```bash
npm run type-check && npm run build && npm test
grep -rn "RULE_REGISTRY\|linterEngine === 'handmade'\|rules\[" packages/extension/src
```

Expected: all green; the `grep` returns no matches.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/popup/PopupApp.tsx
git commit -m "feat(extension): popup UI for flake8/ruff engines with ignore-codes config"
```

---

### Task 9: Delete the handmade engine (rules/, LintEngine.ts, and their tests/types)

**Files:**

- Delete: `packages/core/src/rules/` (entire directory: `BaseRule.ts`, `CapitalizationTyposRule.ts`, `DuplicateFunctionsRule.ts`, `EmptyCellsRule.ts`, `ImportIssuesRule.ts`, `IndentationErrorsRule.ts`, `MissingReturnRule.ts`, `RedefinedVariablesRule.ts`, `UnclosedBracketsRule.ts`, `UndefinedVariablesRule.ts`, `registry.ts`, `index.ts`)
- Delete: `packages/core/src/engines/LintEngine.ts`
- Delete: `packages/core/src/__tests__/LintEngine.test.ts`, `packages/core/src/__tests__/UndefinedVariablesRule.test.ts`, `packages/core/src/__tests__/registry.test.ts`
- Modify: `packages/core/src/index.ts` (drop the rules export)
- Modify: `packages/core/src/engines/index.ts` (drop the `LintEngine` export Task 3 deliberately kept)
- Modify: `packages/core/src/types/index.ts` (remove rule-system-specific types)

**Interfaces:**

- Consumes: nothing — by this point (Tasks 6 and 8 already removed every consumer of `LintEngine`/`createEnabledRules`/`defaultRuleToggles`/`RULE_REGISTRY` in the extension package), nothing in the repo references any of these files. Confirmed via a direct check of the two tests being deleted here: both `LintEngine.test.ts` and `UndefinedVariablesRule.test.ts` import their subjects via relative paths (`../engines/LintEngine`, `../rules/UndefinedVariablesRule`), not through `@kaggle-lint/core`'s public API, so they were unaffected by any earlier task's export changes and have kept passing until now — this task deletes the tests and their subjects together.
- Produces: nothing — this is a pure deletion task, root build stays green (unlike Task 5, this deletion happens _after_ its last consumer was already migrated, not before).

- [ ] **Step 1: Delete the rule system**

```bash
rm -rf packages/core/src/rules
rm packages/core/src/engines/LintEngine.ts
rm packages/core/src/__tests__/LintEngine.test.ts
rm packages/core/src/__tests__/UndefinedVariablesRule.test.ts
rm packages/core/src/__tests__/registry.test.ts
```

- [ ] **Step 2: Update `engines/index.ts`**

Drop the `LintEngine` export Task 3 deliberately kept (its last consumer, `ContentApp.tsx`, was migrated in Task 6):

```ts
/**
 * Engines Index
 * Exports the flake8 Python shim. LintEngine (handmade) and
 * flake8Mapping are both deleted — see Tasks 3 and 9.
 */

export * from './flake8Shim';
```

- [ ] **Step 3: Update `core/src/index.ts`**

Task 1 already added the `notebook` export line here; this step only removes the now-dangling `rules` export. Replace the entire contents of `packages/core/src/index.ts`:

```ts
/**
 * Kaggle Lint Core Package
 * Main entry point for core linting functionality
 */

// Export types
export * from './types';

// Export the notebook-source builder + severity/diagnostic mapping
// (shared by both the flake8 and ruff engines)
export * from './notebook';

// Export engines
export * from './engines';
```

(Drops the `export * from './rules';` line — that's the only actual change this step makes; `notebook` was already present since Task 1.)

- [ ] **Step 4: Update `core/src/types/index.ts`**

Replace the entire contents of `packages/core/src/types/index.ts`:

```ts
/**
 * Core TypeScript type definitions for Kaggle Python Linter
 */

export type Severity = 'error' | 'warning' | 'info';

export interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: Severity;
  rule?: string;
  code?: string; // For flake8/ruff error codes
  cellIndex?: number;
}
```

(Drops `LintContext`, `LintResult`, `LintRule`, `LintEngineConfig`, `CodeCell` — all specific to the deleted rule system. `LintError`/`Severity` are unchanged and still used by `notebook/severityMapping.ts`.)

- [ ] **Step 5: Verify**

```bash
npm run type-check && npm run build && npm test
grep -rn "LintEngine\|BaseRule\|RULE_REGISTRY\|DEFAULT_RULES\|createEnabledRules\|defaultRuleToggles\|LintRule\b\|LintContext\|LintResult\|LintEngineConfig" packages/
```

Expected: all green; the `grep` returns no matches anywhere in the repo (the last consumers were already migrated in Tasks 3, 6, and 8).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/engines/index.ts packages/core/src/types/index.ts packages/core/src/rules packages/core/src/engines/LintEngine.ts packages/core/src/__tests__/LintEngine.test.ts packages/core/src/__tests__/UndefinedVariablesRule.test.ts packages/core/src/__tests__/registry.test.ts
git commit -m "refactor(core): delete handmade rule-based engine"
```

---

### Task 10: Update documentation (CLAUDE.md, README.md)

**Files:**

- Modify: `CLAUDE.md`
- Modify: `README.md`

**Scope note:** both files have other staleness that predates this plan (e.g. `CLAUDE.md`'s `old-linter/`/webpack description, README's dead links to `EXTENSION_USAGE.md`/`IMPLEMENTATION_SUMMARY.md`/`MIGRATION.md` and its "21 passing" test-count claim — pre-existing, tracked as finding F24 for a later milestone). This task only touches sections that describe the exact systems this plan deletes or rewrites — the same scope discipline Milestone 3 used (fix direct regressions this plan causes, don't take on unrelated pre-existing drift).

- [ ] **Step 1: Update `CLAUDE.md`'s `packages/core` section**

Replace (currently lines 43–51):

```markdown
### `packages/core` — `@kaggle-lint/core`

Pure TypeScript linting engine, no DOM dependencies, usable standalone in Node.

- `types/index.ts` — shared types: `LintError`, `LintContext`, `LintRule`, `LintResult`.
- `rules/` — one class per lint rule, each extending `BaseRule` (implements `LintRule`, `run(code, cellOffset, context?) => LintError[]`). `rules/index.ts` exports `DEFAULT_RULES`.
- `engines/LintEngine.ts` — orchestrates the custom rules. Key behavior: `lintNotebook()` accumulates a cross-cell `LintContext` (`definedNames`) as it walks cells in order, so a variable defined in cell 1 is recognized in cell 3. Only rules listed in `CONTEXT_AWARE_RULES` (currently `undefinedVariables`) receive/consume that context; other rules run per-cell in isolation.
- `engines/Flake8Engine.ts` — alternate linting engine. Loads Pyodide (Python-in-WASM) in the browser, installs `flake8`/`pyflakes` via micropip, and runs a Python shim (embedded as a string in this file) that wraps pyflakes with its own notebook-context tracking (`_notebook_context` global in the Python runtime, mirroring the TS engine's cross-cell awareness). Pyodide asset path resolves via `chrome.runtime.getURL()` when running as an extension, else falls back to jsDelivr CDN.
- Both engines expose the same shape: `lint(code, offset)`, `lintNotebook(cells)`, `getStats(errors)`. The extension picks one or the other at runtime based on user settings — they are not composed.
- `pyodide/` assets are copied into `dist/pyodide` by the `copy-pyodide` build step and later consumed by the extension's webpack copy plugin — **core must be built before extension**, even though extension's webpack aliases `@kaggle-lint/core`/`@kaggle-lint/ui-components` to their `src/` (not `dist/`) for TS compilation.
```

with:

```markdown
### `packages/core` — `@kaggle-lint/core`

Pure TypeScript linting logic, no DOM dependencies, usable standalone in Node.

- `types/index.ts` — shared types: `LintError`, `Severity`.
- `notebook/buildNotebookSource.ts` — concatenates a notebook's cells into one source string for a single whole-notebook lint pass (magic commands/shell escapes blanked in place, line counts preserved), plus `mapLineToCell()` to map a diagnostic's global line back to `(cellIndex, cellLine)`. Shared by both engines below — this is what gives correct cross-cell scoping (a variable defined in cell 1 is recognized in cell 3) for free, via real Python/Rust scoping on one concatenated "file," instead of a hand-rolled cross-cell context tracker.
- `notebook/severityMapping.ts` — `classifySeverity()` (a shared code-prefix heuristic: F-codes → error, else → warning — neither engine's real API exposes severity natively) and `mapDiagnostics()` (applies the offset-mapping above plus severity/rule tagging). Also shared by both engines.
- `engines/flake8Shim.ts` — `PYTHON_SHIM`, the Python source run once inside Pyodide. Calls flake8's real `Application`/`StyleGuide`/`BaseFormatter` API (not raw `pyflakes`) once per lint against one whole-notebook source string built by `notebook/buildNotebookSource.ts`. The browser/Pyodide-loading glue lives in `packages/extension/src/offscreen/pyodideRuntime.ts`, not here — this file only owns the pure Python string.
- The ruff engine (`@astral-sh/ruff-wasm-web`, no Python/Pyodide involved) lives entirely in `packages/extension/src/offscreen/ruffRuntime.ts` — nothing ruff-specific lives in `packages/core`.
- The extension picks flake8 or ruff at runtime based on user settings (`EngineClient`, parameterized by engine) — they are not composed, and there is no third "handmade" engine anymore (removed; it duplicated what real Python tooling does better and required touching three files per rule).
- `pyodide/` assets are copied into `dist/pyodide` by the `copy-pyodide` build step and later consumed by the extension's webpack copy plugin — **core must be built before extension**, even though extension's webpack aliases `@kaggle-lint/core`/`@kaggle-lint/ui-components` to their `src/` (not `dist/`) for TS compilation.
```

- [ ] **Step 2: Update the `ContentApp.tsx` description**

Replace (currently line 62):

```markdown
- `content/ContentApp.tsx` is the central control loop: extracts cells → picks `LintEngine` (handmade) or `Flake8Engine` based on `settings.linterEngine` → lints → feeds errors into `<Overlay>`. Settings are persisted via `chrome.storage.sync` and pushed to the content script via `chrome.runtime.onMessage` (`runLinter` / `toggleOverlay` / `settingsChanged` message types) from the popup. Keyboard shortcuts (Ctrl+Shift+L re-lint, Ctrl+Shift+H toggle overlay) are bound directly in this component.
```

with:

```markdown
- `content/ContentApp.tsx` is the central control loop: extracts cells → sends them to whichever engine (`flake8` or `ruff`) `settings.linterEngine` names, via `EngineClient` (`chrome.runtime` messaging to the background service worker, which relays to the offscreen document) → lints → feeds errors into `<Overlay>`. Settings are persisted via `chrome.storage.sync` and pushed to the content script via `chrome.runtime.onMessage` (`runLinter` / `toggleOverlay` / `settingsChanged` message types) from the popup. Keyboard shortcuts (Ctrl+Shift+L re-lint, Ctrl+Shift+H toggle overlay) are bound directly in this component.
```

- [ ] **Step 3: Remove the "Adding a lint rule" section**

Delete (currently lines 69–71):

```markdown
## Adding a lint rule

Extend `BaseRule` in `packages/core/src/rules/`, implement `run(code, cellOffset, context?)`, export it from `rules/index.ts`, and (if it should be user-toggleable in the extension) add it to `RULE_MAP` and `DEFAULT_SETTINGS.rules` in `packages/extension/src/content/ContentApp.tsx`. If the rule needs cross-cell awareness, add its name to `CONTEXT_AWARE_RULES` in `LintEngine.ts` and make sure `run()` returns `{ errors, definedNames }` rather than a bare array.
```

(Delete the whole section including its heading and trailing blank line — the file continues directly from the preceding `old-linter/` section into `## CI`.)

- [ ] **Step 4: Update README's "Dual Linting Engines" feature section**

Replace (currently lines 7–16):

```markdown
### Dual Linting Engines

- **Built-in Engine**: Fast, custom Python linting rules optimized for Kaggle notebooks
  - 9 specialized rules with instant feedback
  - Notebook-aware context tracking (cross-cell variable awareness)
  - Configurable rule toggles
- **Flake8 Engine**: Industry-standard Python linter powered by Pyodide
  - Comprehensive PEP-8 compliance checking
  - Runs entirely in browser via WebAssembly
  - Full Flake8 + pyflakes support
```

with:

```markdown
### Two Linting Engines

- **Flake8**: Industry-standard Python linter (pyflakes + pycodestyle + mccabe) running in-browser via Pyodide (Python-in-WebAssembly)
  - Comprehensive PEP-8 compliance checking, real `# noqa` comment support
  - Notebook-aware: variables defined in earlier cells are correctly recognized in later ones
  - Configurable ignore-codes list
- **Ruff**: Fast Rust-based Python linter, no Python runtime needed — a native WebAssembly build (`@astral-sh/ruff-wasm-web`)
  - Much lighter/faster cold start than the Pyodide-based flake8 engine (no wheels, no Python stdlib)
  - Same notebook-aware cross-cell scoping and configurable ignore-codes list
```

- [ ] **Step 5: Remove the "Available Lint Rules" table**

Delete (currently lines 26–38, including the heading):

```markdown
### Available Lint Rules

| Rule                     | Description                                                                    | Severity     |
| ------------------------ | ------------------------------------------------------------------------------ | ------------ |
| **Undefined Variables**  | Detects usage of variables that haven't been defined                           | Error        |
| **Capitalization Typos** | Detects potential typos from incorrect capitalization (e.g., `true` vs `True`) | Warning      |
| **Duplicate Functions**  | Detects functions/classes with the same name defined multiple times            | Warning      |
| **Import Issues**        | Detects problematic import patterns (wildcards, duplicates, unused imports)    | Warning/Info |
| **Indentation Errors**   | Detects mixed tabs/spaces, unexpected indents, misaligned blocks               | Error        |
| **Empty Cells**          | Detects empty or effectively empty code cells                                  | Info         |
| **Unclosed Brackets**    | Detects unclosed parentheses, brackets, and braces                             | Error        |
| **Redefined Variables**  | Detects shadowing of built-in names and variable redefinition                  | Warning      |
| **Missing Return**       | Detects functions that appear to compute values but lack return statements     | Warning      |
```

- [ ] **Step 6: Update the "Extension Settings" bullets**

Replace (currently lines 92–98):

```markdown
### Extension Settings

Click the extension icon in Chrome toolbar to configure:

- **Linter Engine**: Switch between Built-in and Flake8
- **Rule Toggles**: Enable/disable individual rules (Built-in mode)
- **Actions**: Re-lint now or toggle overlay
```

with:

```markdown
### Extension Settings

Click the extension icon in Chrome toolbar to configure:

- **Linter Engine**: Switch between Flake8 and Ruff
- **Ignore Codes**: Comma-separated error codes to ignore, per engine (e.g. `E501, F401`)
- **Actions**: Re-lint now or toggle overlay
```

- [ ] **Step 7: Update the monorepo tree diagram**

Replace (currently lines 111–118):

```markdown
│ ├── core/ # Core linting engine
│ │ ├── src/
│ │ │ ├── types/ # TypeScript type definitions
│ │ │ ├── rules/ # 9 lint rules (TypeScript classes)
│ │ │ ├── engines/ # LintEngine + flake8Shim/flake8Mapping (pure logic; browser glue lives in the extension's offscreen document)
│ │ │ ├── pyodide/ # Pyodide WebAssembly runtime
│ │ │ └── **tests**/ # Jest tests (21 passing)
│ │ └── dist/ # Compiled output
```

with:

```markdown
│ ├── core/ # Core linting logic
│ │ ├── src/
│ │ │ ├── types/ # TypeScript type definitions
│ │ │ ├── notebook/ # Shared cell-concatenation + severity/diagnostic mapping (used by both engines)
│ │ │ ├── engines/ # flake8Shim.ts (pure Python string; browser glue lives in the extension's offscreen document)
│ │ │ ├── pyodide/ # Pyodide WebAssembly runtime + bundled flake8/pyflakes/pycodestyle/mccabe wheels
│ │ │ └── **tests**/ # Jest tests
│ │ └── dist/ # Compiled output
```

(Dropped the specific test count, since it drifts with every test file added/removed and this task isn't the place to hand-maintain a number — the pre-existing "21 passing" claim was already stale before this plan and is tracked separately as finding F24.)

- [ ] **Step 8: Remove the "Using the LintEngine" and "Using Individual Rules" sections**

Delete (currently lines 265–296, including both headings):

````markdown
#### Using the LintEngine

```typescript
import { LintEngine } from '@kaggle-lint/core';

// Create engine with default rules
const engine = new LintEngine();

// Lint a single piece of code
const errors = engine.lintCode('x = y + 1', 0);
console.log(errors);
// [{ line: 1, msg: "Undefined variable 'y'", severity: 'error', rule: 'undefinedVariables' }]

// Lint multiple cells in a notebook
const cells = [
  { code: 'x = 1', element: null, cellIndex: 0 },
  { code: 'y = x + 1', element: null, cellIndex: 1 },
];
const notebookErrors = engine.lintNotebook(cells);
```
````

#### Using Individual Rules

```typescript
import {
  UndefinedVariablesRule,
  CapitalizationTyposRule,
} from '@kaggle-lint/core';

const undefinedRule = new UndefinedVariablesRule();
const errors = undefinedRule.run('print(x)', 0);
```

````

- [ ] **Step 9: Update the "Flake8 Linting" section to describe both engines**

Replace (currently lines 298–309):

```markdown
#### Flake8 Linting (extension-only)

Flake8/pyflakes linting runs inside the extension's Chrome offscreen document (Pyodide + bundled wheels), not as a standalone `@kaggle-lint/core` class — it requires a Chrome extension context (`chrome.offscreen`, `chrome.runtime` messaging) that a plain Node/browser script doesn't have. The content script talks to it via `Flake8Client` (`packages/extension/src/flake8/Flake8Client.ts`):

```typescript
import { Flake8Client } from '../flake8/Flake8Client';

const client = new Flake8Client();
const errors = await client.lintNotebook([{ code: 'x = y + 1', cellIndex: 0 }]);
````

`packages/core` exports the reusable, browser-independent pieces the offscreen runtime is built from: `PYTHON_SHIM` (the pyflakes-wrapping Python source, from `engines/flake8Shim.ts`) and `mapFlake8Results` (line-offset + rule tagging, from `engines/flake8Mapping.ts`).

````

with:

```markdown
#### Flake8/Ruff Linting (extension-only)

Both engines run inside the extension's Chrome offscreen document — flake8 via Pyodide (Python-in-WASM) + bundled wheels, ruff via a native `@astral-sh/ruff-wasm-web` build with no Python runtime at all — not as standalone `@kaggle-lint/core` classes, since both need a Chrome extension context (`chrome.offscreen`, `chrome.runtime` messaging) a plain Node/browser script doesn't have. The content script talks to whichever engine is selected via `EngineClient` (`packages/extension/src/engine/EngineClient.ts`):

```typescript
import { EngineClient } from '../engine/EngineClient';

const client = new EngineClient();
const errors = await client.lintNotebook('flake8', [{ code: 'x = y + 1', cellIndex: 0 }], []);
````

`packages/core` exports the reusable, browser-independent pieces both offscreen runtimes are built from: `buildNotebookSource`/`mapLineToCell` (notebook/buildNotebookSource.ts — concatenates cells into one lint pass), `classifySeverity`/`mapDiagnostics` (notebook/severityMapping.ts — shared by both engines), and `PYTHON_SHIM` (engines/flake8Shim.ts — flake8-specific).

````

- [ ] **Step 10: Remove the "Adding Custom Rules" section**

Delete (currently lines 311–335, including the heading):

```markdown
### Adding Custom Rules

Each rule follows a simple interface:

```typescript
export class MyCustomRule extends BaseRule {
  name = 'myCustomRule';

  run(code: string, cellOffset: number = 0, context?: LintContext): LintError[] {
    const errors: LintError[] = [];

    // Analyze code and find issues
    if (/* issue detected */) {
      errors.push({
        line: lineNumber + cellOffset,
        msg: 'Description of the issue',
        severity: 'error',
        rule: this.name,
      });
    }

    return errors;
  }
}
````

````

(The file continues directly from the preceding section into `## 🔧 Build & CI/CD`.)

- [ ] **Step 11: Verify**

```bash
grep -n "LintEngine\|BaseRule\|Flake8Engine\|Flake8Client\|RULE_REGISTRY\|Built-in Engine" CLAUDE.md README.md
npm run type-check && npm run build && npm test
````

Expected: the `grep` returns no matches in either file (code/build commands are unaffected by doc-only changes, but re-verify green anyway since this is the plan's last code-adjacent task before the manual gate).

- [ ] **Step 12: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README for flake8/ruff engines, remove handmade rule docs"
```

---

### Task 11: Manual verification gate — USER-GATE

This repo has no e2e scripts; this gate requires a real Chrome browser and a logged-in Kaggle notebook. **If you cannot drive a browser, stop here and hand this checklist to the user — do not claim it passed.**

**Real-notebook test fixture:** the user provided a real Kaggle notebook with many pre-existing lint findings (~14 errors plus warnings) at `.superpowers/sdd/barbados-v4.ipynb` (git-ignored scratch dir — not committed, but present on this machine). Used during this gate to root-cause and verify the fix for the "buildNotebookSource blanked a real code continuation line as a magic/shell-escape, collapsing the whole notebook to 1 finding" bug (see commits 1bdc861/985e1ab). Any future debugging of this pipeline should test against this file's actual cell content first, via the same local-repro technique (extract cells, run through `buildNotebookSource` + the real flake8 shim outside the browser) rather than only synthetic examples.

- [ ] **Step 1: Build and load**

```bash
npm run build
```

Load/reload `packages/extension/dist/` at `chrome://extensions` (content-script changes need both an extension reload _and_ a page refresh). Open a Kaggle notebook in edit mode.

- [ ] **Step 2: Popup UI checks**

- Open the popup: engine radio shows **Flake8** / **Ruff** only (no "Built-in" option anywhere).
- An "Ignore Codes" section with a single text input is visible, its placeholder/label matching whichever engine is currently selected.
- Switching the radio between Flake8/Ruff updates which engine's ignore-codes value the input shows (type something for flake8, switch to ruff, the input should show ruff's separately-stored value, not flake8's).

- [ ] **Step 3: Flake8 acceptance checks**

- With Flake8 selected: the loading message appears on first lint after a fresh extension load, then results appear.
- Type `x = y + 1` into a cell with no prior definition of `y` anywhere in the notebook: flagged as undefined (`F821`). Define `y = 1` in an **earlier** cell, re-lint: the `F821` clears (confirms real flake8 scoping works across the whole concatenated notebook, replacing the old hand-rolled context tracker).
- Type `%matplotlib inline` on its own line inside an otherwise-normal code cell (not as the cell's only content): the rest of that cell still lints normally — it is no longer silently skipped in its entirety (the bug this plan's `buildNotebookSource` fixes).
- Enter an ignore code (e.g. `E501`) in the popup's ignore-codes field for Flake8, re-lint a cell with an intentionally long line: that specific violation disappears.
- DevTools → Network tab for the offscreen document: **zero** requests to pypi.org/files.pythonhosted.org/cdn.jsdelivr.net during the whole cycle (unchanged from Milestone 3 — this plan doesn't touch wheel bundling).

- [ ] **Step 4: Ruff acceptance checks**

- Switch the popup engine to **Ruff**: re-lint. Loading should be noticeably faster than flake8's first load (no Python/wheels involved) — not a strict pass/fail number, just confirm it doesn't hang or error.
- The same `x = y + 1` / earlier-cell-`y`-definition test from Step 3 produces the same clearing behavior under Ruff (confirms the shared `buildNotebookSource` pipeline works identically for both engines).
- Enter an ignore code for Ruff (e.g. `F401`) and confirm an intentionally-unused import stops being flagged.
- DevTools → Network tab for the offscreen document: **zero** network requests at all during a ruff lint (no wheels, no CDN, nothing — the entire engine is one bundled `.wasm` file).

- [ ] **Step 5: Regression checks (things this plan should NOT have changed)**

- Auto re-lint on edit (Milestone 2/3 behavior) still works for both engines.
- Switching Flake8 → Ruff → Flake8 repeatedly doesn't error or leak (watch DevTools memory/console for repeated `RuffRuntime` lints — the `workspace.free()` call in `lintNotebook` should prevent unbounded WASM memory growth across many edits).
- Ctrl+Shift+L / Ctrl+Shift+H keyboard shortcuts still work.

- [ ] **Step 6: If anything fails**

Inspect the offscreen document's console (`chrome://extensions` → this extension → "Inspect views") for Python tracebacks or WASM errors. Debug with `superpowers:systematic-debugging` — reproduce with a minimal, deterministic local repro (extracting the actual shipped `PYTHON_SHIM`/ruff-wasm code and running it standalone, the same technique this plan's own header used to verify both engines) before proposing a fix, not a guess-and-check loop against the live extension.

- [ ] **Step 7: Commit fixes and wrap up**

Commit any fixes found during this gate. Once green, this work is complete; proceed to `superpowers:finishing-a-development-branch` for the merge decision.
