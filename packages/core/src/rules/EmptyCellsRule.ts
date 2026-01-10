/**
 * Empty Cells Rule
 * Detects empty or effectively empty code cells
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

export class EmptyCellsRule extends BaseRule {
  name = 'emptyCells';

  /**
   * Runs the empty cells rule
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Lint context (cell index can be derived from offset)
   * @returns Array of lint errors
   */
  run(code: string, cellOffset: number = 0, _context?: LintContext): LintError[] {
    const errors: LintError[] = [];
    
    // Calculate cell index from offset (approximate)
    const cellIndex = cellOffset;

    if (code.trim() === '') {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} is empty`,
        severity: 'info',
        rule: this.name,
      });
      return errors;
    }

    const lines = code.split('\n');
    const nonCommentLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    });

    if (nonCommentLines.length === 0) {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} contains only comments`,
        severity: 'info',
        rule: this.name,
      });
    }

    const passOnlyLines = nonCommentLines.filter(
      (line) => line.trim() !== 'pass'
    );
    if (nonCommentLines.length > 0 && passOnlyLines.length === 0) {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} contains only 'pass' statements`,
        severity: 'info',
        rule: this.name,
      });
    }

    const ellipsisOnlyLines = nonCommentLines.filter(
      (line) => line.trim() !== '...'
    );
    if (nonCommentLines.length > 0 && ellipsisOnlyLines.length === 0) {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} contains only ellipsis (...)`,
        severity: 'info',
        rule: this.name,
      });
    }

    return errors;
  }
}
