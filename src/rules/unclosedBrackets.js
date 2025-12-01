/**
 * Unclosed Brackets Rule
 * Detects unclosed parentheses, brackets, and braces
 */

const UnclosedBracketsRule = (function () {
  'use strict';

  const BRACKETS = {
    '(': ')',
    '[': ']',
    '{': '}'
  };

  const CLOSE_TO_OPEN = {
    ')': '(',
    ']': '[',
    '}': '{'
  };

  /**
   * Removes strings and comments from code for bracket matching
   * @param {string} code - Python source code
   * @returns {string} Code with strings and comments replaced
   */
  function removeStringsAndComments(code) {
    let result = '';
    let i = 0;
    let inString = null;
    let inTripleString = null;
    let inComment = false;

    while (i < code.length) {
      if (inComment) {
        if (code[i] === '\n') {
          inComment = false;
          result += '\n';
        } else {
          result += ' ';
        }
        i++;
        continue;
      }

      if (inTripleString) {
        if (code.slice(i, i + 3) === inTripleString) {
          result += '   ';
          i += 3;
          inTripleString = null;
        } else {
          result += code[i] === '\n' ? '\n' : ' ';
          i++;
        }
        continue;
      }

      if (inString) {
        if (code[i] === '\\' && i + 1 < code.length) {
          result += '  ';
          i += 2;
        } else if (code[i] === inString) {
          result += ' ';
          inString = null;
          i++;
        } else {
          result += code[i] === '\n' ? '\n' : ' ';
          i++;
        }
        continue;
      }

      if (code[i] === '#' && !inString && !inTripleString) {
        inComment = true;
        result += ' ';
        i++;
        continue;
      }

      if (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") {
        inTripleString = code.slice(i, i + 3);
        result += '   ';
        i += 3;
        continue;
      }

      if ((code[i] === '"' || code[i] === "'") && !inString) {
        inString = code[i];
        result += ' ';
        i++;
        continue;
      }

      result += code[i];
      i++;
    }

    return result;
  }

  /**
   * Runs the unclosed brackets rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const cleanCode = removeStringsAndComments(code);
    const lines = cleanCode.split('\n');

    const stack = [];

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (BRACKETS[char]) {
          stack.push({
            char: char,
            line: lineNum,
            column: i + 1,
            expected: BRACKETS[char]
          });
        } else if (CLOSE_TO_OPEN[char]) {
          if (stack.length === 0) {
            errors.push({
              line: lineNum + cellOffset,
              msg: `Unmatched closing '${char}'`,
              severity: 'error'
            });
          } else {
            const top = stack[stack.length - 1];
            if (top.expected === char) {
              stack.pop();
            } else {
              errors.push({
                line: lineNum + cellOffset,
                msg: `Mismatched bracket: expected '${top.expected}' but found '${char}'`,
                severity: 'error'
              });
            }
          }
        }
      }
    });

    stack.forEach(unclosed => {
      errors.push({
        line: unclosed.line + cellOffset,
        msg: `Unclosed '${unclosed.char}' (opened at column ${unclosed.column})`,
        severity: 'error'
      });
    });

    return errors;
  }

  return { run };
})();

if (typeof window !== 'undefined') {
  window.UnclosedBracketsRule = UnclosedBracketsRule;
}
