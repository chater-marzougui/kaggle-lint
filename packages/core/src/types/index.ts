/**
 * Core TypeScript type definitions for Kaggle Linter
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
