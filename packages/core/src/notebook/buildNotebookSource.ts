/**
 * Concatenates a notebook's cells into one Python source string suitable
 * for a single whole-notebook lint pass (the "nbqa technique" this
 * project adopts instead of per-cell linting + hand-rolled cross-cell
 * context tracking). Magic commands and shell escapes are blanked in
 * place (preserving line counts, so offsets stay simple) rather than
 * causing a syntax error or losing lint coverage for the rest of the cell.
 */

export interface NotebookCellInput {
  code: string;
  cellIndex: number;
}

export interface CellOffset {
  cellIndex: number;
  /** 1-based line number in the concatenated source where this cell begins. */
  startLine: number;
  lineCount: number;
}

export interface NotebookSource {
  source: string;
  cellOffsets: CellOffset[];
}

/**
 * Naive running count of unclosed ([{ brackets on a line (doesn't account
 * for brackets inside strings/comments — an approximation, not a full
 * tokenizer). Used only to tell whether the NEXT line is a continuation of
 * a still-open expression, since a real line magic/shell escape can only
 * start a fresh top-level statement, never continue one.
 */
function countUnclosedBrackets(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === '(' || char === '[' || char === '{') {
      delta += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      delta -= 1;
    }
  }
  return delta;
}

function blankCellLines(lines: string[]): string[] {
  const firstNonBlank = lines.find((line) => line.trim().length > 0);
  const isCellMagic = firstNonBlank !== undefined && firstNonBlank.trimStart().startsWith('%%');

  if (isCellMagic) {
    // A cell magic (%%bash, %%html, %%writefile, ...) changes the whole
    // cell's language away from Python — blank every line, but keep the
    // same line count so later cells' offsets stay correct.
    return lines.map(() => '');
  }

  // Track paren/bracket/brace nesting depth as we go: a real IPython line
  // magic/shell escape can only start a fresh statement, so a line reached
  // while still inside an unclosed bracket from an earlier line (e.g. a
  // %-format continuation `% (x, y))` or a `!= b):` comparison continuation
  // — both valid, common Python) must never be treated as one, even though
  // it happens to start with % or ! after trimming.
  let bracketDepth = 0;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    const isContinuation = bracketDepth > 0;
    const shouldBlank = !isContinuation && (trimmed.startsWith('%') || trimmed.startsWith('!'));

    bracketDepth += countUnclosedBrackets(line);

    // A line magic (%matplotlib inline) or shell escape (!pip install x)
    // — blank only this line, the rest of the cell still lints.
    return shouldBlank ? '' : line;
  });
}

export function buildNotebookSource(cells: NotebookCellInput[]): NotebookSource {
  const sorted = [...cells].sort((a, b) => a.cellIndex - b.cellIndex);
  const allLines: string[] = [];
  const cellOffsets: CellOffset[] = [];
  let currentLine = 1;

  for (const cell of sorted) {
    const lines = cell.code.split('\n');
    cellOffsets.push({ cellIndex: cell.cellIndex, startLine: currentLine, lineCount: lines.length });
    allLines.push(...blankCellLines(lines));
    currentLine += lines.length;
  }

  return { source: allLines.join('\n'), cellOffsets };
}

export function mapLineToCell(
  globalLine: number,
  cellOffsets: CellOffset[]
): { cellIndex: number; cellLine: number } | null {
  for (const offset of cellOffsets) {
    if (globalLine >= offset.startLine && globalLine < offset.startLine + offset.lineCount) {
      return { cellIndex: offset.cellIndex, cellLine: globalLine - offset.startLine + 1 };
    }
  }
  return null;
}
