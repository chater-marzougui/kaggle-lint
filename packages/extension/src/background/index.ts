/**
 * Background service worker. Pyodide/WASM cannot run in the content
 * script (isolated-world content scripts inherit the page's CSP, which
 * Kaggle does not grant 'wasm-unsafe-eval' for — F1). This worker's only
 * job is bridging chrome.runtime messages from the content script to the
 * offscreen document, which is an extension page and gets this
 * extension's own CSP instead (see manifest.json's content_security_policy).
 * Generalized from flake8-only (Milestone 3) to any engine.
 */

import { ENGINE_LINT_NOTEBOOK, ENGINE_OFFSCREEN_REQUEST, ENGINE_STATUS } from '../engine/protocol';
import { LINT_STATS, type LintStatsMessage } from './statsProtocol';

const ENGINE_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  ENGINE_LINT_NOTEBOOK,
  ENGINE_STATUS,
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
    justification: 'Run Pyodide/Flake8/Ruff linters in WASM',
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === LINT_STATS && typeof sender.tab?.id === 'number') {
    const { errors, warnings } = message as LintStatsMessage;
    const tabId = sender.tab.id;
    const total = errors + warnings;
    chrome.action.setBadgeText({ tabId, text: total > 0 ? String(total) : '' });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: errors > 0 ? '#c42b1c' : '#deb887',
    });
    return false;
  }

  if (typeof message?.type !== 'string' || !ENGINE_MESSAGE_TYPES.has(message.type)) {
    return false;
  }

  // Only forward messages that came from a content script running in a
  // tab. This is defense in depth, not the sole guard against re-forward
  // loops: the wrapped message sent below has type ENGINE_OFFSCREEN_REQUEST,
  // which is disjoint from ENGINE_MESSAGE_TYPES, so this listener's own
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
        type: ENGINE_OFFSCREEN_REQUEST,
        payload: message,
      })
    )
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
