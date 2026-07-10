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
  // A syntax error is always an error, regardless of which engine reports
  // it or that it doesn't start with F (flake8's E999, ruff's
  // invalid-syntax) — the file didn't parse at all, not a style nit.
  if (code === 'E999' || code === 'invalid-syntax') {
    return 'error';
  }
  return code.startsWith('F') ? 'error' : 'warning';
}

export function mapDiagnostics(
  diagnostics: RawDiagnostic[],
  cellOffsets: CellOffset[],
  engineName: string
): Array<LintError & { cellIndex: number; cellLine: number }> {
  const results: Array<LintError & { cellIndex: number; cellLine: number }> = [];

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
