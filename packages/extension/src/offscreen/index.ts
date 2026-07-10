/**
 * Offscreen document entry point. Hosts one PyodideRuntime (flake8) and
 * one RuffRuntime (ruff) instance. Only acts on ENGINE_OFFSCREEN_REQUEST
 * envelopes forwarded by the background service worker (see protocol.ts)
 * — the raw client-facing ENGINE_LINT_NOTEBOOK/ENGINE_STATUS broadcast
 * also reaches this listener directly (chrome.runtime.sendMessage has no
 * single-recipient targeting), but the type check below makes that a
 * no-op, so each logical request is only ever answered once.
 */

import {
  ENGINE_OFFSCREEN_REQUEST,
  ENGINE_LINT_NOTEBOOK,
  ENGINE_STATUS,
  type EngineLintRequest,
  type EngineLintResponse,
  type EngineStatusResponse,
} from '../engine/protocol';
import { PyodideRuntime } from './pyodideRuntime';
import { RuffRuntime } from './ruffRuntime';

const runtimes = {
  flake8: new PyodideRuntime(),
  ruff: new RuffRuntime(),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== ENGINE_OFFSCREEN_REQUEST) {
    return false;
  }
  const payload = message.payload;

  if (payload?.type === ENGINE_STATUS) {
    const runtime = runtimes[payload.engine as EngineLintRequest['engine']];
    if (!runtime) {
      // Unknown/unrecognized engine name (e.g. a pre-consolidation
      // chrome.storage.sync value like 'handmade' that this plan
      // deliberately doesn't migrate). EngineStatusResponse has no error
      // variant, so 'failed' is the least-surprising status to report —
      // it can never become 'ready' and the popup already knows how to
      // render a failed engine.
      const response: EngineStatusResponse = { status: 'failed' };
      sendResponse(response);
      return false;
    }
    const response: EngineStatusResponse = { status: runtime.status };
    sendResponse(response);
    return false;
  }

  if (payload?.type === ENGINE_LINT_NOTEBOOK) {
    const request = payload as EngineLintRequest;
    const runtime = runtimes[request.engine];
    if (!runtime) {
      const response: EngineLintResponse = {
        ok: false,
        error: `Unknown lint engine: "${request.engine}"`,
      };
      sendResponse(response);
      return false;
    }
    runtime
      .lintNotebook(request.cells, request.ignoreCodes)
      .then((errors) => {
        const response: EngineLintResponse = { ok: true, errors };
        sendResponse(response);
      })
      .catch((error) => {
        const response: EngineLintResponse = { ok: false, error: String(error) };
        sendResponse(response);
      });
    return true;
  }

  return false;
});
