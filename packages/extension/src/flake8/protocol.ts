/**
 * Message protocol shared between the content script (isolated world),
 * the background service worker, and the offscreen document running
 * Pyodide. All three contexts import from this single module.
 */

import type { LintError } from '@kaggle-lint/core';

export const FLAKE8_LINT_NOTEBOOK = 'FLAKE8_LINT_NOTEBOOK' as const;
export const FLAKE8_STATUS = 'FLAKE8_STATUS' as const;

export interface Flake8CellInput {
  code: string;
  cellIndex: number;
}

export interface Flake8LintRequest {
  type: typeof FLAKE8_LINT_NOTEBOOK;
  cells: Flake8CellInput[];
}

export type Flake8ResultError = LintError & { cellIndex: number; cellLine: number };

export type Flake8LintResponse =
  | { ok: true; errors: Flake8ResultError[] }
  | { ok: false; error: string };

export interface Flake8StatusRequest {
  type: typeof FLAKE8_STATUS;
}

export type Flake8Status = 'unloaded' | 'loading' | 'ready' | 'failed';

export interface Flake8StatusResponse {
  status: Flake8Status;
}
