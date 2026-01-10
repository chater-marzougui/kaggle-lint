/**
 * Lint Engine
 * Orchestrates running all lint rules and collecting results
 * Supports cross-cell context sharing for Jupyter notebooks
 */

import { LintError, LintContext, LintRule } from '../types';
import { DEFAULT_RULES } from '../rules';

interface RuleEntry {
  name: string;
  rule: LintRule;
}

interface LintCellResult {
  errors: LintError[];
  newContext: Set<string>;
}

interface NotebookCell {
  code: string;
  element?: any;
  cellIndex: number;
}

interface NotebookError extends LintError {
  cellIndex: number;
  element?: any;
  cellLine: number;
}

interface ErrorStats {
  total: number;
  byRule: Record<string, number>;
  bySeverity: { error: number; warning: number; info: number };
}

export class LintEngine {
  private rules: RuleEntry[] = [];
  private readonly CONTEXT_AWARE_RULES = new Set(['undefinedVariables']);

  /**
   * Constructor
   * @param rules - Array of lint rules to use
   */
  constructor(rules: LintRule[] = DEFAULT_RULES) {
    this.initializeRules(rules);
  }

  /**
   * Initializes rules
   * @param rules - Array of lint rules
   */
  private initializeRules(rules: LintRule[]): void {
    this.rules = [];
    rules.forEach((rule) => {
      this.registerRule(rule);
    });
  }

  /**
   * Registers a lint rule
   * @param rule - Lint rule instance
   */
  registerRule(rule: LintRule): void {
    this.rules.push({ name: rule.name, rule });
  }

  /**
   * Runs all rules on a single cell's code
   * @param code - Python source code
   * @param cellOffset - Line offset for global line numbers
   * @param cellIndex - Cell index for cell-specific rules
   * @param context - Cross-cell context (accumulated definitions)
   * @returns Errors and new definitions for context
   */
  lintCell(
    code: string,
    cellOffset: number = 0,
    cellIndex: number = 0,
    context: LintContext = {}
  ): LintCellResult {
    const allErrors: LintError[] = [];
    let cellDefinedNames = new Set<string>();

    this.rules.forEach(({ name, rule }) => {
      try {
        let result;

        if (name === 'emptyCells') {
          // EmptyCells rule needs cellIndex passed through context
          result = rule.run(code, cellOffset, context);
        } else if (this.CONTEXT_AWARE_RULES.has(name)) {
          // Pass context to context-aware rules
          result = rule.run(code, cellOffset, {
            ...context,
            definedNames: context.definedNames || new Set(),
          });
        } else {
          result = rule.run(code, cellOffset, context);
        }

        // Handle both old format (array) and new format (object with errors and definedNames)
        let errors: LintError[];
        if (Array.isArray(result)) {
          errors = result;
        } else if (result && typeof result === 'object' && 'errors' in result) {
          errors = result.errors || [];
          // Collect defined names for context accumulation
          if ('definedNames' in result && result.definedNames) {
            (result.definedNames as Set<string>).forEach((name) =>
              cellDefinedNames.add(name)
            );
          }
        } else {
          errors = [];
        }

        errors.forEach((error) => {
          allErrors.push({
            ...error,
            rule: name,
          });
        });
      } catch (e) {
        console.error(
          `Error running rule '${name}' on cell ${cellIndex}:`,
          e instanceof Error ? e.message : String(e)
        );
      }
    });

    return { errors: allErrors, newContext: cellDefinedNames };
  }

  /**
   * Runs all rules on multiple cells with cross-cell context sharing
   * @param cells - Array of cells with code, element, and cellIndex
   * @returns Array of errors with cell information
   */
  lintNotebook(cells: NotebookCell[]): NotebookError[] {
    const allErrors: NotebookError[] = [];
    let lineOffset = 0;

    // Accumulated context across cells (variables, functions, imports defined in previous cells)
    let accumulatedContext: LintContext = {
      definedNames: new Set(),
    };

    // Reset context in context-aware rules
    this.rules.forEach(({ name, rule }) => {
      if (this.CONTEXT_AWARE_RULES.has(name)) {
        // Call resetContext if the rule has this method
        const ruleAny = rule as any;
        if (ruleAny.resetContext && typeof ruleAny.resetContext === 'function') {
          ruleAny.resetContext();
        }
      }
    });

    cells.forEach((cell) => {
      const { errors, newContext } = this.lintCell(
        cell.code,
        lineOffset,
        cell.cellIndex,
        accumulatedContext
      );

      errors.forEach((error) => {
        allErrors.push({
          ...error,
          cellIndex: cell.cellIndex,
          element: cell.element,
          cellLine: error.line - lineOffset,
        });
      });

      // Accumulate context from this cell for subsequent cells
      newContext.forEach((name) => accumulatedContext.definedNames?.add(name));

      // Also extract definitions from this cell for context
      // (in case some rules don't return definedNames)
      // Find UndefinedVariablesRule and extract definitions
      const undefinedVarRule = this.rules.find(
        (r) => r.name === 'undefinedVariables'
      );
      if (undefinedVarRule) {
        const ruleAny = undefinedVarRule.rule as any;
        if (
          ruleAny.extractDefinedNamesPublic &&
          typeof ruleAny.extractDefinedNamesPublic === 'function'
        ) {
          const additionalNames = ruleAny.extractDefinedNamesPublic(cell.code);
          additionalNames.forEach((name: string) =>
            accumulatedContext.definedNames?.add(name)
          );
        }
      }

      lineOffset += cell.code.split('\n').length;
    });

    return allErrors;
  }

  /**
   * Filters errors by severity
   * @param errors - All errors
   * @param minSeverity - Minimum severity level
   * @returns Filtered errors
   */
  filterBySeverity(errors: LintError[], minSeverity: string): LintError[] {
    const severityOrder: Record<string, number> = {
      error: 3,
      warning: 2,
      info: 1,
    };
    const minLevel = severityOrder[minSeverity] || 0;

    return errors.filter((error) => {
      const level = severityOrder[error.severity] || 0;
      return level >= minLevel;
    });
  }

  /**
   * Groups errors by cell
   * @param errors - All errors
   * @returns Map of cell index to errors
   */
  groupByCell(errors: NotebookError[]): Map<number, NotebookError[]> {
    const grouped = new Map<number, NotebookError[]>();

    errors.forEach((error) => {
      const cellIndex = error.cellIndex;
      if (!grouped.has(cellIndex)) {
        grouped.set(cellIndex, []);
      }
      grouped.get(cellIndex)!.push(error);
    });

    return grouped;
  }

  /**
   * Groups errors by rule
   * @param errors - All errors
   * @returns Map of rule name to errors
   */
  groupByRule(errors: LintError[]): Map<string, LintError[]> {
    const grouped = new Map<string, LintError[]>();

    errors.forEach((error) => {
      const rule = error.rule || 'unknown';
      if (!grouped.has(rule)) {
        grouped.set(rule, []);
      }
      grouped.get(rule)!.push(error);
    });

    return grouped;
  }

  /**
   * Gets error statistics
   * @param errors - All errors
   * @returns Statistics object
   */
  getStats(errors: LintError[]): ErrorStats {
    const stats: ErrorStats = {
      total: errors.length,
      byRule: {},
      bySeverity: { error: 0, warning: 0, info: 0 },
    };

    errors.forEach((error) => {
      stats.bySeverity[error.severity] =
        (stats.bySeverity[error.severity] || 0) + 1;
      const ruleName = error.rule || 'unknown';
      stats.byRule[ruleName] = (stats.byRule[ruleName] || 0) + 1;
    });

    return stats;
  }

  /**
   * Gets all registered rules
   * @returns Array of rule names
   */
  getRules(): Array<{ name: string }> {
    return this.rules.map((r) => ({ name: r.name }));
  }

  /**
   * Convenience function to lint a single piece of code
   * @param code - Python source code
   * @param cellOffset - Line offset
   * @returns Array of errors
   */
  lintCode(code: string, cellOffset: number = 0): LintError[] {
    const { errors } = this.lintCell(code, cellOffset, 0, {});
    return errors;
  }
}
