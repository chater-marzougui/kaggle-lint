/**
 * Real flake8/pycodestyle/pyflakes/ruff codes are always a letter prefix
 * followed by digits (E501, F401, ANN401, RUF001, C901, ...) — there's no
 * bundled catalog of every valid code (ruff alone implements dozens of
 * plugins), but this shape is universal, so it's enough to catch garbage
 * input. Matters because ruff validates strictly and throws "Unknown rule
 * selector" on the first unrecognized entry, which broke the whole lint on
 * a typo like "debu" (missing the 'g' in "debug") — flake8 silently no-ops
 * on an unknown code instead, so this only ever surfaced with ruff selected.
 */
const CODE_SHAPE = /^[A-Za-z]+[0-9]+$/;

/**
 * Parses a comma-separated ignore-codes string, and treats a "debug" token
 * (case-insensitive) as a special value: it's not a real flake8/ruff code,
 * so it's stripped out of the codes actually sent to the engine, and instead
 * flips on runtime debug logging (logger.ts's setDebugEnabled) — a way to
 * get debug logs out of a shipped production build without a rebuild.
 */
export function parseIgnoreCodes(raw: string): {
  codes: string[];
  debugRequested: boolean;
  invalidTokens: string[];
} {
  const tokens = raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
  const debugRequested = tokens.some((code) => code.toLowerCase() === 'debug');
  const candidates = tokens.filter((code) => code.toLowerCase() !== 'debug');
  return {
    codes: candidates.filter((code) => CODE_SHAPE.test(code)),
    debugRequested,
    invalidTokens: candidates.filter((code) => !CODE_SHAPE.test(code)),
  };
}
