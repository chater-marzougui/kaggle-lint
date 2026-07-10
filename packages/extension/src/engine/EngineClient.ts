/**
 * Thin chrome.runtime.sendMessage wrapper the content script uses to talk
 * to whichever engine (flake8 or ruff) is currently selected, via the
 * background service worker's relay to the offscreen document. Every
 * call here is a single awaited message round-trip, no polling.
 */

import type { NotebookCellInput } from '@kaggle-lint/core';
import {
  ENGINE_LINT_NOTEBOOK,
  ENGINE_STATUS,
  type EngineLintResponse,
  type EngineName,
  type EngineResultError,
  type EngineStatus,
  type EngineStatusResponse,
} from './protocol';

export class EngineClient {
  async lintNotebook(
    engine: EngineName,
    cells: NotebookCellInput[],
    ignoreCodes: string[]
  ): Promise<EngineResultError[]> {
    const response = (await chrome.runtime.sendMessage({
      type: ENGINE_LINT_NOTEBOOK,
      engine,
      cells,
      ignoreCodes,
    })) as EngineLintResponse;

    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.errors;
  }

  async getStatus(engine: EngineName): Promise<EngineStatus> {
    const response = (await chrome.runtime.sendMessage({
      type: ENGINE_STATUS,
      engine,
    })) as EngineStatusResponse;
    return response.status;
  }
}
