import { lintNotebookWithSyntaxIsolation } from '../notebook/lintWithSyntaxIsolation';
import type { RawDiagnostic } from '../notebook/severityMapping';
import type { NotebookCellInput } from '../notebook/buildNotebookSource';

const isFlake8SyntaxErrorOnly = (diagnostics: RawDiagnostic[]): boolean =>
  diagnostics.length > 0 && diagnostics.every((d) => d.code === 'E999');

describe('lintNotebookWithSyntaxIsolation', () => {
  it('returns the mapped results of a single clean pass when there is no syntax error', async () => {
    const cells: NotebookCellInput[] = [
      { code: 'import os', cellIndex: 0 },
      { code: 'x = y + 1', cellIndex: 1 },
    ];
    const runLintPass = jest.fn(async (): Promise<RawDiagnostic[]> => [
      {
        line: 1,
        column: 1,
        code: 'F401',
        message: "'os' imported but unused",
      },
      { line: 2, column: 5, code: 'F821', message: "undefined name 'y'" },
    ]);

    const result = await lintNotebookWithSyntaxIsolation(
      cells,
      'flake8',
      runLintPass,
      isFlake8SyntaxErrorOnly
    );

    expect(runLintPass).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        line: 1,
        column: 1,
        msg: "'os' imported but unused",
        severity: 'error',
        rule: 'flake8',
        code: 'F401',
        cellIndex: 0,
        cellLine: 1,
      },
      {
        line: 2,
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

  it('excludes the cell whose syntax error broke the whole-notebook pass, then re-lints the rest', async () => {
    const cells: NotebookCellInput[] = [
      { code: 'import os', cellIndex: 0 }, // line 1
      { code: 'bad + syntax = 1', cellIndex: 1 }, // line 2, the broken cell
      { code: 'x = y + 1', cellIndex: 2 }, // line 3
    ];

    const runLintPass = jest.fn(
      async (source: string): Promise<RawDiagnostic[]> => {
        if (source.includes('bad + syntax = 1')) {
          // First pass: whole notebook including the broken cell -> only
          // a syntax error, nothing else (matches real flake8 behavior).
          return [
            {
              line: 2,
              column: 1,
              code: 'E999',
              message: 'SyntaxError: invalid syntax',
            },
          ];
        }
        // Second pass: the broken cell has been excluded -> real findings
        // for the remaining, now-valid, 2-line source.
        return [
          {
            line: 1,
            column: 1,
            code: 'F401',
            message: "'os' imported but unused",
          },
          { line: 2, column: 5, code: 'F821', message: "undefined name 'y'" },
        ];
      }
    );

    const result = await lintNotebookWithSyntaxIsolation(
      cells,
      'flake8',
      runLintPass,
      isFlake8SyntaxErrorOnly
    );

    expect(runLintPass).toHaveBeenCalledTimes(2);
    // Cell 1's syntax error, correctly attributed to cellIndex 1.
    expect(result).toContainEqual({
      line: 2,
      column: 1,
      msg: 'SyntaxError: invalid syntax',
      severity: 'error',
      rule: 'flake8',
      code: 'E999',
      cellIndex: 1,
      cellLine: 1,
    });
    // Cell 0's and cell 2's real findings, correctly remapped after
    // cell 1 was excluded and the source was rebuilt without it (so their
    // global line numbers shifted from the second pass's perspective, but
    // cellIndex/cellLine still resolve to the original cells).
    expect(result).toContainEqual(
      expect.objectContaining({ code: 'F401', cellIndex: 0, cellLine: 1 })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ code: 'F821', cellIndex: 2, cellLine: 1 })
    );
    expect(result).toHaveLength(3);
  });

  it('stops retrying and returns what it has if no cell can be identified from the syntax error', async () => {
    const cells: NotebookCellInput[] = [{ code: 'x = 1', cellIndex: 0 }];
    // Line 99 is out of range for every cell -> mapDiagnostics drops it,
    // so no cell can be excluded. Must not loop forever.
    const runLintPass = jest.fn(async (): Promise<RawDiagnostic[]> => [
      {
        line: 99,
        column: 1,
        code: 'E999',
        message: 'SyntaxError: unexpected EOF',
      },
    ]);

    const result = await lintNotebookWithSyntaxIsolation(
      cells,
      'flake8',
      runLintPass,
      isFlake8SyntaxErrorOnly
    );

    expect(runLintPass).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('is bounded: repeatedly-broken cells eventually exhaust and it returns without hanging', async () => {
    const cells: NotebookCellInput[] = [
      { code: 'bad0', cellIndex: 0 },
      { code: 'bad1', cellIndex: 1 },
    ];
    // Every pass reports a fresh syntax error on whatever the first
    // remaining cell's line is - simulates two independently-broken cells.
    const runLintPass = jest.fn(
      async (source: string): Promise<RawDiagnostic[]> => {
        if (source.trim().length === 0) return [];
        return [
          {
            line: 1,
            column: 1,
            code: 'E999',
            message: 'SyntaxError: invalid syntax',
          },
        ];
      }
    );

    const result = await lintNotebookWithSyntaxIsolation(
      cells,
      'flake8',
      runLintPass,
      isFlake8SyntaxErrorOnly
    );

    // Bounded by cells.length + 1 attempts (2 cells -> at most 3 calls),
    // never loops forever, and both cells' syntax errors are reported.
    expect(runLintPass.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.filter((r) => r.code === 'E999')).toHaveLength(2);
  });

  it('handles an all-clean single cell with no retries', async () => {
    const cells: NotebookCellInput[] = [{ code: 'x = 1', cellIndex: 0 }];
    const runLintPass = jest.fn(async (): Promise<RawDiagnostic[]> => []);

    const result = await lintNotebookWithSyntaxIsolation(
      cells,
      'ruff',
      runLintPass,
      (diagnostics) =>
        diagnostics.length > 0 &&
        diagnostics.every((d) => d.code === 'invalid-syntax')
    );

    expect(runLintPass).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });
});
