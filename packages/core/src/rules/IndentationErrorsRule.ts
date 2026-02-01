/**
 * Indentation Errors Rule
 * Detects Python indentation issues
 * Handles multi-line statements (unclosed brackets, backslash continuation)
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

export class IndentationErrorsRule extends BaseRule {
  name = 'indentationErrors';

  /**
   * Checks if a line is a shell command (starts with !)
   * @param line - Line of code
   * @returns boolean
   */
  private isShellCommand(line: string): boolean {
    return /^\s*!/.test(line);
  }

  /**
   * Checks if a line is a Jupyter magic command (starts with % or %%)
   * @param line - Line of code
   * @returns boolean
   */
  private isMagicCommand(line: string): boolean {
    return /^\s*%%?[a-zA-Z]/.test(line);
  }

  /**
   * Counts unclosed brackets in a line (ignoring brackets in strings/comments)
   * @param line - Line of code
   * @returns Net bracket count (positive = unclosed opening brackets)
   */
  private countUnclosedBrackets(line: string): number {
    // Remove strings and comments first
    let cleaned = line.replace(/#.*$/, '');
    cleaned = cleaned.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '');
    cleaned = cleaned.replace(/"""[\s\S]*?"""/g, '');
    cleaned = cleaned.replace(/'''[\s\S]*?'''/g, '');

    let count = 0;
    for (const char of cleaned) {
      if (char === '(' || char === '[' || char === '{') {
        count++;
      } else if (char === ')' || char === ']' || char === '}') {
        count--;
      }
    }
    return count;
  }

  /**
   * Checks if a line ends with a line continuation (backslash)
   * @param line - Line of code
   * @returns boolean
   */
  private endsWithContinuation(line: string): boolean {
    // Remove comments first
    const withoutComments = line.replace(/#.*$/, '');
    return withoutComments.trimEnd().endsWith('\\');
  }

  /**
   * Runs the indentation errors rule
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Lint context (unused in this rule)
   * @returns Array of lint errors
   */
  run(
    code: string,
    cellOffset: number = 0,
    _context?: LintContext
  ): LintError[] {
    const errors: LintError[] = [];
    const lines = code.split('\n');

    let usesTabs = false;
    let usesSpaces = false;
    let indentStack = [0];
    let prevLineEndsWithColon = false;

    // Track multi-line statement state
    let unclosedBracketCount = 0;
    let inContinuation = false;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      // Skip empty lines and comments
      if (line.trim() === '' || line.trim().startsWith('#')) {
        return;
      }

      // Skip shell commands and magic commands
      if (this.isShellCommand(line) || this.isMagicCommand(line)) {
        return;
      }

      const leadingWhitespace = line.match(/^(\s*)/)?.[1] || '';

      const hasTabs = /\t/.test(leadingWhitespace);
      const hasSpaces = / /.test(leadingWhitespace);

      if (hasTabs && hasSpaces) {
        errors.push({
          line: lineNum + cellOffset,
          msg: 'Mixed tabs and spaces in indentation',
          severity: 'error',
          rule: this.name,
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
            severity: 'warning',
            rule: this.name,
          });
        } else if (hasSpaces && usesTabs && !hasTabs) {
          errors.push({
            line: lineNum + cellOffset,
            msg: 'Inconsistent indentation: file uses tabs elsewhere but this line uses spaces',
            severity: 'warning',
            rule: this.name,
          });
        }
      }

      const indentLevel = leadingWhitespace.replace(/\t/g, '    ').length;

      // If we're inside a multi-line statement (unclosed brackets or continuation),
      // skip indentation checking for this line
      if (unclosedBracketCount > 0 || inContinuation) {
        // Update bracket count for this line
        unclosedBracketCount += this.countUnclosedBrackets(line);
        // Update continuation state
        inContinuation = this.endsWithContinuation(line);
        // Don't check indentation for continuation lines
        prevLineEndsWithColon = /:\s*(#.*)?$/.test(line.trim());
        return;
      }

      if (prevLineEndsWithColon) {
        const prevIndent = indentStack[indentStack.length - 1];
        if (indentLevel <= prevIndent) {
          errors.push({
            line: lineNum + cellOffset,
            msg: 'Expected indented block after colon',
            severity: 'error',
            rule: this.name,
          });
        } else {
          indentStack.push(indentLevel);
        }
      } else {
        const currentIndent = indentStack[indentStack.length - 1];

        if (indentLevel > currentIndent) {
          errors.push({
            line: lineNum + cellOffset,
            msg: 'Unexpected indent',
            severity: 'error',
            rule: this.name,
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
            errors.push({
              line: lineNum + cellOffset,
              msg: `Unindent does not match any outer indentation level`,
              severity: 'error',
              rule: this.name,
            });
          }
        }
      }

      // Check for colon at end of line (for next iteration)
      prevLineEndsWithColon = /:\s*(#.*)?$/.test(line.trim());

      // Update multi-line statement tracking
      unclosedBracketCount += this.countUnclosedBrackets(line);
      inContinuation = this.endsWithContinuation(line);

      if (hasSpaces) {
        const spaceCount = leadingWhitespace.replace(/\t/g, '').length;
        if (spaceCount > 0 && spaceCount % 4 !== 0 && spaceCount % 2 !== 0) {
          errors.push({
            line: lineNum + cellOffset,
            msg: `Inconsistent indentation: ${spaceCount} spaces (expected multiple of 2 or 4)`,
            severity: 'warning',
            rule: this.name,
          });
        }
      }
    });

    return errors;
  }
}
