/**
 * Thin chrome.runtime.sendMessage wrapper the content script uses to talk
 * to the offscreen Pyodide runtime (via the background service worker's
 * relay). Replaces the old in-content-script Flake8Engine instance and
 * its busy-wait poll (F13) — every call here is a single awaited message
 * round-trip, no polling.
 */

import {
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
  type Flake8CellInput,
  type Flake8LintResponse,
  type Flake8ResultError,
  type Flake8Status,
  type Flake8StatusResponse,
} from './protocol';

export class Flake8Client {
  async lintNotebook(cells: Flake8CellInput[]): Promise<Flake8ResultError[]> {
    const response = (await chrome.runtime.sendMessage({
      type: FLAKE8_LINT_NOTEBOOK,
      cells,
    })) as Flake8LintResponse;

    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.errors;
  }

  async getStatus(): Promise<Flake8Status> {
    const response = (await chrome.runtime.sendMessage({
      type: FLAKE8_STATUS,
    })) as Flake8StatusResponse;
    return response.status;
  }
}
