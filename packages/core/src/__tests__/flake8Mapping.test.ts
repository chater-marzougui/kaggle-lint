import { mapFlake8Results } from '../engines/flake8Mapping';

describe('mapFlake8Results', () => {
  it('adjusts line numbers by the cell offset and tags the flake8 rule', () => {
    const raw = [
      { line: 2, column: 0, code: 'F821', msg: "undefined name 'y'", severity: 'error' as const },
    ];

    const result = mapFlake8Results(raw, 10);

    expect(result).toEqual([
      { line: 12, column: 0, code: 'F821', msg: "undefined name 'y'", severity: 'error', rule: 'flake8' },
    ]);
  });

  it('applies the same offset to every error in a multi-error cell', () => {
    const raw = [
      { line: 1, column: 0, code: 'E999', msg: 'SyntaxError: invalid syntax', severity: 'error' as const },
      { line: 3, column: 4, code: 'F401', msg: "'os' imported but unused", severity: 'warning' as const },
    ];

    const result = mapFlake8Results(raw, 5);

    expect(result.map((e) => e.line)).toEqual([6, 8]);
    expect(result.every((e) => e.rule === 'flake8')).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(mapFlake8Results([], 5)).toEqual([]);
  });
});
