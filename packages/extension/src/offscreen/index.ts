/**
 * Offscreen document entry point. Runs Pyodide (WASM allowed here — this
 * is an extension page, not a content script). Task 2 replaces the stub
 * response below with a real PyodideRuntime-backed handler.
 */

import { FLAKE8_OFFSCREEN_REQUEST, FLAKE8_LINT_NOTEBOOK, FLAKE8_STATUS } from '../flake8/protocol';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== FLAKE8_OFFSCREEN_REQUEST) {
    return false;
  }
  const payload = message.payload;
  if (payload?.type !== FLAKE8_LINT_NOTEBOOK && payload?.type !== FLAKE8_STATUS) {
    return false;
  }
  sendResponse({ ok: false, error: 'not implemented' });
  return false;
});
