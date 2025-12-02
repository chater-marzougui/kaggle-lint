/**
 * Import Issues Rule
 * Detects problematic import patterns
 */

const ImportIssuesRule = (function () {
  "use strict";

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
   * Runs the import issues rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const lines = code.split("\n");
    const imports = [];
    let firstNonImportLine = -1;
    let lastImportLine = -1;

    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();

      // Skip empty lines, comments, shell commands, and magic commands
      if (trimmedLine === "" || trimmedLine.startsWith("#")) {
        return;
      }
      if (isShellCommand(line) || isMagicCommand(line)) {
        return;
      }

      const isImport = /^(import\s+|from\s+\S+\s+import\s+)/.test(trimmedLine);

      if (isImport) {
        imports.push({ line: lineIndex + 1, content: trimmedLine });
        lastImportLine = lineIndex + 1;
      } else if (firstNonImportLine === -1 && !isImport) {
        firstNonImportLine = lineIndex + 1;
      }
    });

    if (firstNonImportLine !== -1 && lastImportLine > firstNonImportLine) {
      imports.forEach((imp) => {
        if (imp.line > firstNonImportLine) {
          errors.push({
            line: imp.line + cellOffset,
            msg: "Import statement should be at the top of the file/cell",
            severity: "info",
          });
        }
      });
    }

    lines.forEach((line, lineIndex) => {
      // Skip shell commands and magic commands
      if (isShellCommand(line) || isMagicCommand(line)) {
        return;
      }
      if (/^\s*from\s+\S+\s+import\s+\*/.test(line)) {
        errors.push({
          line: lineIndex + 1 + cellOffset,
          msg: "Wildcard import 'from X import *' is discouraged",
          severity: "warning",
        });
      }
    });

    const importedNames = new Map();

    lines.forEach((line, lineIndex) => {
      // Skip shell commands and magic commands
      if (isShellCommand(line) || isMagicCommand(line)) {
        return;
      }

      let match;

      match =
        /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?/.exec(
          line
        );
      if (match) {
        const name = match[2] || match[1];
        if (importedNames.has(name)) {
          errors.push({
            line: lineIndex + 1 + cellOffset,
            msg: `Duplicate import of '${name}' (first imported at line ${
              importedNames.get(name) + cellOffset
            })`,
            severity: "warning",
          });
        } else {
          importedNames.set(name, lineIndex + 1);
        }
      }

      match = /^\s*from\s+\S+\s+import\s+(.+)/.exec(line);
      if (match && !match[1].trim().startsWith("*")) {
        const importList = match[1].replace(/\(|\)/g, "").split(",");
        importList.forEach((imp) => {
          const asMatch = /(\S+)\s+as\s+(\S+)/.exec(imp.trim());
          const name = asMatch ? asMatch[2] : imp.trim().split(" ")[0];

          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            if (importedNames.has(name)) {
              errors.push({
                line: lineIndex + 1 + cellOffset,
                msg: `Duplicate import of '${name}' (first imported at line ${
                  importedNames.get(name) + cellOffset
                })`,
                severity: "warning",
              });
            } else {
              importedNames.set(name, lineIndex + 1);
            }
          }
        });
      }
    });

    const usedNames = new Set();
    lines.forEach((line, lineIndex) => {
      // Skip shell commands and magic commands for usage detection
      if (isShellCommand(line) || isMagicCommand(line)) {
        return;
      }
      if (/^\s*(import|from)\s+/.test(line)) {
        return;
      }

      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let identMatch;
      while ((identMatch = identifierPattern.exec(line)) !== null) {
        usedNames.add(identMatch[1]);
      }
    });

    importedNames.forEach((line, name) => {
      if (!usedNames.has(name)) {
        errors.push({
          line: line + cellOffset,
          msg: `Imported '${name}' is unused`,
          severity: "info",
        });
      }
    });

    return errors;
  }

  return { run };
})();

if (typeof window !== "undefined") {
  window.ImportIssuesRule = ImportIssuesRule;
}
