/**
 * Lint Engine
 * Orchestrates running all lint rules and collecting results
 * Supports cross-cell context sharing for Jupyter notebooks
 */

const LintEngine = (function () {
  "use strict";

  const rules = [];

  // Rules that support context sharing
  const CONTEXT_AWARE_RULES = new Set(["undefinedVariables"]);

  /**
   * Registers a lint rule
   * @param {string} name - Rule name
   * @param {Object} ruleModule - Rule module with run function
   */
  function registerRule(name, ruleModule) {
    rules.push({ name, module: ruleModule, run: ruleModule.run });
  }

  /**
   * Initializes all built-in rules
   */
  function initializeRules() {
    // Clear existing rules to prevent duplicates on re-initialization
    rules.length = 0;
    
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
   * @param {Object} context - Cross-cell context (accumulated definitions)
   * @returns {{errors: Array, newContext: Set}} Errors and new definitions for context
   */
  function lintCell(code, cellOffset = 0, cellIndex = 0, context = {}) {
    const allErrors = [];
    let cellDefinedNames = new Set();

    rules.forEach(({ name, module, run }) => {
      try {
        let result;

        if (name === "emptyCells") {
          result = run(code, cellOffset, cellIndex);
        } else if (CONTEXT_AWARE_RULES.has(name)) {
          // Pass context to context-aware rules
          result = run(code, cellOffset, { previousContext: context.definedNames || new Set() });
        } else {
          result = run(code, cellOffset);
        }

        // Handle both old format (array) and new format (object with errors and definedNames)
        let errors;
        if (Array.isArray(result)) {
          errors = result;
        } else if (result && typeof result === 'object') {
          errors = result.errors || [];
          // Collect defined names for context accumulation
          if (result.definedNames) {
            result.definedNames.forEach((name) => cellDefinedNames.add(name));
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
          e.message
        );
      }
    });

    return { errors: allErrors, newContext: cellDefinedNames };
  }

  /**
   * Runs all rules on multiple cells with cross-cell context sharing
   * @param {Array<{code: string, element: Element, cellIndex: number}>} cells
   * @returns {Array<{line: number, msg: string, severity: string, rule: string, cellIndex: number, element: Element}>}
   */
  function lintNotebook(cells) {
    const allErrors = [];
    let lineOffset = 0;

    // Accumulated context across cells (variables, functions, imports defined in previous cells)
    let accumulatedContext = {
      definedNames: new Set(),
    };

    // Reset context in context-aware rules
    rules.forEach(({ name, module }) => {
      if (CONTEXT_AWARE_RULES.has(name) && module.resetContext) {
        module.resetContext();
      }
    });

    cells.forEach((cell) => {
      const { errors, newContext } = lintCell(
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
      newContext.forEach((name) => accumulatedContext.definedNames.add(name));

      // Also extract definitions from this cell for context
      // (in case some rules don't return definedNames)
      if (typeof UndefinedVariablesRule !== "undefined") {
        const additionalNames = UndefinedVariablesRule.extractDefinedNames(cell.code);
        additionalNames.forEach((name) => accumulatedContext.definedNames.add(name));
      }

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

  /**
   * Convenience function to lint a single piece of code
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset
   * @returns {Array} Array of errors
   */
  function lintCode(code, cellOffset = 0) {
    const { errors } = lintCell(code, cellOffset, 0, {});
    return errors;
  }

  return {
    registerRule,
    initializeRules,
    lintCell,
    lintCode,
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
