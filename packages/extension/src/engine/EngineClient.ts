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

// Whole-notebook lint results only — this project deliberately lints all
// cells concatenated into one source (see buildNotebookSource.ts), so a
// single cell's result can depend on every other cell's content. The only
// architecturally-safe cache key is therefore the full cell set (in order)
// plus engine and ignore-codes; anything narrower risks serving stale
// diagnostics. Session-lived only (plain in-memory Map, not chrome.storage
// or a cookie) since this is a perf cache, not data that needs to survive
// a reload.
const LINT_CACHE_MAX_ENTRIES = 20;

export class EngineClient {
  private readonly lintCache = new Map<string, EngineResultError[]>();

  private buildCacheKey(
    engine: EngineName,
    cells: NotebookCellInput[],
    ignoreCodes: string[]
  ): string {
    const sortedIgnoreCodes = [...ignoreCodes].sort();
    return JSON.stringify({ engine, cells, ignoreCodes: sortedIgnoreCodes });
  }

  async lintNotebook(
    engine: EngineName,
    cells: NotebookCellInput[],
    ignoreCodes: string[]
  ): Promise<EngineResultError[]> {
    const cacheKey = this.buildCacheKey(engine, cells, ignoreCodes);
    const cached = this.lintCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = (await chrome.runtime.sendMessage({
      type: ENGINE_LINT_NOTEBOOK,
      engine,
      cells,
      ignoreCodes,
    })) as EngineLintResponse;

    if (!response.ok) {
      throw new Error(response.error);
    }

    if (this.lintCache.size >= LINT_CACHE_MAX_ENTRIES) {
      const oldestKey = this.lintCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.lintCache.delete(oldestKey);
      }
    }
    this.lintCache.set(cacheKey, response.errors);

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
