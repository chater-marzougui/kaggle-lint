/**
 * Unclosed Brackets Rule
 * Detects unclosed parentheses, brackets, and braces
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

interface BracketInfo {
  char: string;
  line: number;
  column: number;
  expected: string;
}

export class UnclosedBracketsRule extends BaseRule {
  name = 'unclosedBrackets';

  private readonly BRACKETS: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
  };

  private readonly CLOSE_TO_OPEN: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
  };

  /**
   * Removes strings and comments from code for bracket matching
   * @param code - Python source code
   * @returns Code with strings and comments replaced
   */
  private removeStringsAndComments(code: string): string {
    let result = '';
    let i = 0;
    let inString: string | null = null;
    let inTripleString: string | null = null;
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
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Lint context (unused in this rule)
   * @returns Array of lint errors
   */
  run(code: string, cellOffset: number = 0, _context?: LintContext): LintError[] {
    const errors: LintError[] = [];
    const cleanCode = this.removeStringsAndComments(code);
    const lines = cleanCode.split('\n');

    const stack: BracketInfo[] = [];

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (this.BRACKETS[char]) {
          stack.push({
            char: char,
            line: lineNum,
            column: i + 1,
            expected: this.BRACKETS[char],
          });
        } else if (this.CLOSE_TO_OPEN[char]) {
          if (stack.length === 0) {
            errors.push({
              line: lineNum + cellOffset,
              msg: `Unmatched closing '${char}'`,
              severity: 'error',
              rule: this.name,
            });
          } else {
            const top = stack[stack.length - 1];
            if (top.expected === char) {
              stack.pop();
            } else {
              errors.push({
                line: lineNum + cellOffset,
                msg: `Mismatched bracket: expected '${top.expected}' but found '${char}'`,
                severity: 'error',
                rule: this.name,
              });
            }
          }
        }
      }
    });

    stack.forEach((unclosed) => {
      errors.push({
        line: unclosed.line + cellOffset,
        msg: `Unclosed '${unclosed.char}' (opened at column ${unclosed.column})`,
        severity: 'error',
        rule: this.name,
      });
    });

    return errors;
  }
}
