/**
 * Undefined Variables Rule
 * Detects usage of variables that haven't been defined
 */

const UndefinedVariablesRule = (function () {
  "use strict";

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
   * Extracts all defined names from Python code
   * @param {string} code - Python source code
   * @returns {Set<string>} Set of defined names
   */
  function extractDefinedNames(code) {
    const defined = new Set();
    const lines = code.split("\n");

    lines.forEach((line, idx) => {
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
    const lines = code.split("\n");

    lines.forEach((line, lineIndex) => {
      if (/^\s*#/.test(line)) {
        return;
      }

      line = line.replace(/#.*$/, "");
      line = line.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '""');
      line = line.replace(/"""[\s\S]*?"""/g, '""');
      line = line.replace(/'''[\s\S]*?'''/g, '""');

      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let match;

      while ((match = identifierPattern.exec(line)) !== null) {
        const name = match[1];
        const beforeChar = line[match.index - 1];
        if (beforeChar === ".") {
          continue;
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
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const defined = extractDefinedNames(code);
    const used = extractUsedNames(code);

    const allKnown = new Set([
      ...PYTHON_BUILTINS,
      ...COMMON_LIBRARIES,
      ...defined,
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

    return errors;
  }

  return { run, extractDefinedNames, extractUsedNames };
})();

if (typeof window !== "undefined") {
  window.UndefinedVariablesRule = UndefinedVariablesRule;
}
