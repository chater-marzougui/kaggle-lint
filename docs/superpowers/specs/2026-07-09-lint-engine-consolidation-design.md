# Lint Engine Consolidation — Design

**Status:** Approved by user 2026-07-09, pending implementation plan.

## Motivation

The current linting architecture (post-Milestone 3) has three problems the user wants fixed:

1. **The handmade engine is too bad and hard to maintain.** `packages/core/src/rules/` (9 regex/line-based rule classes) and `packages/core/src/engines/LintEngine.ts` duplicate what real Python tooling already does better, and every rule addition touches three separate places (core registry, `PopupApp.tsx`'s `RULES` array, `ContentApp.tsx`'s `RULE_MAP`) — a maintenance burden with no compensating accuracy benefit over real tools.
2. **Flake8's notebook handling is naive.** The current Python shim (`packages/core/src/engines/flake8Shim.ts`) whole-cell-skips any cell whose first line starts with `%%` or `!`, and hand-rolls cross-cell "notebook context" via a custom `ContextAwareChecker` subclass — the exact class whose init-ordering bug was found and fixed during Milestone 3's manual gate. A cell with `%matplotlib inline` on line 1 and real code below currently loses ALL lint coverage for that cell.
3. **No way to customize behavior** (e.g. ignore a specific error code) — settings only ever toggled whole rules on/off for the handmade engine; the flake8 engine has no configuration surface at all.

This design also adds **ruff** (`@astral-sh/ruff-wasm-web`) as a second, parallel Python-linting engine — a native WASM build with no Python runtime involved, so much lighter/faster than the Pyodide-based flake8 engine. Both engines are kept (user's explicit requirement): if ruff proves worse in practice, flake8 remains available, and vice versa.

## Scope decisions (from brainstorming)

- One combined project (not split into separate specs) — the engine-selection UI and config system need to account for all pieces together.
- **nbqa**: reimplement its cell-concatenation/magic-handling _technique_ in our own code, not depend on the actual `nbqa` PyPI package (which assumes a CLI/filesystem workflow that doesn't translate cleanly into Pyodide's sandboxed environment).
- **Real flake8 API**, not raw `pyflakes` — gets pycodestyle (E/W) and mccabe (C90) checks, real `ignore`/`select` config, and native `# noqa` comment support "for free." (The `flake8` wheel bundled since Milestone 3 has been sitting unused until now.)
- **Engine selection**: mutually exclusive radio (flake8 OR ruff), not simultaneous multi-engine linting. Handmade engine removed entirely, no successor.
- **Config scope for v1**: just an ignore-codes list per engine (free-text, comma-separated). No max-line-length, no select-list, no per-rule severity override UI.
- **No settings migration** — this extension isn't distributed beyond the developer yet; stale `linterEngine: 'handmade'` or `rules: {...}` entries in existing local `chrome.storage.sync` are simply ignored going forward, no migration code.
- **Severity**: keep the 3-value `Severity = 'error' | 'warning' | 'info'` type (not narrowed to 2), even though the new shared heuristic only ever produces `error`/`warning` today — `'info'` stays available for future use (e.g. surfacing a ruff "safe fix available" hint later).
- **Ruff wasm variant**: `@astral-sh/ruff-wasm-web` (the wasm-pack "web" target — `init(url)` takes an explicit URL/BufferSource and fetches+instantiates, same pattern as how Pyodide's assets are already loaded via `chrome.runtime.getURL(...)`; no webpack `asyncWebAssembly` experiment needed, the `.wasm` file is just a static asset copied via `CopyPlugin`, same as `pyodide/`).
- **Where ruff runs**: the _same_ offscreen document as Pyodide, not the content script. Content scripts inherit the _host page's_ CSP for WASM instantiation — this is why Pyodide needed an offscreen document in Milestone 3, and the same restriction applies to any WASM, not just Pyodide. Chrome also only permits one offscreen document per extension, so this isn't a new problem to solve — it's a second runtime inside the document Milestone 3 already built.

## Architecture overview

Both engines move from today's **per-cell loop with hand-rolled cross-cell context** to a **single-pass, whole-notebook** model:

1. A new shared module in `packages/core` concatenates all cells into one source string (with magic/shell lines blanked, preserving line counts) plus a per-cell offset table.
2. That one string is linted **once** per engine:
   - **Flake8** (Pyodide): the Python shim calls flake8's real API once on the one string.
   - **Ruff** (wasm): `workspace.check()` once on the same string.
3. Both engines' raw diagnostics map back to `(cellIndex, cellLine)` via the same shared offset table and the same shared severity/ignore-code post-processing.

Real Python/Rust scoping on one concatenated "file" gives correct cross-cell undefined-name behavior for free — no custom context-tracking class needed, which is what directly eliminates the Milestone 3 `ContextAwareChecker` bug class (not just patches it).

## Component: shared notebook-source builder

**File:** `packages/core/src/notebook/buildNotebookSource.ts` (new)

```ts
export interface NotebookCellInput {
  code: string;
  cellIndex: number;
}

export interface CellOffset {
  cellIndex: number;
  startLine: number; // 1-based line number in the concatenated source where this cell begins
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

Magic/shell handling (the actual "nbqa technique" this design adopts):

- If a cell's first non-blank line starts with `%%` (a cell magic — `%%bash`, `%%html`, `%%writefile`, etc. — these change the _whole cell's_ language away from Python), every line of that cell is blanked (replaced with an empty line), preserving its line count so later cells' offsets stay correct, but contributing nothing to the lint pass.
- Any other line (in any non-skipped cell) starting with `%` (a line magic, e.g. `%matplotlib inline`) or `!` (a shell escape, e.g. `!pip install x`) is blanked individually — the rest of that cell still lints normally. This is the concrete fix for the current whole-cell-skip bug.
- Every other line passes through unchanged.

Cells are processed in `cellIndex` order (matching `CodeMirrorManager.getAllCells()`'s existing sort). Pure function, fully unit-testable in Jest — no DOM, no chrome.\*, no Pyodide/WASM dependency.

## Component: shared severity/ignore mapping

**File:** `packages/core/src/notebook/severityMapping.ts` (new) — replaces `flake8Mapping.ts`'s narrower `mapFlake8Results`.

```ts
export interface RawDiagnostic {
  line: number; // global line number in the concatenated source
  column: number;
  code: string; // e.g. "F821", "E501", "RUF100"
  message: string;
}

export function classifySeverity(code: string): Severity; // shared prefix heuristic: code starts with 'F' -> 'error', else -> 'warning'

export function mapDiagnostics(
  diagnostics: RawDiagnostic[],
  cellOffsets: CellOffset[]
): Array<LintError & { cellIndex: number; cellLine: number }>;
```

One function, one test suite, consumed by both engines — the severity heuristic is engine-agnostic (operates on `{code, message, line, column}`, not on anything flake8- or ruff-specific).

**No separate ignore-filtering step here, by design.** The brainstorming decision was explicit: customization is "routed to the ruff & flake8" — i.e., `ignoreCodes` is passed into each tool's own native config (flake8's `application.options.ignore`, ruff's `Workspace` `lint.ignore`) so the tools themselves never emit those diagnostics, rather than us collecting everything and filtering client-side. (An earlier draft of this design had a redundant `filterIgnored` function here that duplicated what native config already does — removed on self-review as inconsistent with the actual decision.) `severityMapping.ts` only ever sees diagnostics the engine already decided to report.

**Severity heuristic:** code starts with `F` (pyflakes-family codes: undefined names, unused imports, syntax errors — both flake8's F-codes and ruff's F-codes use the same pyflakes-derived numbering) → `'error'`. Everything else (E/W/C90/B/SIM/UP/ANN/D/RUF/etc. — style, complexity, upgrade suggestions) → `'warning'`. `'info'` is not produced by this heuristic today but remains a valid `Severity` value for future use.

## Component: flake8 engine (rewritten)

**File:** `packages/core/src/engines/flake8Shim.ts` (rewritten, much smaller)

The Python shim drops `ContextAwareChecker`, `CollectingReporter`, `_notebook_context`, `reset_notebook_context`, `update_notebook_context`, `lint_cell_with_notebook_context` entirely. It becomes a thin wrapper around flake8's real API — verified end-to-end against the actual bundled flake8 6.1.0 wheel (unzipped and run locally with Python 3.12, not guessed):

**Finding 1 — flake8's public API is file-path-based, not string-based.** `flake8.api.legacy.StyleGuide.check_files(paths)` and `.input_file(filename)` both take a path; the `lines`/`expected`/`line_offset` params on `input_file` are explicitly documented as "Ignored since Flake8 3.0." So the concatenated notebook source has to be written to Pyodide's virtual filesystem as a temp file before calling `check_files([path])` — Pyodide's FS is a real, if in-memory/virtual, filesystem, so this is a normal, supported thing to do, not a workaround.

**Finding 2 — `get_style_guide()`'s convenience wrapper doesn't let you inject a custom formatter that actually receives live violations.** Reassigning `application.formatter` after calling `get_style_guide()` has no effect — confirmed by direct repro: violations still printed via the default formatter, and a post-hoc-assigned custom formatter's `collected` list stayed empty. This is because `get_style_guide()` internally calls `application.make_file_checker_manager()`, which wires the checking machinery to whatever formatter existed at that point — reassigning the attribute afterward doesn't retroactively rewire it.

**The working pattern** (confirmed via a second repro, using the lower-level `Application` methods `get_style_guide()` wraps, but installing our own formatter before `make_guide()`/`make_file_checker_manager()` run):

```python
from flake8.main.application import Application
from flake8.api.legacy import parse_args, StyleGuide
from flake8.formatting.base import BaseFormatter

class CollectingFormatter(BaseFormatter):
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
        return None  # suppress printing

def lint_source(source_path, ignore_codes):
    application = Application()
    application.plugins, application.options = parse_args([])
    application.options.ignore = ignore_codes
    application.formatter = CollectingFormatter(application.options)  # before make_guide()
    application.make_guide()
    application.make_file_checker_manager([])
    guide = StyleGuide(application)
    guide.check_files([source_path])
    return application.formatter.collected
```

Confirmed working end-to-end: given a 2-line file with an unused import and an undefined name, plus a 100+ char line, `ignore=['E501']` correctly suppressed the long-line violation, and `collected` came back as exactly `[{'line': 1, 'column': 1, 'code': 'F401', 'message': "'os' imported but unused"}, {'line': 2, 'column': 5, 'code': 'F821', 'message': "undefined name 'y'"}]` — clean structured data (`error.text` is already the message with the code prefix stripped, via the `Violation` namedtuple's own fields — no string-parsing needed), and nothing printed to stdout. This is what `lint_source` in the rewritten `PYTHON_SHIM` does, called once per lint against the JS-built concatenated source.

**File:** `packages/extension/src/offscreen/pyodideRuntime.ts` (updated)

`PyodideRuntime.lintNotebook(cells, ignoreCodes)`:

1. Calls `buildNotebookSource(cells)` (imported from `@kaggle-lint/core`) once.
2. Passes the single concatenated `source` string + `ignoreCodes` into the Python shim's `lint_source` — `ignoreCodes` goes straight into `application.options.ignore` (native flake8 config; already-ignored codes never appear in `collected` at all, per the verified repro above).
3. Maps the raw `{line, column, code, message}` results (the exact shape `lint_source` returns, matching `RawDiagnostic`) through `mapDiagnostics` (also from `@kaggle-lint/core`, offset+severity only — no ignore-filtering, see the note under "Component: shared severity/ignore mapping") to get `Flake8ResultError[]`.

No more per-cell Python calls, no more `reset_notebook_context()` between cells — one Python call per lint. A fresh `Application`/`StyleGuide` is constructed on every call (matching the verified repro), so a changed `ignoreCodes` setting takes effect immediately on the next lint — no stale-config risk from reusing a constructed guide across calls.

## Component: ruff engine (new)

**File:** `packages/extension/src/offscreen/ruffRuntime.ts` (new)

```ts
import init, {
  Workspace,
  PositionEncoding,
  type Diagnostic,
} from '@astral-sh/ruff-wasm-web';

export class RuffRuntime {
  status: EngineStatus = 'unloaded';
  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    // Only the WASM bootstrap (init()) happens once and is cached — this
    // is the expensive part. Workspace itself is cheap to construct and
    // is NOT cached here; see lintNotebook below for why.
  }

  async lintNotebook(
    cells: NotebookCellInput[],
    ignoreCodes: string[]
  ): Promise<Array<LintError & { cellIndex: number; cellLine: number }>> {
    await this.load();
    // Workspace's settings (including lint.ignore) are fixed at
    // construction time, with no way to update them on an existing
    // instance. Constructing a fresh Workspace per lint call — mirroring
    // the flake8 shim's fresh-Application-per-call pattern above — means
    // a changed ignoreCodes setting takes effect immediately, with no
    // stale-config risk from reusing a long-lived instance. This is cheap:
    // the expensive part (WASM instantiation) already happened in load().
    const workspace = new Workspace(
      {
        'line-length': 88,
        lint: { select: ['E4', 'E7', 'E9', 'F'], ignore: ignoreCodes },
      },
      PositionEncoding.Utf16
    );
    const { source, cellOffsets } = buildNotebookSource(cells);
    const raw: Diagnostic[] = workspace.check(source);
    workspace.free(); // wasm-bindgen classes need explicit disposal, unlike GC'd JS objects
    const normalized = raw.map((d) => ({
      line: d.start_location.row,
      column: d.start_location.column,
      code: d.code ?? '',
      message: d.message,
    }));
    return mapDiagnostics(normalized, cellOffsets);
  }
}
```

`ignoreCodes` is passed straight into `Workspace`'s own `lint.ignore` — native routing, same as flake8, no separate client-side filter. Same `buildNotebookSource`/`mapDiagnostics` pipeline as flake8 — the only engine-specific code is the `Workspace` construction and the `Diagnostic → RawDiagnostic` field-name normalization (`start_location.row`/`start_location.column` vs. flake8's `line`/`column`).

`load()` dedupes the one-time WASM bootstrap via the same stored-promise pattern as `PyodideRuntime.load()`. No wheels, no Python stdlib — just the one `.wasm` asset (~10.8MB vs. Pyodide's ~19MB+), so cold-start should be noticeably faster. Note `workspace.free()`: the `.d.ts` shows `Workspace` has an explicit `free()`/`[Symbol.dispose]()` method (standard wasm-bindgen pattern — WASM-side memory isn't tracked by JS's garbage collector), so a fresh-per-call `Workspace` must be freed after use to avoid a WASM-side memory leak across repeated lints.

## Protocol generalization

**File:** `packages/extension/src/engine/protocol.ts` (renamed/generalized from `flake8/protocol.ts`)

```ts
export type EngineName = 'flake8' | 'ruff';
export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'failed';

export const ENGINE_LINT_NOTEBOOK = 'ENGINE_LINT_NOTEBOOK' as const;
export const ENGINE_STATUS = 'ENGINE_STATUS' as const;

export interface EngineLintRequest {
  type: typeof ENGINE_LINT_NOTEBOOK;
  engine: EngineName;
  cells: NotebookCellInput[];
  ignoreCodes: string[];
}
export interface EngineStatusRequest {
  type: typeof ENGINE_STATUS;
  engine: EngineName;
}
export type EngineResultError = LintError & {
  cellIndex: number;
  cellLine: number;
};
export type EngineLintResponse =
  { ok: true; errors: EngineResultError[] } | { ok: false; error: string };
export interface EngineStatusResponse {
  status: EngineStatus;
}

export const ENGINE_OFFSCREEN_REQUEST = 'ENGINE_OFFSCREEN_REQUEST' as const;
export interface EngineOffscreenRequest {
  type: typeof ENGINE_OFFSCREEN_REQUEST;
  payload: EngineLintRequest | EngineStatusRequest;
}
```

`background/index.ts` keeps the exact Milestone 3 pattern (disjoint message-type namespaces, `sender.tab` guard, in-flight `ensureOffscreen()` lock) — just parameterized on `engine` instead of hardcoded to flake8. `offscreen/index.ts` dispatches on `request.payload.engine` to either `PyodideRuntime` or `RuffRuntime`, both satisfying the same small interface (`status`, `lintNotebook(cells, ignoreCodes)`).

**File:** `packages/extension/src/engine/EngineClient.ts` (renamed/generalized from `flake8/Flake8Client.ts`) — same shape as today's `Flake8Client`, parameterized by `engine`.

## Settings & UI changes

**Settings shape** (`chrome.storage.sync`):

```ts
interface Settings {
  linterEngine: 'flake8' | 'ruff'; // was 'handmade' | 'flake8'
  flake8IgnoreCodes: string; // comma-separated free text, e.g. "E501, F401"
  ruffIgnoreCodes: string;
}
```

`rules: Record<string, boolean>` is dropped. No migration code for old stored values (per scope decision).

**`packages/extension/src/popup/PopupApp.tsx`:**

- Engine radio: `flake8` / `ruff`.
- Remove the "Built-in Rules" section and its `RULES` array entirely.
- One text input per engine for ignore-codes, shown for the currently-selected engine.

**`packages/extension/src/content/ContentApp.tsx`:**

- Remove `getHandmadeLintEngine`, `handmadeLintEngineRef`, `LintEngine`/`createEnabledRules`/`defaultRuleToggles` imports, and the `settings.linterEngine === 'handmade'` branch of `runLinter`.
- `runLinter`'s engine branch becomes `flake8` vs `ruff`, both through `EngineClient.lintNotebook(engine, cells, ignoreCodes)`.
- Element-stripping/re-attachment-by-`cellIndex` pattern from Milestone 3 is unchanged (still needed — the protocol is still JSON-only).

## Deletions

- `packages/core/src/rules/` — entire directory: 9 rule classes, `BaseRule`, `registry.ts`, `index.ts`.
- `packages/core/src/engines/LintEngine.ts`.
- `packages/core/src/__tests__/LintEngine.test.ts`, `UndefinedVariablesRule.test.ts`, `registry.test.ts`.
- `packages/core/src/types/index.ts`: remove `LintRule`, `LintContext`, `LintResult`, `LintEngineConfig`, `CodeCell` (rule-system-specific). Keep `LintError`, `Severity`.
- `packages/core/src/engines/flake8Mapping.ts` — superseded by `notebook/severityMapping.ts` (delete once the new module is in place and consumers migrated).
- `CLAUDE.md`'s "Adding a lint rule" section — remove (describes a now-deleted extension point).
- `README.md`'s rule table and "Using Individual Rules" / "Using the Flake8 Engine" examples — rewritten to describe the two-engine, no-custom-rules architecture.

## New dependency

`packages/extension/package.json`: add `@astral-sh/ruff-wasm-web` as a regular `dependency` (imported at runtime in the bundled offscreen code, not a dev-only tool).

`packages/extension/webpack.config.js`: add a `CopyPlugin` pattern copying `node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm` → `dist/ruff/ruff_wasm_bg.wasm` (same pattern as the existing `pyodide/` copy).

## Testing strategy

- **`buildNotebookSource`/`mapLineToCell`** (core, pure TS): full Jest suite — magic-line blanking, whole-cell `%%`-skip, offset math across multi-cell notebooks, edge cases (empty cells, magic on the last line, cell with only magic lines).
- **`severityMapping.ts`** (`classifySeverity`, `mapDiagnostics`): Jest tests, engine-agnostic — one suite covers both engines since the functions operate on a generic diagnostic shape.
- **Python shim** (flake8's real API call): no real Python execution in CI (consistent with the Milestone 3 decision) — structural regression tests (string-inspection of the shim, same pattern as `flake8Shim.test.ts`) plus the manual gate. Known gap, worth revisiting whenever Milestone 5 (tests-and-ci) reconsiders CI-level Python execution.
- **Ruff wasm runtime**: no way to exercise real WASM in Jest/Node meaningfully — manual gate covers it.
- **Manual USER-GATE required** for both engines end-to-end in a real Kaggle notebook, same reasoning as Milestone 3 (no e2e infra in this repo).

## Out of scope (deferred, not part of this design)

- Running both engines simultaneously with merged/deduped results.
- Settings migration for existing installs.
- Config surface beyond an ignore-codes list (no max-line-length, no select-list UI, no per-code severity override).
- CI-level real Python execution for the flake8 shim.
- Any change to the Milestone 3 offscreen-document/background-relay _architecture_ itself — this design reuses it as-is, just generalizes the message types.
