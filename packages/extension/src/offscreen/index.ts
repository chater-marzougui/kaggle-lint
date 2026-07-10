/**
 * Offscreen document entry point. Hosts the single PyodideRuntime
 * instance. Only acts on FLAKE8_OFFSCREEN_REQUEST envelopes forwarded by
 * the background service worker (see protocol.ts) — the raw client-facing
 * FLAKE8_LINT_NOTEBOOK/FLAKE8_STATUS broadcast also reaches this listener
 * directly (chrome.runtime.sendMessage has no single-recipient targeting),
 * but the type check below makes that a no-op, so each logical request is
 * only ever answered once.
 */

import {
  FLAKE8_OFFSCREEN_REQUEST,
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
  type Flake8LintRequest,
  type Flake8LintResponse,
  type Flake8StatusResponse,
} from '../flake8/protocol';
import { PyodideRuntime } from './pyodideRuntime';

const runtime = new PyodideRuntime();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== FLAKE8_OFFSCREEN_REQUEST) {
    return false;
  }
  const payload = message.payload;

  if (payload?.type === FLAKE8_STATUS) {
    const response: Flake8StatusResponse = { status: runtime.status };
    sendResponse(response);
    return false;
  }

  if (payload?.type === FLAKE8_LINT_NOTEBOOK) {
    const request = payload as Flake8LintRequest;
    runtime
      .lintNotebook(request.cells, [])
      .then((errors) => {
        const response: Flake8LintResponse = { ok: true, errors };
        sendResponse(response);
      })
      .catch((error) => {
        const response: Flake8LintResponse = { ok: false, error: String(error) };
        sendResponse(response);
      });
    return true;
  }

  return false;
});
