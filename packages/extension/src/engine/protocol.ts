/**
 * Message protocol shared between the content script (isolated world),
 * the background service worker, and the offscreen document running the
 * flake8/ruff engines. All three contexts import from this single
 * module. Generalized from the flake8-only protocol Milestone 3 built —
 * same disjoint-namespace envelope design (see background/index.ts),
 * now parameterized by which engine a request/response is for.
 */

import type { LintError, NotebookCellInput } from '@kaggle-lint/core';

export type EngineName = 'flake8' | 'ruff';

export const ENGINE_LINT_NOTEBOOK = 'ENGINE_LINT_NOTEBOOK' as const;
export const ENGINE_STATUS = 'ENGINE_STATUS' as const;

export interface EngineLintRequest {
  type: typeof ENGINE_LINT_NOTEBOOK;
  engine: EngineName;
  cells: NotebookCellInput[];
  ignoreCodes: string[];
}

export type EngineResultError = LintError & { cellIndex: number; cellLine: number };

export type EngineLintResponse =
  | { ok: true; errors: EngineResultError[] }
  | { ok: false; error: string };

export interface EngineStatusRequest {
  type: typeof ENGINE_STATUS;
  engine: EngineName;
}

export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'failed';

export interface EngineStatusResponse {
  status: EngineStatus;
}

export const ENGINE_OFFSCREEN_REQUEST = 'ENGINE_OFFSCREEN_REQUEST' as const;

export interface EngineOffscreenRequest {
  type: typeof ENGINE_OFFSCREEN_REQUEST;
  payload: EngineLintRequest | EngineStatusRequest;
}
