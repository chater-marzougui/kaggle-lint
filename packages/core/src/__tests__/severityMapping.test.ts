import { classifySeverity, mapDiagnostics } from '../notebook/severityMapping';
import type { CellOffset } from '../notebook/buildNotebookSource';

describe('classifySeverity', () => {
  it('classifies F-prefixed (pyflakes-family) codes as error', () => {
    expect(classifySeverity('F821')).toBe('error');
    expect(classifySeverity('F401')).toBe('error');
  });

  it('classifies everything else as warning', () => {
    expect(classifySeverity('E501')).toBe('warning');
    expect(classifySeverity('W605')).toBe('warning');
    expect(classifySeverity('C901')).toBe('warning');
    expect(classifySeverity('RUF100')).toBe('warning');
    expect(classifySeverity('B006')).toBe('warning');
  });

  it('classifies syntax-error codes (flake8 E999, ruff invalid-syntax) as error, not a style warning', () => {
    expect(classifySeverity('E999')).toBe('error');
    expect(classifySeverity('invalid-syntax')).toBe('error');
  });
});

describe('mapDiagnostics', () => {
  const cellOffsets: CellOffset[] = [
    { cellIndex: 0, startLine: 1, lineCount: 2 },
    { cellIndex: 1, startLine: 3, lineCount: 1 },
  ];

  it('maps global line numbers back to cellIndex/cellLine and tags severity + rule', () => {
    const result = mapDiagnostics(
      [{ line: 3, column: 5, code: 'F821', message: "undefined name 'y'" }],
      cellOffsets,
      'flake8'
    );

    expect(result).toEqual([
      {
        line: 3,
        column: 5,
        msg: "undefined name 'y'",
        severity: 'error',
        rule: 'flake8',
        code: 'F821',
        cellIndex: 1,
        cellLine: 1,
      },
    ]);
  });

  it('tags rule with whatever engineName is passed, so the same function works for ruff too', () => {
    const result = mapDiagnostics(
      [
        {
          line: 1,
          column: 8,
          code: 'F401',
          message: "'os' imported but unused",
        },
      ],
      cellOffsets,
      'ruff'
    );
    expect(result[0].rule).toBe('ruff');
    expect(result[0].severity).toBe('error');
  });

  it('drops a diagnostic whose line falls outside every known cell range', () => {
    const result = mapDiagnostics(
      [{ line: 99, column: 0, code: 'E501', message: 'line too long' }],
      cellOffsets,
      'flake8'
    );
    expect(result).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(mapDiagnostics([], cellOffsets, 'flake8')).toEqual([]);
  });
});
