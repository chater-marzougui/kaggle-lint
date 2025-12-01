/**
 * Empty Cells Rule
 * Detects empty or effectively empty code cells
 */

const EmptyCellsRule = (function () {
  "use strict";

  /**
   * Runs the empty cells rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @param {number} cellIndex - Index of the cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0, cellIndex = 0) {
    const errors = [];

    if (code.trim() === "") {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} is empty`,
        severity: "info",
      });
      return errors;
    }

    const lines = code.split("\n");
    const nonCommentLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("#");
    });

    if (nonCommentLines.length === 0) {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} contains only comments`,
        severity: "info",
      });
    }

    const passOnlyLines = nonCommentLines.filter(
      (line) => line.trim() !== "pass"
    );
    if (nonCommentLines.length > 0 && passOnlyLines.length === 0) {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} contains only 'pass' statements`,
        severity: "info",
      });
    }

    const ellipsisOnlyLines = nonCommentLines.filter(
      (line) => line.trim() !== "..."
    );
    if (nonCommentLines.length > 0 && ellipsisOnlyLines.length === 0) {
      errors.push({
        line: cellOffset + 1,
        msg: `Cell ${cellIndex + 1} contains only ellipsis (...)`,
        severity: "info",
      });
    }

    return errors;
  }

  return { run };
})();

if (typeof window !== "undefined") {
  window.EmptyCellsRule = EmptyCellsRule;
}
