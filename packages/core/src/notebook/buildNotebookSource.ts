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

type TripleQuote = '"""' | "'''" | null;

interface LineScanResult {
  /** Net change in unclosed ([{ bracket depth contributed by this line. */
  bracketDelta: number;
  /** Triple-quote still open at end of line (null if none/closed). */
  tripleQuoteOpen: TripleQuote;
}

/**
 * Lightweight, quote/comment-aware scan of one line: counts real code-level
 * ([{ brackets while skipping over string-literal contents (so a `)` inside
 * an emoticon like "hi :)" isn't mistaken for a closing bracket) and
 * `#`-comments (so an aside like "# see issue #42 (TODO)" doesn't throw off
 * the count), and tracks whether a triple-quoted string is left open across
 * lines. Not a full Python tokenizer (doesn't handle every string-prefix
 * combination or nested f-string braces specially), but closes the two
 * concrete false-positive/false-negative cases a naive character count hits
 * in real notebooks.
 */
function scanLine(
  line: string,
  tripleQuoteOpenAtStart: TripleQuote
): LineScanResult {
  let bracketDelta = 0;
  let tripleQuoteOpen = tripleQuoteOpenAtStart;
  let singleLineQuote: string | null = null;
  let i = 0;

  while (i < line.length) {
    if (tripleQuoteOpen) {
      if (line.startsWith(tripleQuoteOpen, i)) {
        tripleQuoteOpen = null;
        i += 3;
      } else {
        i += 1;
      }
      continue;
    }

    if (singleLineQuote) {
      const char = line[i];
      if (char === '\\') {
        i += 2; // skip the escaped character too
      } else if (char === singleLineQuote) {
        singleLineQuote = null;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      tripleQuoteOpen = line.slice(i, i + 3) as TripleQuote;
      i += 3;
      continue;
    }

    const char = line[i];
    if (char === '#') {
      break; // rest of the line is a comment — nothing further counts
    }
    if (char === '"' || char === "'") {
      singleLineQuote = char;
      i += 1;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      bracketDelta += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      bracketDelta -= 1;
    }
    i += 1;
  }

  return { bracketDelta, tripleQuoteOpen };
}

function blankCellLines(lines: string[]): string[] {
  const firstNonBlank = lines.find((line) => line.trim().length > 0);
  const isCellMagic =
    firstNonBlank !== undefined && firstNonBlank.trimStart().startsWith('%%');

  if (isCellMagic) {
    // A cell magic (%%bash, %%html, %%writefile, ...) changes the whole
    // cell's language away from Python — blank every line, but keep the
    // same line count so later cells' offsets stay correct.
    return lines.map(() => '');
  }

  // Track paren/bracket/brace nesting depth and open triple-quoted strings
  // as we go: a real IPython line magic/shell escape can only start a
  // fresh statement, so a line reached while still inside an unclosed
  // bracket (e.g. a %-format continuation `% (x, y))` or a `!= b):`
  // comparison continuation — both valid, common Python) or an open
  // docstring must never be treated as one, even though it happens to
  // start with % or ! after trimming.
  let bracketDepth = 0;
  let tripleQuoteOpen: TripleQuote = null;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    const isContinuation = bracketDepth > 0 || tripleQuoteOpen !== null;
    const shouldBlank =
      !isContinuation && (trimmed.startsWith('%') || trimmed.startsWith('!'));

    const scan = scanLine(line, tripleQuoteOpen);
    bracketDepth += scan.bracketDelta;
    tripleQuoteOpen = scan.tripleQuoteOpen;

    // A line magic (%matplotlib inline) or shell escape (!pip install x)
    // — blank only this line, the rest of the cell still lints.
    return shouldBlank ? '' : line;
  });
}

export function buildNotebookSource(
  cells: NotebookCellInput[]
): NotebookSource {
  const sorted = [...cells].sort((a, b) => a.cellIndex - b.cellIndex);
  const allLines: string[] = [];
  const cellOffsets: CellOffset[] = [];
  let currentLine = 1;

  for (const cell of sorted) {
    const lines = cell.code.split('\n');
    cellOffsets.push({
      cellIndex: cell.cellIndex,
      startLine: currentLine,
      lineCount: lines.length,
    });
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
    if (
      globalLine >= offset.startLine &&
      globalLine < offset.startLine + offset.lineCount
    ) {
      return {
        cellIndex: offset.cellIndex,
        cellLine: globalLine - offset.startLine + 1,
      };
    }
  }
  return null;
}
