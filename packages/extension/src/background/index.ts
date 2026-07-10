/**
 * Background service worker. Pyodide/WASM cannot run in the content
 * script (isolated-world content scripts inherit the page's CSP, which
 * Kaggle does not grant 'wasm-unsafe-eval' for — F1). This worker's only
 * job is bridging chrome.runtime messages from the content script to the
 * offscreen document, which is an extension page and gets this
 * extension's own CSP instead (see manifest.json's content_security_policy).
 */

import { FLAKE8_LINT_NOTEBOOK, FLAKE8_OFFSCREEN_REQUEST, FLAKE8_STATUS } from '../flake8/protocol';

const FLAKE8_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  FLAKE8_LINT_NOTEBOOK,
  FLAKE8_STATUS,
]);

const OFFSCREEN_URL = 'offscreen.html';

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run Pyodide/Flake8 linter in WASM',
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type !== 'string' || !FLAKE8_MESSAGE_TYPES.has(message.type)) {
    return false;
  }

  // Only forward messages that came from a content script running in a
  // tab. This is defense in depth, not the sole guard against re-forward
  // loops: the wrapped message sent below has type FLAKE8_OFFSCREEN_REQUEST,
  // which is disjoint from FLAKE8_MESSAGE_TYPES, so this listener's own
  // type check (above) already ignores it when chrome.runtime.sendMessage's
  // broadcast reaches this same listener again. It also has no sender.tab
  // (it originates from this service worker, an extension page, not a tab),
  // so the check below would reject it a second time regardless.
  if (!sender.tab) {
    return false;
  }

  ensureOffscreen()
    .then(() =>
      chrome.runtime.sendMessage({
        type: FLAKE8_OFFSCREEN_REQUEST,
        payload: message,
      })
    )
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
