/**
 * Lint Engine
 * Orchestrates running all lint rules and collecting results
 */

const LintEngine = (function () {
  "use strict";

  const rules = [];

  /**
   * Registers a lint rule
   * @param {string} name - Rule name
   * @param {Function} ruleFunction - Rule function that returns {run: Function}
   */
  function registerRule(name, ruleFunction) {
    rules.push({ name, run: ruleFunction.run });
  }

  /**
   * Initializes all built-in rules
   */
  function initializeRules() {
    if (typeof UndefinedVariablesRule !== "undefined") {
      registerRule("undefinedVariables", UndefinedVariablesRule);
    }
    if (typeof CapitalizationTyposRule !== "undefined") {
      registerRule("capitalizationTypos", CapitalizationTyposRule);
    }
    if (typeof DuplicateFunctionsRule !== "undefined") {
      registerRule("duplicateFunctions", DuplicateFunctionsRule);
    }
    if (typeof ImportIssuesRule !== "undefined") {
      registerRule("importIssues", ImportIssuesRule);
    }
    if (typeof IndentationErrorsRule !== "undefined") {
      registerRule("indentationErrors", IndentationErrorsRule);
    }
    if (typeof EmptyCellsRule !== "undefined") {
      registerRule("emptyCells", EmptyCellsRule);
    }
    if (typeof UnclosedBracketsRule !== "undefined") {
      registerRule("unclosedBrackets", UnclosedBracketsRule);
    }
    if (typeof RedefinedVariablesRule !== "undefined") {
      registerRule("redefinedVariables", RedefinedVariablesRule);
    }
    if (typeof MissingReturnRule !== "undefined") {
      registerRule("missingReturn", MissingReturnRule);
    }
  }

  /**
   * Runs all rules on a single cell's code
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for global line numbers
   * @param {number} cellIndex - Cell index for cell-specific rules
   * @returns {Array<{line: number, msg: string, severity: string, rule: string}>}
   */
  function lintCell(code, cellOffset = 0, cellIndex = 0) {
    const allErrors = [];

    rules.forEach(({ name, run }) => {
      try {
        let errors;
        if (name === "emptyCells") {
          errors = run(code, cellOffset, cellIndex);
        } else {
          errors = run(code, cellOffset);
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
          e.message
        );
      }
    });

    return allErrors;
  }

  /**
   * Runs all rules on multiple cells
   * @param {Array<{code: string, element: Element, cellIndex: number}>} cells
   * @returns {Array<{line: number, msg: string, severity: string, rule: string, cellIndex: number, element: Element}>}
   */
  function lintNotebook(cells) {
    const allErrors = [];
    let lineOffset = 0;

    cells.forEach((cell) => {
      const errors = lintCell(cell.code, lineOffset, cell.cellIndex);

      errors.forEach((error) => {
        allErrors.push({
          ...error,
          cellIndex: cell.cellIndex,
          element: cell.element,
          cellLine: error.line - lineOffset,
        });
      });

      lineOffset += cell.code.split("\n").length;
    });

    return allErrors;
  }

  /**
   * Filters errors by severity
   * @param {Array} errors - All errors
   * @param {string} minSeverity - Minimum severity level
   * @returns {Array}
   */
  function filterBySeverity(errors, minSeverity) {
    const severityOrder = { error: 3, warning: 2, info: 1 };
    const minLevel = severityOrder[minSeverity] || 0;

    return errors.filter((error) => {
      const level = severityOrder[error.severity] || 0;
      return level >= minLevel;
    });
  }

  /**
   * Groups errors by cell
   * @param {Array} errors - All errors
   * @returns {Map<number, Array>}
   */
  function groupByCell(errors) {
    const grouped = new Map();

    errors.forEach((error) => {
      const cellIndex = error.cellIndex;
      if (!grouped.has(cellIndex)) {
        grouped.set(cellIndex, []);
      }
      grouped.get(cellIndex).push(error);
    });

    return grouped;
  }

  /**
   * Groups errors by rule
   * @param {Array} errors - All errors
   * @returns {Map<string, Array>}
   */
  function groupByRule(errors) {
    const grouped = new Map();

    errors.forEach((error) => {
      const rule = error.rule;
      if (!grouped.has(rule)) {
        grouped.set(rule, []);
      }
      grouped.get(rule).push(error);
    });

    return grouped;
  }

  /**
   * Gets error statistics
   * @param {Array} errors - All errors
   * @returns {Object}
   */
  function getStats(errors) {
    const stats = {
      total: errors.length,
      byRule: {},
      bySeverity: { error: 0, warning: 0, info: 0 },
    };

    errors.forEach((error) => {
      stats.bySeverity[error.severity] =
        (stats.bySeverity[error.severity] || 0) + 1;
      stats.byRule[error.rule] = (stats.byRule[error.rule] || 0) + 1;
    });

    return stats;
  }

  /**
   * Gets all registered rules
   * @returns {Array<{name: string}>}
   */
  function getRules() {
    return rules.map((r) => ({ name: r.name }));
  }

  return {
    registerRule,
    initializeRules,
    lintCell,
    lintNotebook,
    filterBySeverity,
    groupByCell,
    groupByRule,
    getStats,
    getRules,
  };
})();

if (typeof window !== "undefined") {
  window.LintEngine = LintEngine;
}
