/**
 * Background service worker. Pyodide/WASM cannot run in the content
 * script (isolated-world content scripts inherit the page's CSP, which
 * Kaggle does not grant 'wasm-unsafe-eval' for — F1). This worker's only
 * job is bridging chrome.runtime messages from the content script to the
 * offscreen document, which is an extension page and gets this
 * extension's own CSP instead (see manifest.json's content_security_policy).
 */

import { FLAKE8_LINT_NOTEBOOK, FLAKE8_STATUS } from '../flake8/protocol';

const FLAKE8_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
]);

const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run Pyodide/Flake8 linter in WASM',
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type !== 'string' || !FLAKE8_MESSAGE_TYPES.has(message.type)) {
    return false;
  }

  // Only forward messages that came from a content script running in a
  // tab. chrome.runtime.sendMessage() below has no single-recipient form
  // for extension-page targets, so it broadcasts — this same listener
  // will see its own forwarded message again (and so will the offscreen
  // document's listener). The re-broadcast has no sender.tab (it
  // originates from this service worker, an extension page, not a tab),
  // so this guard prevents an infinite forward loop while still letting
  // the offscreen document's listener (which checks message.type, not
  // sender) answer it.
  if (!sender.tab) {
    return false;
  }

  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage(message))
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
