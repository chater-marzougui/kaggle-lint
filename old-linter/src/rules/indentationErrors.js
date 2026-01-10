/**
 * Indentation Errors Rule
 * Detects Python indentation issues
 * Handles multi-line statements (unclosed brackets, backslash continuation)
 */

const IndentationErrorsRule = (function () {
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
   * Counts unclosed brackets in a line (ignoring brackets in strings/comments)
   * @param {string} line - Line of code
   * @returns {number} Net bracket count (positive = unclosed opening brackets)
   */
  function countUnclosedBrackets(line) {
    // Remove strings and comments first
    let cleaned = line.replace(/#.*$/, "");
    cleaned = cleaned.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, "");
    cleaned = cleaned.replace(/"""[\s\S]*?"""/g, "");
    cleaned = cleaned.replace(/'''[\s\S]*?'''/g, "");

    let count = 0;
    for (const char of cleaned) {
      if (char === "(" || char === "[" || char === "{") {
        count++;
      } else if (char === ")" || char === "]" || char === "}") {
        count--;
      }
    }
    return count;
  }

  /**
   * Checks if a line ends with a line continuation (backslash)
   * @param {string} line - Line of code
   * @returns {boolean}
   */
  function endsWithContinuation(line) {
    // Remove comments first
    const withoutComments = line.replace(/#.*$/, "");
    return withoutComments.trimEnd().endsWith("\\");
  }

  /**
   * Runs the indentation errors rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const lines = code.split("\n");

    let usesTabs = false;
    let usesSpaces = false;
    let expectedIndent = 0;
    let indentStack = [0];
    let expectIndent = false;
    let prevLineEndsWithColon = false;
    
    // Track multi-line statement state
    let unclosedBracketCount = 0;
    let inContinuation = false;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      // Skip empty lines and comments
      if (line.trim() === "" || line.trim().startsWith("#")) {
        return;
      }

      // Skip shell commands and magic commands
      if (isShellCommand(line) || isMagicCommand(line)) {
        return;
      }

      const leadingWhitespace = line.match(/^(\s*)/)[1];

      const hasTabs = /\t/.test(leadingWhitespace);
      const hasSpaces = / /.test(leadingWhitespace);

      if (hasTabs && hasSpaces) {
        errors.push({
          line: lineNum + cellOffset,
          msg: "Mixed tabs and spaces in indentation",
          severity: "error",
        });
      }

      if (hasTabs) {
        usesTabs = true;
      }
      if (hasSpaces) {
        usesSpaces = true;
      }

      if (usesTabs && usesSpaces && (hasTabs || hasSpaces)) {
        if (hasTabs && usesSpaces && !hasSpaces) {
          errors.push({
            line: lineNum + cellOffset,
            msg: "Inconsistent indentation: file uses spaces elsewhere but this line uses tabs",
            severity: "warning",
          });
        } else if (hasSpaces && usesTabs && !hasTabs) {
          errors.push({
            line: lineNum + cellOffset,
            msg: "Inconsistent indentation: file uses tabs elsewhere but this line uses spaces",
            severity: "warning",
          });
        }
      }

      const indentLevel = leadingWhitespace.replace(/\t/g, "    ").length;

      // If we're inside a multi-line statement (unclosed brackets or continuation),
      // skip indentation checking for this line
      if (unclosedBracketCount > 0 || inContinuation) {
        // Update bracket count for this line
        unclosedBracketCount += countUnclosedBrackets(line);
        // Update continuation state
        inContinuation = endsWithContinuation(line);
        // Don't check indentation for continuation lines
        prevLineEndsWithColon = /:\s*(#.*)?$/.test(line.trim());
        return;
      }

      if (prevLineEndsWithColon) {
        const prevIndent = indentStack[indentStack.length - 1];
        if (indentLevel <= prevIndent) {
          errors.push({
            line: lineNum + cellOffset,
            msg: "Expected indented block after colon",
            severity: "error",
          });
        } else {
          indentStack.push(indentLevel);
        }
        expectIndent = false;
      } else {
        const currentIndent = indentStack[indentStack.length - 1];

        if (indentLevel > currentIndent) {
          errors.push({
            line: lineNum + cellOffset,
            msg: "Unexpected indent",
            severity: "error",
          });
          indentStack.push(indentLevel);
        } else if (indentLevel < currentIndent) {
          while (
            indentStack.length > 1 &&
            indentStack[indentStack.length - 1] > indentLevel
          ) {
            indentStack.pop();
          }

          if (indentStack[indentStack.length - 1] !== indentLevel) {
            const validIndents = indentStack.map((i) => `${i}`).join(", ");
            errors.push({
              line: lineNum + cellOffset,
              msg: `Unindent does not match any outer indentation level`,
              severity: "error",
            });
          }
        }
      }

      // Check for colon at end of line (for next iteration)
      prevLineEndsWithColon = /:\s*(#.*)?$/.test(line.trim());
      
      // Update multi-line statement tracking
      unclosedBracketCount += countUnclosedBrackets(line);
      inContinuation = endsWithContinuation(line);

      if (hasSpaces) {
        const spaceCount = leadingWhitespace.replace(/\t/g, "").length;
        if (spaceCount > 0 && spaceCount % 4 !== 0 && spaceCount % 2 !== 0) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Inconsistent indentation: ${spaceCount} spaces (expected multiple of 2 or 4)`,
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
  window.IndentationErrorsRule = IndentationErrorsRule;
}
