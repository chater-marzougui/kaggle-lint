/**
 * Shared console log prefix. Every log call in the extension goes through
 * this instead of hardcoding "[Kaggle Linter ...]" (or a one-off tag)
 * inline per call site, which is what let content/index.tsx ("[Kaggle
 * Linter]"), ContentApp.tsx ("[Linter]"), KaggleDomParser.ts ("[Kaggle
 * Linter DomParser]"), and CodeMirrorManager.ts ("[Kaggle Linter
 * CodeMirror]") drift into three different tag families.
 */

const BASE_TAG = '[Kaggle Linter]';

export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(component?: string): Logger {
  const tag = component ? `[Kaggle Linter ${component}]` : BASE_TAG;
  return {
    log: (...args: unknown[]) => console.log(tag, ...args),
    warn: (...args: unknown[]) => console.warn(tag, ...args),
    error: (...args: unknown[]) => console.error(tag, ...args),
  };
}
