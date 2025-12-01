/**
 * Indentation Errors Rule
 * Detects Python indentation issues
 */

const IndentationErrorsRule = (function () {
  'use strict';

  /**
   * Runs the indentation errors rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const lines = code.split('\n');

    let usesTabs = false;
    let usesSpaces = false;
    let expectedIndent = 0;
    let indentStack = [0];
    let expectIndent = false;
    let prevLineEndsWithColon = false;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      if (line.trim() === '' || line.trim().startsWith('#')) {
        return;
      }

      const leadingWhitespace = line.match(/^(\s*)/)[1];

      const hasTabs = /\t/.test(leadingWhitespace);
      const hasSpaces = / /.test(leadingWhitespace);

      if (hasTabs && hasSpaces) {
        errors.push({
          line: lineNum + cellOffset,
          msg: 'Mixed tabs and spaces in indentation',
          severity: 'error'
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
            msg: 'Inconsistent indentation: file uses spaces elsewhere but this line uses tabs',
            severity: 'warning'
          });
        } else if (hasSpaces && usesTabs && !hasTabs) {
          errors.push({
            line: lineNum + cellOffset,
            msg: 'Inconsistent indentation: file uses tabs elsewhere but this line uses spaces',
            severity: 'warning'
          });
        }
      }

      const indentLevel = leadingWhitespace.replace(/\t/g, '    ').length;

      if (prevLineEndsWithColon) {
        const prevIndent = indentStack[indentStack.length - 1];
        if (indentLevel <= prevIndent) {
          errors.push({
            line: lineNum + cellOffset,
            msg: 'Expected indented block after colon',
            severity: 'error'
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
            msg: 'Unexpected indent',
            severity: 'error'
          });
          indentStack.push(indentLevel);
        } else if (indentLevel < currentIndent) {
          while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indentLevel) {
            indentStack.pop();
          }

          if (indentStack[indentStack.length - 1] !== indentLevel) {
            const validIndents = indentStack.map(i => `${i}`).join(', ');
            errors.push({
              line: lineNum + cellOffset,
              msg: `Unindent does not match any outer indentation level`,
              severity: 'error'
            });
          }
        }
      }

      prevLineEndsWithColon = /:\s*(#.*)?$/.test(line.trim());

      if (hasSpaces) {
        const spaceCount = leadingWhitespace.replace(/\t/g, '').length;
        if (spaceCount > 0 && spaceCount % 4 !== 0 && spaceCount % 2 !== 0) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Inconsistent indentation: ${spaceCount} spaces (expected multiple of 2 or 4)`,
            severity: 'warning'
          });
        }
      }
    });

    return errors;
  }

  return { run };
})();

if (typeof window !== 'undefined') {
  window.IndentationErrorsRule = IndentationErrorsRule;
}
