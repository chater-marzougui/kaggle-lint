import {
  sendToContentScript,
  pingContentScript,
} from '../popup/contentScriptBridge';

function stubChrome(
  callbackResponse: unknown,
  lastError?: { message: string }
): void {
  global.chrome = {
    tabs: {
      sendMessage: (
        _tabId: number,
        _message: unknown,
        callback: (response: unknown) => void
      ) => callback(callbackResponse),
    },
    runtime: { lastError },
  } as unknown as typeof chrome;
}

describe('sendToContentScript', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { chrome?: unknown }).chrome;
  });

  it('resolves ok:true with the response when sendMessage succeeds', async () => {
    stubChrome({ pong: true });

    await expect(sendToContentScript(1, { type: 'ping' })).resolves.toEqual({
      ok: true,
      response: { pong: true },
    });
  });

  it('resolves ok:false when chrome.runtime.lastError is set', async () => {
    stubChrome(undefined, { message: 'Could not establish connection.' });

    await expect(sendToContentScript(1, { type: 'ping' })).resolves.toEqual({
      ok: false,
    });
  });
});

describe('pingContentScript', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { chrome?: unknown }).chrome;
  });

  it('returns true when the content script answers { pong: true }', async () => {
    stubChrome({ pong: true });

    await expect(pingContentScript(1)).resolves.toBe(true);
  });

  it('returns false when sendMessage fails (no content script in this frame)', async () => {
    stubChrome(undefined, { message: 'no receiving end' });

    await expect(pingContentScript(1)).resolves.toBe(false);
  });
});
