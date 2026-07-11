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
} {
  const tokens = raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
  return {
    codes: tokens.filter((code) => code.toLowerCase() !== 'debug'),
    debugRequested: tokens.some((code) => code.toLowerCase() === 'debug'),
  };
}
