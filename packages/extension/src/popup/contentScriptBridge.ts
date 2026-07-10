/**
 * Wraps chrome.tabs.sendMessage with an explicit ok/fail result instead of
 * chrome's own silent-failure default (an unanswered sendMessage just sets
 * chrome.runtime.lastError and calls the callback with `undefined` — easy
 * to miss). Used both to detect whether a content script is running in the
 * active tab at all (F12: URL sniffing can't tell — the content script
 * only injects on /code/*\/*\/edit, not every kaggle.com page) and to wrap
 * the popup's existing settings/refresh/toggle messages so a failure
 * flips the popup into its "not connected" panel instead of doing nothing.
 */

export type SendResult<TResponse> =
  | { ok: true; response: TResponse }
  | { ok: false };

export function sendToContentScript<TResponse = unknown>(
  tabId: number,
  message: unknown
): Promise<SendResult<TResponse>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false });
        return;
      }
      resolve({ ok: true, response });
    });
  });
}

export async function pingContentScript(tabId: number): Promise<boolean> {
  const result = await sendToContentScript<{ pong: boolean }>(tabId, {
    type: 'ping',
  });
  return result.ok && Boolean(result.response?.pong);
}
