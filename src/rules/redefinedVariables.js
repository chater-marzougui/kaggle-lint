/**
 * Redefined Variables Rule
 * Detects variables that are redefined in a potentially problematic way
 */

const RedefinedVariablesRule = (function () {
  "use strict";

  const BUILTIN_NAMES = new Set([
    "list",
    "dict",
    "set",
    "tuple",
    "str",
    "int",
    "float",
    "bool",
    "type",
    "object",
    "len",
    "range",
    "print",
    "input",
    "open",
    "file",
    "id",
    "hash",
    "map",
    "filter",
    "zip",
    "enumerate",
    "sorted",
    "reversed",
    "sum",
    "min",
    "max",
    "abs",
    "round",
    "all",
    "any",
    "format",
    "repr",
    "ascii",
    "chr",
    "ord",
    "bin",
    "oct",
    "hex",
    "iter",
    "next",
    "slice",
    "super",
    "classmethod",
    "staticmethod",
    "property",
    "getattr",
    "setattr",
    "hasattr",
    "delattr",
    "isinstance",
    "issubclass",
    "callable",
    "compile",
    "eval",
    "exec",
    "globals",
    "locals",
    "vars",
    "dir",
    "help",
    "memoryview",
    "bytearray",
    "bytes",
    "complex",
    "divmod",
    "pow",
    "frozenset",
  ]);

  /**
   * Runs the redefined variables rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const lines = code.split("\n");

    const definitions = new Map();

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      if (/^\s*#/.test(line)) {
        return;
      }

      let match = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/.exec(line);
      if (match) {
        const name = match[1];

        if (BUILTIN_NAMES.has(name)) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Redefining built-in name '${name}'`,
            severity: "warning",
          });
        }

        if (!definitions.has(name)) {
          definitions.set(name, []);
        }
        definitions.get(name).push({
          line: lineNum,
          type: "assignment",
        });
      }

      match = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (match) {
        const name = match[1];

        if (BUILTIN_NAMES.has(name)) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Function name '${name}' shadows built-in`,
            severity: "warning",
          });
        }

        if (definitions.has(name)) {
          const prevDefs = definitions.get(name);
          const varDefs = prevDefs.filter((d) => d.type === "assignment");
          if (varDefs.length > 0) {
            errors.push({
              line: lineNum + cellOffset,
              msg: `Function '${name}' redefines variable (previously at line ${
                varDefs[0].line + cellOffset
              })`,
              severity: "warning",
            });
          }
        }

        if (!definitions.has(name)) {
          definitions.set(name, []);
        }
        definitions.get(name).push({
          line: lineNum,
          type: "function",
        });
      }

      match = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(line);
      if (match) {
        const name = match[1];

        if (BUILTIN_NAMES.has(name)) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Class name '${name}' shadows built-in`,
            severity: "warning",
          });
        }

        if (definitions.has(name)) {
          const prevDefs = definitions.get(name);
          const varDefs = prevDefs.filter((d) => d.type === "assignment");
          if (varDefs.length > 0) {
            errors.push({
              line: lineNum + cellOffset,
              msg: `Class '${name}' redefines variable (previously at line ${
                varDefs[0].line + cellOffset
              })`,
              severity: "warning",
            });
          }
        }

        if (!definitions.has(name)) {
          definitions.set(name, []);
        }
        definitions.get(name).push({
          line: lineNum,
          type: "class",
        });
      }

      match = /^\s*for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+/.exec(line);
      if (match) {
        const name = match[1];

        if (BUILTIN_NAMES.has(name)) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Loop variable '${name}' shadows built-in`,
            severity: "warning",
          });
        }
      }
    });

    return errors;
  }

  return { run };
})();

if (typeof window !== "undefined") {
  window.RedefinedVariablesRule = RedefinedVariablesRule;
}
