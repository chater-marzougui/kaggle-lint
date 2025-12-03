/**
 * Smart Linter - Whole Notebook Analysis Mode
 * Analyzes the entire notebook as a cohesive Python file for better context-aware linting
 * This provides smarter detection of cross-cell dependencies and issues
 */

const SmartLinter = (function () {
  "use strict";

  /**
   * Combines all code cells into a single Python file string
   * @param {Array<{code: string, cellIndex: number}>} cells - Array of code cells
   * @returns {{combinedCode: string, cellOffsets: Array<{cellIndex: number, startLine: number, endLine: number}>}}
   */
  function combineNotebook(cells) {
    let combinedCode = "";
    const cellOffsets = [];
    let currentLine = 1;

    cells.forEach((cell, idx) => {
      const startLine = currentLine;
      const lines = cell.code.split("\n");
      const lineCount = lines.length;

      // Add cell code
      combinedCode += cell.code;

      // Track cell boundaries
      cellOffsets.push({
        cellIndex: cell.cellIndex,
        startLine: startLine,
        endLine: startLine + lineCount - 1,
        originalCellIdx: idx
      });

      currentLine = startLine + lineCount;

      // Add newline between cells if not the last cell
      if (idx < cells.length - 1 && !cell.code.endsWith("\n")) {
        combinedCode += "\n";
      }
    });

    return { combinedCode, cellOffsets };
  }

  /**
   * Maps a global line number back to cell-specific line
   * @param {number} globalLine - Line number in combined code
   * @param {Array} cellOffsets - Cell offset information
   * @returns {{cellIndex: number, cellLine: number}|null}
   */
  function mapLineToCell(globalLine, cellOffsets) {
    for (const offset of cellOffsets) {
      if (globalLine >= offset.startLine && globalLine <= offset.endLine) {
        return {
          cellIndex: offset.cellIndex,
          cellLine: globalLine - offset.startLine + 1
        };
      }
    }
    return null;
  }

  /**
   * Find the cell index from cellOffsets array by originalCellIdx
   * @param {number} originalIdx - The original cell index in the cellOffsets array
   * @param {Array} cellOffsets - Cell offset information
   * @returns {number}
   */
  function findOriginalCellIndex(originalIdx, cellOffsets) {
    if (originalIdx >= 0 && originalIdx < cellOffsets.length) {
      return cellOffsets[originalIdx].cellIndex;
    }
    return originalIdx;
  }

  /**
   * Runs smart linting on the entire notebook
   * @param {Array<{code: string, cellIndex: number, element: Element}>} cells - Code cells
   * @returns {Array} - Array of errors with cell mapping
   */
  function lintNotebook(cells) {
    if (!cells || cells.length === 0) {
      return [];
    }

    const { combinedCode, cellOffsets } = combineNotebook(cells);
    const allErrors = [];

    // Run rules that benefit from whole-notebook analysis on combined code
    const combinedRules = [
      { name: "capitalizationTypos", rule: typeof CapitalizationTyposRule !== "undefined" ? CapitalizationTyposRule : null },
      { name: "duplicateFunctions", rule: typeof DuplicateFunctionsRule !== "undefined" ? DuplicateFunctionsRule : null },
      { name: "importIssues", rule: typeof ImportIssuesRule !== "undefined" ? ImportIssuesRule : null },
      { name: "indentationErrors", rule: typeof IndentationErrorsRule !== "undefined" ? IndentationErrorsRule : null },
      { name: "unclosedBrackets", rule: typeof UnclosedBracketsRule !== "undefined" ? UnclosedBracketsRule : null },
      { name: "redefinedVariables", rule: typeof RedefinedVariablesRule !== "undefined" ? RedefinedVariablesRule : null },
      { name: "missingReturn", rule: typeof MissingReturnRule !== "undefined" ? MissingReturnRule : null }
    ];

    combinedRules.forEach(({ name, rule }) => {
      if (!rule) return;

      try {
        const errors = rule.run(combinedCode, 0);
        errors.forEach((error) => {
          // Map global line to cell
          const cellMapping = mapLineToCell(error.line, cellOffsets);
          if (cellMapping) {
            allErrors.push({
              ...error,
              rule: name,
              cellIndex: cellMapping.cellIndex,
              cellLine: cellMapping.cellLine,
              element: cells.find(c => c.cellIndex === cellMapping.cellIndex)?.element || null
            });
          }
        });
      } catch (e) {
        console.error(`Error running smart rule '${name}':`, e.message);
      }
    });

    // Run undefined variables rule with full notebook context
    if (typeof UndefinedVariablesRule !== "undefined") {
      try {
        // Build accumulated context from all cells first
        const allDefinedNames = new Set();
        
        // Extract all definitions from the entire notebook
        cells.forEach((cell) => {
          const names = UndefinedVariablesRule.extractDefinedNames(cell.code);
          names.forEach(name => allDefinedNames.add(name));
        });

        // Now run the rule on each cell with full context
        let lineOffset = 0;
        cells.forEach((cell, idx) => {
          const result = UndefinedVariablesRule.run(cell.code, lineOffset, {
            previousContext: allDefinedNames
          });

          const errors = Array.isArray(result) ? result : (result.errors || []);
          
          errors.forEach((error) => {
            allErrors.push({
              ...error,
              rule: "undefinedVariables",
              cellIndex: cell.cellIndex,
              cellLine: error.line - lineOffset,
              element: cell.element
            });
          });

          lineOffset += cell.code.split("\n").length;
        });
      } catch (e) {
        console.error("Error running undefinedVariables rule:", e.message);
      }
    }

    // Run empty cells check on individual cells
    cells.forEach((cell) => {
      if (typeof EmptyCellsRule !== "undefined") {
        const errors = EmptyCellsRule.run(cell.code, 0, cell.cellIndex);
        errors.forEach((error) => {
          allErrors.push({
            ...error,
            rule: "emptyCells",
            cellIndex: cell.cellIndex,
            cellLine: 1,
            element: cell.element
          });
        });
      }
    });

    return allErrors;
  }

  /**
   * Check if an identifier is a known library or built-in
   */
  function isKnownIdentifier(name) {
    const knownLibraries = new Set([
      "pd", "np", "plt", "sns", "tf", "torch", "sklearn", "scipy",
      "os", "sys", "re", "json", "math", "random", "datetime", "time",
      "pathlib", "collections", "itertools", "functools", "typing",
      "cv2", "PIL", "Image", "requests", "urllib", "socket", "threading",
      "multiprocessing", "subprocess", "shutil", "glob", "pickle", "csv",
      "warnings", "logging", "argparse", "copy", "gc", "inspect",
      "transformers", "datasets", "accelerate", "tqdm", "wandb", "mlflow"
    ]);

    const builtins = new Set([
      "abs", "all", "any", "ascii", "bin", "bool", "bytearray", "bytes",
      "callable", "chr", "classmethod", "compile", "complex", "delattr",
      "dict", "dir", "divmod", "enumerate", "eval", "exec", "filter",
      "float", "format", "frozenset", "getattr", "globals", "hasattr",
      "hash", "help", "hex", "id", "input", "int", "isinstance", "issubclass",
      "iter", "len", "list", "locals", "map", "max", "memoryview", "min",
      "next", "object", "oct", "open", "ord", "pow", "print", "property",
      "range", "repr", "reversed", "round", "set", "setattr", "slice",
      "sorted", "staticmethod", "str", "sum", "super", "tuple", "type",
      "vars", "zip", "Exception", "BaseException", "ValueError", "TypeError",
      "KeyError", "IndexError", "AttributeError", "ImportError", "RuntimeError",
      "StopIteration", "FileNotFoundError", "ZeroDivisionError"
    ]);

    return knownLibraries.has(name) || builtins.has(name);
  }

  return {
    combineNotebook,
    mapLineToCell,
    lintNotebook,
    isKnownIdentifier
  };
})();

if (typeof window !== "undefined") {
  window.SmartLinter = SmartLinter;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SmartLinter;
}

