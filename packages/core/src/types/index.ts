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
  cellIndex?: number;
}

export interface LintContext {
  definedNames?: Set<string>;
  importedModules?: Set<string>;
  functionNames?: Set<string>;
  classNames?: Set<string>;
}

export interface LintResult {
  errors: LintError[];
  newContext?: LintContext;
}

export interface LintRule {
  name: string;
  run(
    code: string,
    cellOffset: number,
    context?: LintContext
  ): LintError[] | LintResult;
}

export interface LintEngineConfig {
  rules?: string[];
  severityLevels?: Record<string, Severity>;
}

export interface CodeCell {
  code: string;
  index: number;
  offset: number;
}
