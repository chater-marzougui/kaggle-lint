/**
 * Undefined Variables Rule
 * Detects usage of variables that haven't been defined
 * Supports cross-cell context sharing for Jupyter notebooks
 */

const UndefinedVariablesRule = (function () {
  "use strict";

  // Accumulated context from previous cells (for cross-cell variable tracking)
  let accumulatedContext = new Set();

  const PYTHON_BUILTINS = new Set([
    "abs",
    "all",
    "any",
    "ascii",
    "bin",
    "bool",
    "bytearray",
    "bytes",
    "callable",
    "chr",
    "classmethod",
    "compile",
    "complex",
    "delattr",
    "dict",
    "dir",
    "divmod",
    "enumerate",
    "eval",
    "exec",
    "filter",
    "float",
    "format",
    "frozenset",
    "getattr",
    "globals",
    "hasattr",
    "hash",
    "help",
    "hex",
    "id",
    "input",
    "int",
    "isinstance",
    "issubclass",
    "iter",
    "len",
    "list",
    "locals",
    "map",
    "max",
    "memoryview",
    "min",
    "next",
    "object",
    "oct",
    "open",
    "ord",
    "pow",
    "print",
    "property",
    "range",
    "repr",
    "reversed",
    "round",
    "set",
    "setattr",
    "slice",
    "sorted",
    "staticmethod",
    "str",
    "sum",
    "super",
    "tuple",
    "type",
    "vars",
    "zip",
    "__import__",
    "__name__",
    "__doc__",
    "__package__",
    "__loader__",
    "__spec__",
    "__annotations__",
    "__builtins__",
    "__file__",
    "__cached__",
    "True",
    "False",
    "None",
    "Ellipsis",
    "NotImplemented",
    "Exception",
    "BaseException",
    "ValueError",
    "TypeError",
    "KeyError",
    "IndexError",
    "AttributeError",
    "ImportError",
    "RuntimeError",
    "StopIteration",
    "GeneratorExit",
    "AssertionError",
    "ArithmeticError",
    "OverflowError",
    "ZeroDivisionError",
    "FloatingPointError",
    "OSError",
    "IOError",
    "FileNotFoundError",
    "PermissionError",
    "ConnectionError",
    "TimeoutError",
    "NameError",
    "UnboundLocalError",
    "SyntaxError",
    "IndentationError",
    "TabError",
    "SystemError",
    "RecursionError",
    "MemoryError",
    "Warning",
    "UserWarning",
    "DeprecationWarning",
    "PendingDeprecationWarning",
    "RuntimeWarning",
    "SyntaxWarning",
    "ResourceWarning",
    "FutureWarning",
    "ImportWarning",
    "UnicodeWarning",
    "BytesWarning",
    "EncodingWarning",
  ]);

  const COMMON_LIBRARIES = new Set([
    "pd",
    "np",
    "plt",
    "sns",
    "tf",
    "torch",
    "sklearn",
    "scipy",
    "cv2",
    "PIL",
    "os",
    "sys",
    "re",
    "json",
    "csv",
    "math",
    "random",
    "datetime",
    "time",
    "collections",
    "itertools",
    "functools",
    "pathlib",
    "glob",
    "shutil",
    "pickle",
    "warnings",
    "logging",
    "tqdm",
    "requests",
    "bs4",
    "selenium",
    "keras",
    "xgboost",
    "lightgbm",
    "catboost",
    "gc",
    "copy",
    "io",
    "struct",
    "typing",
    "subprocess",
    "threading",
    "multiprocessing",
    "queue",
    "asyncio",
  ]);

  /**
   * Checks if a cell should be skipped entirely (magic commands like %%capture)
   * @param {string} code - Python source code
   * @returns {boolean}
   */
  function shouldSkipCell(code) {
    const lines = code.split("\n");
    // Check if the first non-empty line is a Jupyter magic command
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      // Skip cells starting with %%capture or other cell magic commands
      if (trimmed.startsWith("%%")) {
        return true;
      }
      break;
    }
    return false;
  }

  /**
   * Checks if a line is a shell command (starts with !)
   * @param {string} line - Line of code
   * @returns {boolean}
   */
  function isShellCommand(line) {
    return /^\s*!/.test(line);
  }

  /**
   * Checks if a line is a Jupyter magic command (starts with % or %%)
   * @param {string} line - Line of code
   * @returns {boolean}
   */
  function isMagicCommand(line) {
    return /^\s*%%?[a-zA-Z]/.test(line);
  }

  /**
   * Removes all string literals from code while preserving line structure
   * This handles multi-line strings (triple quotes) and f-strings properly
   * @param {string} code - Python source code
   * @returns {string} Code with strings replaced by placeholders
   */
  function removeAllStrings(code) {
    let result = code;

    // Remove triple-quoted strings (multi-line) first - both """ and '''
    // Match optional f/r/b prefix, triple quotes, content, triple quotes
    result = result.replace(/[fFrRbBuU]?"""[\s\S]*?"""/g, (match) => {
      // Replace with empty string but preserve newlines for line numbers
      const newlines = (match.match(/\n/g) || []).length;
      return '""' + "\n".repeat(newlines);
    });

    result = result.replace(/[fFrRbBuU]?'''[\s\S]*?'''/g, (match) => {
      const newlines = (match.match(/\n/g) || []).length;
      return "''" + "\n".repeat(newlines);
    });

    // Remove single-line strings (both single and double quotes)
    // This handles f-strings, r-strings, etc.
    result = result.replace(/[fFrRbBuU]?(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');

    return result;
  }

  /**
   * Extracts all defined names from Python code
   * @param {string} code - Python source code
   * @returns {Set<string>} Set of defined names
   */
  function extractDefinedNames(code) {
    const defined = new Set();

    // Remove strings first to avoid false positives
    const cleanedCode = removeAllStrings(code);
    const lines = cleanedCode.split("\n");

    lines.forEach((line, idx) => {
      // Skip shell commands and magic commands
      if (isShellCommand(line) || isMagicCommand(line)) {
        return;
      }

      let match;

      match = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/.exec(line);
      if (match) {
        defined.add(match[1]);
        const params = match[2].split(",");
        params.forEach((param) => {
          const paramName = param.split("=")[0].split(":")[0].trim();
          if (paramName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
            if (paramName !== "self" && paramName !== "cls") {
              defined.add(paramName);
            }
          }
        });
      }

      match = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(line);
      if (match) {
        defined.add(match[1]);
      }

      match =
        /^\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s*=(?!=)/.exec(
          line
        );
      if (match && !/^\s*(if|while|for|with|except|elif)/.test(line)) {
        const names = match[1].split(",").map((n) => n.trim());
        names.forEach((name) => {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            defined.add(name);
          }
        });
      }

      match =
        /^\s*for\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s+in\s+/.exec(
          line
        );
      if (match) {
        const names = match[1].split(",").map((n) => n.trim());
        names.forEach((name) => {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            defined.add(name);
          }
        });
      }

      match = /^\s*with\s+.+\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(line);
      if (match) {
        defined.add(match[1]);
      }

      match = /^\s*except\s+\w+\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(line);
      if (match) {
        defined.add(match[1]);
      }

      match =
        /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?/.exec(
          line
        );
      if (match) {
        defined.add(match[2] || match[1].split(".")[0]);
      }

      match = /^\s*from\s+\S+\s+import\s+(.+)/.exec(line);
      if (match) {
        const imports = match[1].split(",");
        imports.forEach((imp) => {
          const asMatch = /(\S+)\s+as\s+(\S+)/.exec(imp.trim());
          if (asMatch) {
            defined.add(asMatch[2]);
          } else {
            const name = imp.trim().split(" ")[0];
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name !== "*") {
              defined.add(name);
            }
          }
        });
      }

      const lambdaMatch = /lambda\s+([^:]+):/.exec(line);
      if (lambdaMatch) {
        const params = lambdaMatch[1].split(",");
        params.forEach((param) => {
          const paramName = param.split("=")[0].trim();
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
            defined.add(paramName);
          }
        });
      }

      const listCompMatch =
        /\[.+\s+for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+/.exec(line);
      if (listCompMatch) {
        defined.add(listCompMatch[1]);
      }
    });

    return defined;
  }

  /**
   * Extracts used variable names from Python code
   * @param {string} code - Python source code
   * @returns {Array<{name: string, line: number}>}
   */
  function extractUsedNames(code) {
    const used = [];

    // Remove all strings first (including multi-line strings and f-strings)
    const cleanedCode = removeAllStrings(code);
    const lines = cleanedCode.split("\n");

    lines.forEach((line, lineIndex) => {
      // Skip comments
      if (/^\s*#/.test(line)) {
        return;
      }

      // Skip shell commands (!)
      if (isShellCommand(line)) {
        return;
      }

      // Skip magic commands (% or %%)
      if (isMagicCommand(line)) {
        return;
      }

      // Skip import statements entirely (they don't use variables, they define them)
      if (/^\s*(import|from)\s+/.test(line)) {
        return;
      }

      // Remove comments from the line
      let processedLine = line.replace(/#.*$/, "");

      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let match;

      while ((match = identifierPattern.exec(processedLine)) !== null) {
        const name = match[1];
        const beforeChar = processedLine[match.index - 1];

        // Skip attributes (preceded by '.')
        if (beforeChar === ".") {
          continue;
        }

        // Skip keyword arguments (name followed by '=' without '==' in function call context)
        const afterMatch = processedLine.substring(match.index + name.length);
        if (/^\s*=(?!=)/.test(afterMatch)) {
          // Check if we're in a function call context (has open paren before)
          const beforePart = processedLine.substring(0, match.index);
          const openParens = (beforePart.match(/\(/g) || []).length;
          const closeParens = (beforePart.match(/\)/g) || []).length;
          if (openParens > closeParens) {
            // We're inside parentheses, this is likely a keyword argument
            continue;
          }
        }

        const keywords = new Set([
          "and",
          "as",
          "assert",
          "async",
          "await",
          "break",
          "class",
          "continue",
          "def",
          "del",
          "elif",
          "else",
          "except",
          "finally",
          "for",
          "from",
          "global",
          "if",
          "import",
          "in",
          "is",
          "lambda",
          "nonlocal",
          "not",
          "or",
          "pass",
          "raise",
          "return",
          "try",
          "while",
          "with",
          "yield",
        ]);

        if (!keywords.has(name)) {
          used.push({ name, line: lineIndex + 1 });
        }
      }
    });

    return used;
  }

  /**
   * Runs the undefined variables rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @param {Object} options - Additional options
   * @param {Set<string>} options.previousContext - Names defined in previous cells
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0, options = {}) {
    const errors = [];

    // Skip cells that start with magic commands like %%capture
    if (shouldSkipCell(code)) {
      // Still extract defined names to pass to next cells
      const defined = extractDefinedNames(code);
      return { errors: [], definedNames: defined };
    }

    const defined = extractDefinedNames(code);
    const used = extractUsedNames(code);

    // Get context from previous cells if available
    const previousContext = options.previousContext || new Set();

    const allKnown = new Set([
      ...PYTHON_BUILTINS,
      ...COMMON_LIBRARIES,
      ...defined,
      ...previousContext,
    ]);

    const reported = new Set();

    used.forEach(({ name, line }) => {
      const key = `${name}:${line}`;
      if (!allKnown.has(name) && !reported.has(key)) {
        errors.push({
          line: line + cellOffset,
          msg: `Undefined variable '${name}'`,
          severity: "error",
        });
        reported.add(key);
      }
    });

    // Return both errors and defined names for context accumulation
    return { errors, definedNames: defined };
  }

  /**
   * Reset accumulated context (call at start of notebook linting)
   */
  function resetContext() {
    accumulatedContext = new Set();
  }

  /**
   * Get current accumulated context
   * @returns {Set<string>}
   */
  function getAccumulatedContext() {
    return new Set(accumulatedContext);
  }

  /**
   * Add names to accumulated context
   * @param {Set<string>} names - Names to add
   */
  function addToContext(names) {
    names.forEach((name) => accumulatedContext.add(name));
  }

  return {
    run,
    extractDefinedNames,
    extractUsedNames,
    resetContext,
    getAccumulatedContext,
    addToContext,
    shouldSkipCell,
    removeAllStrings, // Exposed for testing
  };
})();

if (typeof window !== "undefined") {
  window.UndefinedVariablesRule = UndefinedVariablesRule;
}
