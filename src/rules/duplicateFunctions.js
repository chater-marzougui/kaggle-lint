/**
 * Duplicate Function Names Rule
 * Detects functions with the same name defined multiple times
 */

const DuplicateFunctionsRule = (function () {
  "use strict";

  /**
   * Extracts function and class definitions with their line numbers
   * @param {string} code - Python source code
   * @returns {Array<{name: string, line: number, type: string}>}
   */
  function extractDefinitions(code) {
    const definitions = [];
    const lines = code.split("\n");

    lines.forEach((line, lineIndex) => {
      let match = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (match) {
        definitions.push({
          name: match[1],
          line: lineIndex + 1,
          type: "function",
        });
      }

      match = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(:]/.exec(line);
      if (match) {
        definitions.push({
          name: match[1],
          line: lineIndex + 1,
          type: "class",
        });
      }

      match = /^\s*async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (match) {
        definitions.push({
          name: match[1],
          line: lineIndex + 1,
          type: "async function",
        });
      }
    });

    return definitions;
  }

  /**
   * Runs the duplicate functions rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const definitions = extractDefinitions(code);

    const nameMap = new Map();

    definitions.forEach((def) => {
      if (!nameMap.has(def.name)) {
        nameMap.set(def.name, []);
      }
      nameMap.get(def.name).push(def);
    });

    nameMap.forEach((defs, name) => {
      if (defs.length > 1) {
        defs.slice(1).forEach((def) => {
          const firstDef = defs[0];
          errors.push({
            line: def.line + cellOffset,
            msg: `Duplicate ${def.type} name '${name}' (first defined at line ${
              firstDef.line + cellOffset
            })`,
            severity: "warning",
          });
        });
      }
    });

    return errors;
  }

  return { run };
})();

if (typeof window !== "undefined") {
  window.DuplicateFunctionsRule = DuplicateFunctionsRule;
}
