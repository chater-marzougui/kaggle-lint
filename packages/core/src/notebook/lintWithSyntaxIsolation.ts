/**
 * Notebooks routinely contain cells that were never meant to run (scratch
 * code, WIP, deliberately left broken) — a real Python SyntaxError in any
 * one cell must not block linting of the rest. The whole-notebook
 * single-pass model (buildNotebookSource) gives correct cross-cell scoping
 * for free, but real flake8/ruff both bail entirely on a file that fails
 * to parse (reporting ONLY the syntax error, nothing else) — verified by
 * direct repro against the real bundled flake8 6.1.0 wheel and the real
 * @astral-sh/ruff-wasm-web package.
 *
 * This function keeps the whole-notebook pass as the fast/common path,
 * and only falls back — one broken cell at a time — when a pass returns
 * nothing but syntax-error diagnostics: it excludes the offending cell(s)
 * (keeping their syntax-error findings, correctly cell-mapped) and re-runs
 * the pass on the remaining cells, so every cell that DOES parse still
 * gets full cross-cell-aware linting. Bounded by cells.length + 1 attempts
 * — each retry must exclude at least one more cell or the loop stops.
 */

import { buildNotebookSource, type NotebookCellInput } from './buildNotebookSource';
import { mapDiagnostics, type RawDiagnostic } from './severityMapping';
import type { LintError } from '../types';

export type RunLintPass = (source: string) => Promise<RawDiagnostic[]>;
export type IsSyntaxErrorOnly = (diagnostics: RawDiagnostic[]) => boolean;

export async function lintNotebookWithSyntaxIsolation(
  cells: NotebookCellInput[],
  engineName: string,
  runLintPass: RunLintPass,
  isSyntaxErrorOnly: IsSyntaxErrorOnly
): Promise<Array<LintError & { cellIndex: number; cellLine: number }>> {
  let workingCells = cells;
  const collected: Array<LintError & { cellIndex: number; cellLine: number }> = [];

  for (let attempt = 0; attempt <= cells.length; attempt++) {
    const { source, cellOffsets } = buildNotebookSource(workingCells);
    const raw = await runLintPass(source);
    const mapped = mapDiagnostics(raw, cellOffsets, engineName);

    if (workingCells.length === 0 || !isSyntaxErrorOnly(raw)) {
      return [...collected, ...mapped];
    }

    const badCellIndexes = new Set(mapped.map((diagnostic) => diagnostic.cellIndex));
    const nextWorkingCells = workingCells.filter((cell) => !badCellIndexes.has(cell.cellIndex));

    collected.push(...mapped);

    if (nextWorkingCells.length === workingCells.length) {
      // Couldn't identify which cell to exclude (e.g. the diagnostic's
      // line fell outside every known cell range) — stop rather than
      // retry the same cell set forever.
      return collected;
    }
    workingCells = nextWorkingCells;
  }

  return collected;
}
