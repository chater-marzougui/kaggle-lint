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
