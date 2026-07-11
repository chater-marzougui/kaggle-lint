import { parseIgnoreCodes } from '../content/parseIgnoreCodes';

describe('parseIgnoreCodes', () => {
  it('splits, trims, and drops empty tokens', () => {
    expect(parseIgnoreCodes(' E501 ,F401,, E302')).toEqual({
      codes: ['E501', 'F401', 'E302'],
      debugRequested: false,
      invalidTokens: [],
    });
  });

  it('strips a "debug" token (case-insensitive) and reports it requested', () => {
    expect(parseIgnoreCodes('E501, DEBUG, F401')).toEqual({
      codes: ['E501', 'F401'],
      debugRequested: true,
      invalidTokens: [],
    });
  });

  it('returns debugRequested: false when no debug token is present', () => {
    expect(parseIgnoreCodes('E501, F401')).toEqual({
      codes: ['E501', 'F401'],
      debugRequested: false,
      invalidTokens: [],
    });
  });

  it('handles an empty string', () => {
    expect(parseIgnoreCodes('')).toEqual({
      codes: [],
      debugRequested: false,
      invalidTokens: [],
    });
  });

  // Real flake8/pycodestyle/pyflakes/ruff codes are always letters followed
  // by digits (E501, F401, ANN401, RUF001, ...) — ruff validates ignore
  // codes strictly and throws "Unknown rule selector" on anything else,
  // which used to crash the whole lint on a typo like "debu" (missing the
  // 'g' in "debug"). Filtering by shape before either engine ever sees the
  // list means a typo silently does nothing instead of breaking linting.
  it('drops tokens that are not letters-then-digits and reports them as invalid', () => {
    expect(parseIgnoreCodes('E501, debu, F401, debuf')).toEqual({
      codes: ['E501', 'F401'],
      debugRequested: false,
      invalidTokens: ['debu', 'debuf'],
    });
  });

  it('does not count "debug" itself as an invalid token', () => {
    expect(parseIgnoreCodes('debug, debu')).toEqual({
      codes: [],
      debugRequested: true,
      invalidTokens: ['debu'],
    });
  });

  it('accepts codes with multi-letter or longer numeric prefixes', () => {
    expect(parseIgnoreCodes('ANN401, RUF001, C901')).toEqual({
      codes: ['ANN401', 'RUF001', 'C901'],
      debugRequested: false,
      invalidTokens: [],
    });
  });
});
