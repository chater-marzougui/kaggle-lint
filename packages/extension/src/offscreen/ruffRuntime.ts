/**
 * Loads ruff's WASM build (@astral-sh/ruff-wasm-web) inside the offscreen
 * document — same reason PyodideRuntime lives here (F1: content scripts
 * inherit the host page's CSP for WASM instantiation, and Kaggle's CSP
 * doesn't grant 'wasm-unsafe-eval'), even though ruff needs no Python
 * runtime at all. Much lighter than Pyodide: one ~10.8 MB .wasm asset,
 * no wheels, no Python stdlib.
 *
 * Uses the package's async default-export initializer (`init`), not the
 * `initSync` named export: initSync does `new WebAssembly.Module(bytes)`,
 * a SYNCHRONOUS compile, which Chrome refuses on a document's main thread
 * once the buffer exceeds 8MB (confirmed by reading the package's actual
 * ruff_wasm.js — initSync's WebAssembly.Module() vs init's
 * WebAssembly.instantiateStreaming()/instantiate(), both async and exempt
 * from that limit). The ruff wasm binary is ~10.3MB, over the limit.
 * Node has no such restriction, which is why this didn't surface during
 * this plan's Node-based verification of the package's row/column
 * indexing — it's a browser-only main-thread constraint.
 */

import init, { Workspace, PositionEncoding, type Diagnostic } from '@astral-sh/ruff-wasm-web';
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
        // Passing the URL lets init() fetch it itself and use
        // WebAssembly.instantiateStreaming when available — async,
        // streaming compile, no main-thread size restriction.
        await init(RUFF_WASM_URL);
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
    let raw: Diagnostic[];
    try {
      raw = workspace.check(source);
    } finally {
      // wasm-bindgen classes need explicit disposal — WASM-side memory
      // isn't GC'd by JS — so free() must run even if check() throws.
      workspace.free();
    }

    const normalized = raw.map((d) => ({
      line: d.start_location.row,
      column: d.start_location.column,
      code: d.code ?? '',
      message: d.message,
    }));

    return mapDiagnostics(normalized, cellOffsets, 'ruff');
  }
}
