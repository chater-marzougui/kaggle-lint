import { parseIgnoreCodes } from '../content/parseIgnoreCodes';

describe('parseIgnoreCodes', () => {
  it('splits, trims, and drops empty tokens', () => {
    expect(parseIgnoreCodes(' E501 ,F401,, E302')).toEqual({
      codes: ['E501', 'F401', 'E302'],
      debugRequested: false,
    });
  });

  it('strips a "debug" token (case-insensitive) and reports it requested', () => {
    expect(parseIgnoreCodes('E501, DEBUG, F401')).toEqual({
      codes: ['E501', 'F401'],
      debugRequested: true,
    });
  });

  it('returns debugRequested: false when no debug token is present', () => {
    expect(parseIgnoreCodes('E501, F401')).toEqual({
      codes: ['E501', 'F401'],
      debugRequested: false,
    });
  });

  it('handles an empty string', () => {
    expect(parseIgnoreCodes('')).toEqual({ codes: [], debugRequested: false });
  });
});
