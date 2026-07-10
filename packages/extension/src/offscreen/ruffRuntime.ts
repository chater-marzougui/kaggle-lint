/**
 * Loads ruff's WASM build (@astral-sh/ruff-wasm-web) inside the offscreen
 * document — same reason PyodideRuntime lives here (F1: content scripts
 * inherit the host page's CSP for WASM instantiation, and Kaggle's CSP
 * doesn't grant 'wasm-unsafe-eval'), even though ruff needs no Python
 * runtime at all. Much lighter than Pyodide: one ~10.8 MB .wasm asset,
 * no wheels, no Python stdlib.
 */

import { initSync, Workspace, PositionEncoding, type Diagnostic } from '@astral-sh/ruff-wasm-web';
import { buildNotebookSource, mapDiagnostics, type NotebookCellInput } from '@kaggle-lint/core';
import type { EngineResultError, EngineStatus } from '../engine/protocol';

const RUFF_WASM_URL = chrome.runtime.getURL('ruff/ruff_wasm_bg.wasm');

export class RuffRuntime {
  status: EngineStatus = 'unloaded';
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.status === 'ready') {
      return Promise.resolve();
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.status = 'loading';
    this.loadPromise = (async () => {
      try {
        const response = await fetch(RUFF_WASM_URL);
        const buffer = await response.arrayBuffer();
        initSync({ module: buffer });
        this.status = 'ready';
      } catch (error) {
        this.status = 'failed';
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  async lintNotebook(cells: NotebookCellInput[], ignoreCodes: string[]): Promise<EngineResultError[]> {
    await this.load();

    // Workspace's settings (including lint.ignore) are fixed at
    // construction time, with no way to update them on an existing
    // instance — construct a fresh one per call (cheap; the expensive
    // part, WASM instantiation, already happened in load()) so a changed
    // ignoreCodes setting takes effect immediately, matching the flake8
    // shim's fresh-Application-per-call pattern.
    const workspace = new Workspace(
      { 'line-length': 88, lint: { select: ['E4', 'E7', 'E9', 'F'], ignore: ignoreCodes } },
      PositionEncoding.Utf16
    );

    const { source, cellOffsets } = buildNotebookSource(cells);
    const raw: Diagnostic[] = workspace.check(source);
    workspace.free(); // wasm-bindgen classes need explicit disposal — WASM-side memory isn't GC'd by JS

    const normalized = raw.map((d) => ({
      line: d.start_location.row,
      column: d.start_location.column,
      code: d.code ?? '',
      message: d.message,
    }));

    return mapDiagnostics(normalized, cellOffsets, 'ruff');
  }
}
