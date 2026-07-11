/**
 * Shared console log prefix. Every log call in the extension goes through
 * this instead of hardcoding "[Kaggle Linter ...]" (or a one-off tag)
 * inline per call site, which is what let content/index.tsx ("[Kaggle
 * Linter]"), ContentApp.tsx ("[Linter]"), KaggleDomParser.ts ("[Kaggle
 * Linter DomParser]"), and CodeMirrorManager.ts ("[Kaggle Linter
 * CodeMirror]") drift into three different tag families.
 *
 * `log()` is gated behind `process.env.DEBUG === 'true'` (F27) — webpack's
 * DefinePlugin substitutes this at build time, so a production build ships
 * console-quiet by default. `warn()`/`error()` are never gated: a real
 * failure should always be visible regardless of the DEBUG flag.
 *
 * `setDebugEnabled()` is a runtime override on top of the build-time flag,
 * so a shipped production build can still be switched into debug logging
 * without a rebuild — ContentApp.tsx flips it on when the user types
 * "debug" into the popup's ignore-codes field.
 */

const BASE_TAG = '[Kaggle Linter]';

export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

let runtimeDebugOverride = false;

export function setDebugEnabled(enabled: boolean): void {
  runtimeDebugOverride = enabled;
}

function isDebugEnabled(): boolean {
  return process.env.DEBUG === 'true' || runtimeDebugOverride;
}

export function createLogger(component?: string): Logger {
  const tag = component ? `[Kaggle Linter ${component}]` : BASE_TAG;
  return {
    log: (...args: unknown[]) => {
      if (isDebugEnabled()) console.log(tag, ...args);
    },
    warn: (...args: unknown[]) => console.warn(tag, ...args),
    error: (...args: unknown[]) => console.error(tag, ...args),
  };
}
