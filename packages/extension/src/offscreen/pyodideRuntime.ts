/**
 * Loads Pyodide + calls the flake8 Python shim inside the offscreen
 * document (an extension page — WASM and 'wasm-unsafe-eval' are allowed
 * here, unlike in the content script's isolated world; see F1 in
 * docs/review-findings.md). Single instance, created once in
 * offscreen/index.ts.
 *
 * lintNotebook builds one whole-notebook source string (via
 * buildNotebookSource) and makes ONE Python call per lint — no more
 * per-cell loop or cross-cell context tracking; a single real Python
 * "file" gives correct cross-cell scoping natively.
 */

import { PYTHON_SHIM, buildNotebookSource, mapDiagnostics, type RawDiagnostic } from '@kaggle-lint/core';
import type { Flake8CellInput, Flake8ResultError, Flake8Status } from '../flake8/protocol';

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
  }
}

interface PyodideInterface {
  loadPackage(name: string): Promise<void>;
  runPythonAsync(code: string): Promise<string>;
}

const PYODIDE_INDEX_URL = chrome.runtime.getURL('pyodide/');

// Bundled flake8/pyflakes/pycodestyle/mccabe wheels (see scripts/fetch-wheels.md
// for provenance/hashes). Installed from these local chrome.runtime.getURL()
// paths only — never from PyPI at runtime (F9).
const WHEEL_FILENAMES = [
  'mccabe-0.7.0-py2.py3-none-any.whl',
  'pycodestyle-2.11.1-py2.py3-none-any.whl',
  'pyflakes-3.1.0-py2.py3-none-any.whl',
  'flake8-6.1.0-py2.py3-none-any.whl',
];

export class PyodideRuntime {
  status: Flake8Status = 'unloaded';
  private pyodide: PyodideInterface | null = null;
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
        if (!window.loadPyodide) {
          await this.loadPyodideScript();
        }
        this.pyodide = await window.loadPyodide!({ indexURL: PYODIDE_INDEX_URL });
        await this.pyodide!.loadPackage('micropip');

        const wheelUrls = WHEEL_FILENAMES.map((name) =>
          chrome.runtime.getURL(`pyodide/wheels/${name}`)
        );
        await this.pyodide!.runPythonAsync(
          `import micropip\nawait micropip.install(${JSON.stringify(wheelUrls)}, deps=False)`
        );

        await this.pyodide!.runPythonAsync(PYTHON_SHIM);
        this.status = 'ready';
      } catch (error) {
        this.status = 'failed';
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  private loadPyodideScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.loadPyodide) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = PYODIDE_INDEX_URL + 'pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide script'));
      document.head.appendChild(script);
    });
  }

  async lintNotebook(cells: Flake8CellInput[], ignoreCodes: string[]): Promise<Flake8ResultError[]> {
    await this.load();

    const { source, cellOffsets } = buildNotebookSource(cells);

    const raw = await this.pyodide!.runPythonAsync(`
import json
json.dumps(lint_source(${JSON.stringify(source)}, ${JSON.stringify(ignoreCodes)}))
    `);
    const rawResults = JSON.parse(raw) as RawDiagnostic[];

    return mapDiagnostics(rawResults, cellOffsets, 'flake8');
  }
}
