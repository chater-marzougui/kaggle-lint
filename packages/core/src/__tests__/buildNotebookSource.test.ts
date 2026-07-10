import { buildNotebookSource, mapLineToCell } from '../notebook/buildNotebookSource';

describe('buildNotebookSource', () => {
  it('concatenates cells in cellIndex order with correct line offsets', () => {
    const { source, cellOffsets } = buildNotebookSource([
      { code: 'import os\nx = 1', cellIndex: 0 },
      { code: 'y = x + 1', cellIndex: 1 },
    ]);

    expect(source).toBe('import os\nx = 1\ny = x + 1');
    expect(cellOffsets).toEqual([
      { cellIndex: 0, startLine: 1, lineCount: 2 },
      { cellIndex: 1, startLine: 3, lineCount: 1 },
    ]);
  });

  it('sorts cells by cellIndex regardless of input order', () => {
    const { source } = buildNotebookSource([
      { code: 'second', cellIndex: 1 },
      { code: 'first', cellIndex: 0 },
    ]);
    expect(source).toBe('first\nsecond');
  });

  it('blanks an individual line-magic line but keeps linting the rest of the cell', () => {
    const { source } = buildNotebookSource([
      { code: "%matplotlib inline\nimport pandas as pd\ndf = pd.read_csv('x.csv')", cellIndex: 0 },
    ]);
    expect(source).toBe("\nimport pandas as pd\ndf = pd.read_csv('x.csv')");
  });

  it('blanks an individual shell-escape line but keeps linting the rest of the cell', () => {
    const { source } = buildNotebookSource([
      { code: '!pip install foo\nimport foo', cellIndex: 0 },
    ]);
    expect(source).toBe('\nimport foo');
  });

  it('blanks an entire cell whose first non-blank line is a cell magic (%%)', () => {
    const { source, cellOffsets } = buildNotebookSource([
      { code: '%%bash\necho hello\npip install foo', cellIndex: 0 },
      { code: 'x = 1', cellIndex: 1 },
    ]);
    expect(source).toBe('\n\n\nx = 1');
    expect(cellOffsets).toEqual([
      { cellIndex: 0, startLine: 1, lineCount: 3 },
      { cellIndex: 1, startLine: 4, lineCount: 1 },
    ]);
  });

  it('treats a cell magic on the first non-blank line as a cell magic even with a leading blank line', () => {
    const { source } = buildNotebookSource([
      { code: '\n%%bash\nls', cellIndex: 0 },
    ]);
    // 3 input lines ('', '%%bash', 'ls') blanked and rejoined with '\n'
    // yield 2 separators, not 3 — consistent with every other case in this
    // file (N lines -> N-1 newlines). The brief's literal '\n\n\n' was off
    // by one; corrected here after verifying the arithmetic against the
    // sibling "entire cell magic" test and the cellOffsets line-counting.
    expect(source).toBe('\n\n');
  });

  it('leaves ordinary code untouched', () => {
    const { source } = buildNotebookSource([
      { code: 'def f(x):\n    return x + 1', cellIndex: 0 },
    ]);
    expect(source).toBe('def f(x):\n    return x + 1');
  });
});

describe('mapLineToCell', () => {
  const cellOffsets = [
    { cellIndex: 0, startLine: 1, lineCount: 2 },
    { cellIndex: 1, startLine: 3, lineCount: 1 },
  ];

  it('maps a global line back to the correct cell and cell-relative line', () => {
    expect(mapLineToCell(1, cellOffsets)).toEqual({ cellIndex: 0, cellLine: 1 });
    expect(mapLineToCell(2, cellOffsets)).toEqual({ cellIndex: 0, cellLine: 2 });
    expect(mapLineToCell(3, cellOffsets)).toEqual({ cellIndex: 1, cellLine: 1 });
  });

  it('returns null for a line outside any cell range', () => {
    expect(mapLineToCell(0, cellOffsets)).toBeNull();
    expect(mapLineToCell(4, cellOffsets)).toBeNull();
  });
});
