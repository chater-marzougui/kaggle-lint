# Milestone 6: UX Polish & Release Readiness — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A releasable extension: popup detects the content script reliably instead of guessing from the URL, debug logging is actually silenced in production, docs are honest against verified current source, the legacy `old-linter/` folder is gone, and a tagged `v2.1.0` release ships a working zip.

**Architecture:** This expands `docs/next_plans/milestone-6-ux-and-release/plan.md`'s Tasks 2–6 (its own Task 1, the overlay React rewrite, already executed as Milestone 8 Task 1 — merged 2026-07-10, not re-executed here). Task numbering below matches the milestone plan's original numbers so finding cross-references (F12, F24, F27, F30, F28) still resolve.

**Tech Stack:** React 18, Chrome extension APIs (`chrome.tabs`, `chrome.runtime`), Jest + ts-jest + jsdom (existing extension test infra from Milestone 5), GitHub Actions release workflow.

**Verified against current source (2026-07-10) before writing this plan — not the milestone plan's paraphrase:**
- `packages/core`: 4 suites, **31 tests**, all passing (`buildNotebookSource`, `flake8Shim`, `lintWithSyntaxIsolation`, `severityMapping`).
- `packages/extension`: 2 suites, **9 tests**, all passing (`CodeMirrorManager`, `KaggleDomParser`).
- `npm run lint` (repo root): **0 errors, 1 warning** — the warning is `Overlay.tsx`'s `onStateChange` `react-hooks/exhaustive-deps` gap, already documented as deliberately-not-fixed in `docs/next_plans/milestone-4-config-and-build-hygiene/notes.md`. Not this plan's concern.
- `packages/ui-components/src/Overlay/Overlay.tsx` is already React-pure (F11 full, closed by Milestone 8 Task 1): minimize/close are `isMinimized`/`visible` state + CSS classes, no `style.display` writes; dragging is the sole remaining direct-DOM-write path, deliberately (ref-held CSS custom properties so a mousemove doesn't re-render — documented in the file's own header comment).
- `packages/extension/src/content/ContentApp.tsx` already types `errors`/`error` as `LintUIError[]`/`LintUIError` (F29 closed) — no `any` remains for lint state.
- `packages/extension/src/popup/PopupApp.tsx` **still** does `tabs[0].url.includes('kaggle.com')` (line 47) with **no** `chrome.runtime.lastError` checking anywhere — F12 is fully open, Task 3 below is needed exactly as scoped.
- Debug logging (F27) has partially evolved since the milestone plan was written: a `packages/extension/src/utils/logger.ts` (`createLogger`) already exists and every call site in `packages/extension/src` already routes through it (confirmed: zero raw `console.log`/`warn`/`error` call sites remain outside `logger.ts` itself). What's **not** done: `logger.ts`'s `log()` always calls `console.log` unconditionally, and `KaggleDomParser.ts`/`CodeMirrorManager.ts` each hardcode their own `private DEBUG` boolean (`true`/`false`) instead of reading `process.env.DEBUG` (webpack's `DefinePlugin` already injects it — `webpack.config.js:54`). Task 2 below targets `logger.ts` + these two flags, not "create `log.ts` and sweep `console.log` call sites" as the milestone plan's original text says — that sweep is already done.
- `old-linter` grep across `packages/`, `turbo.json`, `.github/` (all `.js/.json/.yml/.ts/.tsx`) returns **only source comments** (`MIGRATION NOTE`/`EXACT COPY`/`EXACT LOGIC` provenance notes in `ErrorList.tsx`, `ErrorItem.tsx`, `KaggleDomParser.ts`, `CodeMirrorManager.ts`, `pageExtractor.ts`, `content/index.tsx`) — no functional dependency. `webpack.config.js` copies `popup.css` from `src/popup/popup.css` (this package), confirming Milestone 4 Task 2 landed. Task 5's preconditions hold.
- `docs/review-findings.md`'s summary table already carries per-finding "resolved (2026-07-10)" / "moot" annotations through Milestone 5 (confirmed: F4, F5, F14–F23, F31 all annotated). **No edit needed there** — Task 4 below only touches `README.md` and `docs/architecture.md`.
- `docs/architecture.md` has two concrete stale spots (found by reading current source against the doc's own claims, not assumed): (1) its ui-components section still says F11-full "is still Milestone 6, Task 1" — wrong, it closed in **Milestone 8** Task 1; (2) its CI/CD section still says "F5 ... is still open, Milestone 5" — wrong, F5 closed in M5, and the doc doesn't yet mention the post-M5 follow-ups (ESLint 9 flat-config migration, GitHub Actions Node 24 bump, `.gitattributes`) that are now real, committed facts about how CI/build works.
- `EXTENSION_USAGE.md`, `IMPLEMENTATION_SUMMARY.md`, `MIGRATION.md` are confirmed absent from the repo (`Glob` returned no matches) — `README.md`'s links to them (lines 85, 307–309) are dead, confirming F24.
- `packages/core/src/types/index.ts`'s actual `LintError` shape matches `README.md`'s documented interface (lines 231–239) exactly — no drift there, don't touch it.

## Global Constraints

- Every task ends with `npm run lint && npm run type-check && npm run build && npm test` green (from repo root).
- No new dependencies — every test below uses only `jest`/`ts-jest`/`jsdom`, already installed.
- **Do not modify `Overlay.tsx`'s header/topbar markup or styling** (icon, title, refresh/minimize/close buttons) — user has explicitly confirmed they like its current look. No task in this plan touches it; keep it that way.
- The standalone demo (`old-linter/test/linter-demo.html`) disappears with the folder in Task 5; its replacement is out of scope (already noted as a future item in `docs/next_plans/milestone-6-ux-and-release/plan.md`'s Deferred section).
- Settings storage shape (`{ linterEngine, flake8IgnoreCodes, ruffIgnoreCodes }` in `chrome.storage.sync`'s `linterSettings` key) is frozen — no task here changes it.
- Task 6 is outward-facing (git tag, push, GitHub release publish). Every such step is called out individually below as a **STOP — confirm with the user** point; do not chain past one without an explicit go-ahead, the same discipline Milestone 5 used for its own push.

---

### Task 2: Debug logging gate (F27)

**Files:**
- Modify: `packages/extension/src/utils/logger.ts`
- Modify: `packages/extension/src/utils/KaggleDomParser.ts:34,37-39`
- Modify: `packages/extension/src/utils/CodeMirrorManager.ts:22,25-29`
- Modify: `packages/extension/src/__tests__/KaggleDomParser.test.ts:24` (comment accuracy only)
- Test: `packages/extension/src/__tests__/logger.test.ts` (new)

**Interfaces:**
- Consumes: `createLogger(component?: string): Logger` (unchanged signature) from `packages/extension/src/utils/logger.ts`, already imported by `ContentApp.tsx`, `content/index.tsx`, `KaggleDomParser.ts`, `CodeMirrorManager.ts`.
- Produces: same `Logger` interface (`log`/`warn`/`error`, each `(...args: unknown[]) => void`) — no caller needs to change.

- [ ] **Step 1: Write the failing test**

Create `packages/extension/src/__tests__/logger.test.ts`:

```ts
import { createLogger } from '../utils/logger';

describe('createLogger', () => {
  afterEach(() => {
    delete process.env.DEBUG;
    jest.restoreAllMocks();
  });

  it('suppresses log() when DEBUG is not "true"', () => {
    process.env.DEBUG = 'false';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const logger = createLogger('Test');

    logger.log('hello');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits log() with the tagged prefix when DEBUG is "true"', () => {
    process.env.DEBUG = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const logger = createLogger('Test');

    logger.log('hello', 42);

    expect(logSpy).toHaveBeenCalledWith('[Kaggle Linter Test]', 'hello', 42);
  });

  it('always emits warn() and error() regardless of DEBUG', () => {
    process.env.DEBUG = 'false';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const logger = createLogger();

    logger.warn('careful');
    logger.error('broken');

    expect(warnSpy).toHaveBeenCalledWith('[Kaggle Linter]', 'careful');
    expect(errorSpy).toHaveBeenCalledWith('[Kaggle Linter]', 'broken');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/extension`): `npx jest src/__tests__/logger.test.ts`
Expected: 1 FAIL ("suppresses log() when DEBUG is not \"true\"" — current `logger.ts` calls `console.log` unconditionally), 2 PASS (the other two already hold against current behavior).

- [ ] **Step 3: Implement the gate**

Replace `packages/extension/src/utils/logger.ts` in full:

```ts
/**
 * Shared console log prefix. Every log call in the extension goes through
 * this instead of hardcoding "[Kaggle Linter ...]" (or a one-off tag)
 * inline per call site, which is what let content/index.tsx ("[Kaggle
 * Linter]"), ContentApp.tsx ("[Linter]"), KaggleDomParser.ts ("[Kaggle
 * Linter DomParser]"), and CodeMirrorManager.ts ("[Kaggle Linter
 * CodeMirror]") drift into three different tag families.
 *
 * `log()` is gated behind `process.env.DEBUG === 'true'` (F27) — webpack's
 * DefinePlugin substitutes this at build time, so a production build ships
 * console-quiet by default. `warn()`/`error()` are never gated: a real
 * failure should always be visible regardless of the DEBUG flag.
 */

const BASE_TAG = '[Kaggle Linter]';

export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function isDebugEnabled(): boolean {
  return process.env.DEBUG === 'true';
}

export function createLogger(component?: string): Logger {
  const tag = component ? `[Kaggle Linter ${component}]` : BASE_TAG;
  return {
    log: (...args: unknown[]) => {
      if (isDebugEnabled()) console.log(tag, ...args);
    },
    warn: (...args: unknown[]) => console.warn(tag, ...args),
    error: (...args: unknown[]) => console.error(tag, ...args),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/logger.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Remove the now-redundant per-class DEBUG flags**

In `packages/extension/src/utils/KaggleDomParser.ts`, delete line 34 (`private DEBUG = true;`) and replace lines 37–39:

```ts
  private log(...args: unknown[]): void {
    if (this.DEBUG) logger.log(...args);
  }
```

with:

```ts
  private log(...args: unknown[]): void {
    logger.log(...args);
  }
```

In `packages/extension/src/utils/CodeMirrorManager.ts`, delete line 22 (`private DEBUG = false;`) and replace lines 25–29:

```ts
  private log(...args: unknown[]): void {
    if (this.DEBUG) {
      logger.log(...args);
    }
  }
```

with:

```ts
  private log(...args: unknown[]): void {
    logger.log(...args);
  }
```

- [ ] **Step 6: Fix the now-inaccurate test comment**

In `packages/extension/src/__tests__/KaggleDomParser.test.ts`, line 24 currently reads:

```ts
    // Suppress console noise from KaggleDomParser's DEBUG logger
```

Replace with:

```ts
    // Suppress console.warn/error noise (console.log is already silent
    // under test — logger.ts gates it behind DEBUG, unset here).
```

- [ ] **Step 7: Run the full extension suite**

Run (from `packages/extension`): `npx jest`
Expected: 3 suites, 12 tests, all passing (9 pre-existing + 3 new).

- [ ] **Step 8: Run the full pipeline**

Run (from repo root): `npm run lint && npm run type-check && npm run build && npm test`
Expected: green; lint still 0 errors/1 warning (the pre-existing `Overlay.tsx` warning, unrelated to this task).

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/utils/logger.ts packages/extension/src/utils/KaggleDomParser.ts packages/extension/src/utils/CodeMirrorManager.ts packages/extension/src/__tests__/logger.test.ts packages/extension/src/__tests__/KaggleDomParser.test.ts
git commit -m "fix(extension): gate debug logging behind DEBUG flag"
```

---

### Task 3: Popup robustness (F12)

**Files:**
- Create: `packages/extension/src/popup/contentScriptBridge.ts`
- Modify: `packages/extension/src/popup/PopupApp.tsx`
- Modify: `packages/extension/src/content/ContentApp.tsx:37-40,461-485` (ping branch)
- Test: `packages/extension/src/__tests__/contentScriptBridge.test.ts` (new)

**Interfaces:**
- Produces: `sendToContentScript<TResponse>(tabId: number, message: unknown): Promise<{ ok: true; response: TResponse } | { ok: false }>` and `pingContentScript(tabId: number): Promise<boolean>`, both from `packages/extension/src/popup/contentScriptBridge.ts`.
- Consumes (from `ContentApp.tsx`'s existing message protocol): the `ContentScriptMessage` discriminated union (currently `{type:'runLinter'}|{type:'toggleOverlay'}|{type:'settingsChanged',settings}`), extended with `{type:'ping'}`, answered with `{ pong: true }`.

- [ ] **Step 1: Write the failing test**

Create `packages/extension/src/__tests__/contentScriptBridge.test.ts`:

```ts
import { sendToContentScript, pingContentScript } from '../popup/contentScriptBridge';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/extension`): `npx jest src/__tests__/contentScriptBridge.test.ts`
Expected: FAIL — `Cannot find module '../popup/contentScriptBridge'`.

- [ ] **Step 3: Implement the bridge helper**

Create `packages/extension/src/popup/contentScriptBridge.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/contentScriptBridge.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Add the `ping` branch to ContentApp's message listener**

In `packages/extension/src/content/ContentApp.tsx`, extend the union at lines 37–40:

```ts
type ContentScriptMessage =
  | { type: 'runLinter' }
  | { type: 'toggleOverlay' }
  | { type: 'settingsChanged'; settings: Partial<Settings> };
```

to:

```ts
type ContentScriptMessage =
  | { type: 'runLinter' }
  | { type: 'toggleOverlay' }
  | { type: 'settingsChanged'; settings: Partial<Settings> }
  | { type: 'ping' };
```

In the same file's message listener (around lines 460–485), widen the `sendResponse` parameter type and add the branch:

```ts
      const messageListener = (
        message: ContentScriptMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: { success: boolean } | { pong: true }) => void
      ) => {
        logger.log('Received message:', message);

        if (message.type === 'runLinter') {
          logger.log('Message: runLinter');
          runLinterRef.current();
          sendResponse({ success: true });
        } else if (message.type === 'toggleOverlay') {
          logger.log('Message: toggleOverlay');
          setVisible((prev) => !prev);
          sendResponse({ success: true });
        } else if (message.type === 'settingsChanged') {
          logger.log('Message: settingsChanged', message.settings);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...message.settings,
          });
        } else if (message.type === 'ping') {
          sendResponse({ pong: true });
        }

        return true;
      };
```

- [ ] **Step 6: Replace PopupApp's URL-sniffing effect with a ping**

In `packages/extension/src/popup/PopupApp.tsx`, add the import:

```tsx
import { pingContentScript, sendToContentScript } from './contentScriptBridge';
```

Replace the "Check if current tab is a Kaggle page" effect (lines 42–52):

```tsx
  // Check if current tab is a Kaggle page
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          const isKagglePage = tabs[0].url.includes('kaggle.com');
          setIsKaggle(isKagglePage);
        }
      });
    }
  }, []);
```

with:

```tsx
  // Detect whether the content script is actually running in the active
  // tab (F12) — a URL match alone can't tell, since the content script
  // only injects on /code/*/*/edit, not every kaggle.com page.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId === undefined) {
        setIsKaggle(false);
        return;
      }
      pingContentScript(tabId).then(setIsKaggle);
    });
  }, []);
```

- [ ] **Step 7: Wrap the three existing sendMessage call sites**

Replace `saveSettings` (lines 77–93):

```tsx
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ linterSettings: newSettings });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) return;
        sendToContentScript(tabId, {
          type: 'settingsChanged',
          settings: newSettings,
        }).then((result) => {
          if (!result.ok) setIsKaggle(false);
        });
      });
    }
  };
```

Replace `handleRefresh` (lines 110–118):

```tsx
  const handleRefresh = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) return;
        sendToContentScript(tabId, { type: 'runLinter' }).then((result) => {
          if (!result.ok) setIsKaggle(false);
        });
      });
    }
  };
```

Replace `handleToggleOverlay` (lines 120–128):

```tsx
  const handleToggleOverlay = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) return;
        sendToContentScript(tabId, { type: 'toggleOverlay' }).then((result) => {
          if (!result.ok) setIsKaggle(false);
        });
      });
    }
  };
```

- [ ] **Step 8: Reword the not-connected panel**

In the `!isKaggle` branch (lines 130–158), replace the heading and message:

```tsx
            <h2>Not in Kaggle Notebook</h2>
            <p className="not-kaggle-text">
              This extension only works on Kaggle Notebooks.
            </p>
```

with:

```tsx
            <h2>Not Connected</h2>
            <p className="not-kaggle-text">
              Open a Kaggle notebook in edit mode to use this extension.
            </p>
```

- [ ] **Step 9: Run the full extension suite and pipeline**

Run: `npx jest` (from `packages/extension`) — expect 4 suites, 16 tests, all passing.
Run (from repo root): `npm run lint && npm run type-check && npm run build && npm test` — expect green.

- [ ] **Step 10: Manual check (not a blocking gate — Task 6 owns the final USER-GATE)**

Load `packages/extension/dist/` unpacked, open the popup on a plain `kaggle.com` page (not a notebook edit page) → "Not Connected" panel shows. Open a notebook in edit mode, open the popup → engine radio, ignore-codes field, Re-lint/Toggle Overlay buttons all work.

- [ ] **Step 11: Commit**

```bash
git add packages/extension/src/popup/contentScriptBridge.ts packages/extension/src/popup/PopupApp.tsx packages/extension/src/content/ContentApp.tsx packages/extension/src/__tests__/contentScriptBridge.test.ts
git commit -m "fix(popup): detect content script via ping; surface messaging failures"
```

---

### Task 4: Honest documentation (F24) — also verifies Task 1's (M8's) intent held

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Verify only, no edit: `docs/review-findings.md` (already carries per-finding "resolved"/"moot" annotations through M5 — confirmed by reading its current summary table)

**Step 0 — verify F11-full/F29/F25 intent still holds (per the milestone plan's own note that this task, not a re-run of "Task 1", is where that gets checked):**

```bash
grep -n "style.display" packages/ui-components/src/Overlay/Overlay.tsx
grep -n ": any" packages/extension/src/content/ContentApp.tsx packages/ui-components/src/Overlay/Overlay.tsx
grep -rn "scrollToLine" packages/extension/src
```

Expected: no matches for any of the three (confirmed already during planning — `Overlay.tsx` drives minimize/close via `isMinimized`/`visible` state + CSS classes; `ContentApp.tsx` types `errors`/`error` as `LintUIError[]`/`LintUIError`; the old placeholder `scrollToLine()` no longer exists at all, superseded by the real MAIN-world-bridge `scrollToCellLine` that Milestone 7 built for F33). If any of these ever shows a match, stop and re-open the corresponding finding instead of proceeding with the docs edit below.

- [ ] **Step 1: README.md fixes**

Remove the dead-link line (currently line 85):

```md
For detailed usage instructions, see [EXTENSION_USAGE.md](EXTENSION_USAGE.md).
```

Replace the false test-coverage claim (currently lines 171–176):

```md
Current test coverage:

- 21 unit tests passing
- All core rules tested
- Flake8/ruff engine logic verified
```

with:

```md
Current test coverage:

- `packages/core`: 31 tests across 4 suites (notebook-source building, severity mapping, syntax-isolation retry, the flake8 Python shim), enforced coverage thresholds
- `packages/extension`: 16 tests across 4 suites (cell store, DOM-scrape extraction fallback, debug-log gating, popup↔content-script messaging), enforced coverage thresholds
- `npm run lint`: 0 errors, 1 warning repo-wide (a deliberately-deferred `react-hooks/exhaustive-deps` gap in `Overlay.tsx` — see `docs/next_plans/milestone-4-config-and-build-hygiene/notes.md`)
```

Replace the standalone-demo section (currently lines 185–203, `#### Standalone Demo` through the bullet list) with:

```md
#### Standalone Demo

Removed along with `old-linter/` (see [next_plans/README.md](docs/next_plans/README.md) for a note on bringing a replacement back as a future milestone). For now, load the extension unpacked (see Installation above) and test against a real Kaggle notebook.
```

Replace the "Additional Documentation" section (currently lines 305–309):

```md
## 📚 Additional Documentation

- [Extension Usage Guide](EXTENSION_USAGE.md) - Detailed usage instructions
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Recent migration details
- [Migration History](MIGRATION.md) - Complete migration plan and history
```

with:

```md
## 📚 Additional Documentation

- [Architecture](docs/architecture.md) - Monorepo structure and runtime design
- [Review Findings](docs/review-findings.md) - Itemized issues found in the original TS/React migration, and their resolution status
- [Roadmap](docs/next_plans/README.md) - Milestone plans and execution history
```

Node/npm prerequisites (lines 29–30, "Node.js 22+" / "npm 10+") are already correct — verified against root `package.json`'s `engines` field (`>=22.19.0`/`>=10.9.3`); no change needed.

- [ ] **Step 2: docs/architecture.md fixes**

In the ui-components section, replace the stale F11 attribution:

```md
- `Overlay.tsx` mixes React state with direct DOM manipulation (minimize animation, close button set `style.display` directly) — a verbatim port of the old vanilla overlay. Unchanged by the consolidation project (F11's full fix is still Milestone 6, Task 1).
```

with:

```md
- `Overlay.tsx`'s minimize/close/visibility state is React state + CSS classes (F11 full, closed by **Milestone 8** Task 1, 2026-07-10 — moved out of Milestone 6 so M8's UI features could build on it). Dragging is the one place it still writes to the DOM directly, deliberately: a ref-held offset written to CSS custom properties (`--kaggle-lint-drag-x/-y`), so a mousemove doesn't re-render the panel.
```

In the CI/CD section, replace:

```md
- **ci.yml**: four jobs on push/PR — lint (`npm run lint` = `turbo run lint`; each package now defines a real `"lint": "eslint src --ext .ts,.tsx"` script as of Milestone 4, so this job actually checks something for the first time — F4 was the _CI-wiring_ finding and is formally credited to Milestone 5, but the underlying no-op is gone as of this milestone), type-check, test (core and now the lint-engine-consolidation project's additional core test suites; extension still has no test runner), build (uploads extension dist artifact). F5 (dead coverage upload) is still open, Milestone 5.
```

with:

```md
- **ci.yml**: four jobs on push/PR — lint, type-check, test, build. F4 (CI-wiring) and F5 (dead coverage upload) both resolved in **Milestone 5**: both packages' `test` scripts always run with `--coverage`, coverage thresholds are derived from measured coverage (not guessed), and codecov upload is wired for both packages' lcov output. `packages/extension` now has a real Jest + ts-jest + jsdom test runner (also Milestone 5), previously nonexistent. Post-M5 same-day follow-ups: GitHub Actions runner majors bumped to their Node-24-targeting versions (`actions/checkout@v7`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, `codecov/codecov-action@v7`) after the user's real (not `act`-simulated) CI run surfaced Node-20-deprecation warnings; ESLint migrated 8→9 flat config (`eslint.config.js` replacing `.eslintrc.js`); a `.gitattributes` (`* text=auto eol=lf`) fixes a Windows/`act` CRLF false-negative in `format:check`.
```

- [ ] **Step 3: Run the pipeline**

Run (from repo root): `npm run lint && npm run type-check && npm run build && npm test`
Expected: green (docs-only change, but confirms nothing was accidentally broken while editing).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture.md
git commit -m "docs: truthful README and refreshed architecture doc"
```

---

### Task 5: Delete old-linter (F30)

**Files:**
- Delete: `old-linter/` (entire folder, including the untracked-but-present `old-linter/.env` — confirmed via `git log --all -- old-linter/.env` returning nothing, i.e. it was never actually committed, so F30 as originally described is moot, but the stray file should still go with the folder)
- Modify: `docs/next_plans/README.md` (append a follow-up note)

- [ ] **Step 1: Re-confirm preconditions (already verified during planning, re-run to catch any drift)**

```bash
grep -rn "old-linter" packages/ turbo.json .github/ --include="*.{js,json,yml,ts,tsx}"
```

Expected: only source-comment provenance notes (`MIGRATION NOTE from old-linter/...`, `EXACT COPY from old-linter/...`) in `ErrorList.tsx`, `ErrorItem.tsx`, `KaggleDomParser.ts`, `CodeMirrorManager.ts`, `pageExtractor.ts`, `content/index.tsx` — no functional reference (no import, no path used by webpack/turbo/CI). If anything else shows up (e.g. a webpack `from:`/`to:` path pointing at `old-linter/`), stop — Milestone 4 Task 2 hasn't actually landed and this task's precondition fails.

- [ ] **Step 2: Delete the folder**

```bash
git rm -r old-linter
```

`git rm -r` only removes git-tracked files — the untracked, gitignored `old-linter/.env` (confirmed never committed) survives on disk, leaving a stale, mostly-empty `old-linter/` directory behind. Delete what's left directly:

```bash
rm -rf old-linter
```

- [ ] **Step 3: Note the removal in the roadmap doc**

Append to the end of `docs/next_plans/README.md` (after the "Rules for the executing agent" section):

```md

## Follow-ups

- **Standalone demo page**: removed along with `old-linter/` in Milestone 6 Task 5 (2026-07-10). A replacement (upload a `.ipynb`, lint without installing the extension) is a candidate future milestone, not yet planned.
```

- [ ] **Step 4: Verify the full pipeline from a clean install**

```bash
npm ci
npm run lint && npm run type-check && npm run build && npm test
```

Expected: green — confirms nothing outside `old-linter/` depended on it.

- [ ] **Step 5: Commit**

```bash
git add docs/next_plans/README.md
git commit -m "chore: remove legacy old-linter implementation"
```

---

### Task 6: Release pipeline honesty + ship (F28)

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`, `packages/core/package.json`, `packages/ui-components/package.json`, `packages/extension/package.json` (version bump)
- Modify: `docs/architecture.md` (one line — see Step 2)

- [ ] **Step 1: Replace the hardcoded release notes**

In `.github/workflows/release.yml`, delete the entire `release_notes.md` heredoc block (lines 37–68, the `Get release notes` step) and the `body_path: release_notes.md` line, replacing the `Create GitHub Release` step with:

```yaml
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: kaggle-linter-${{ github.ref_name }}.zip
          body: |
            ## Kaggle Python Linter ${{ github.ref_name }}

            ### Installation
            1. Download `kaggle-linter-${{ github.ref_name }}.zip`
            2. Extract the ZIP file
            3. Open Chrome and go to `chrome://extensions/`
            4. Enable "Developer mode"
            5. Click "Load unpacked" and select the extracted folder
          generate_release_notes: true
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This drops the now-false "9 custom lint rules" / "TypeScript + React migration complete" marketing copy (F28) — GitHub's own auto-generated notes (commit list since the last tag) replace it, with the install steps kept as a static, always-true prefix.

- [ ] **Step 2: Bump version to 2.1.0**

In `package.json`, `packages/core/package.json`, `packages/ui-components/package.json`, `packages/extension/package.json`, change `"version": "2.0.0"` to `"version": "2.1.0"` in all four (single-sourced into the shipped manifest and popup footer via M4's existing webpack `DefinePlugin`/`CopyPlugin` wiring — no other file needs a manual edit).

In `docs/architecture.md`'s "Settings & versioning" section, update the one place it cites the literal version so the doc doesn't go stale the moment this commit lands — replace:

```md
the three per-package `package.json`s (core/ui-components/extension) still independently say `"2.0.0"`, left as-is since those are internal `*`-linked workspace references that never ship.
```

with:

```md
the three per-package `package.json`s (core/ui-components/extension) are kept in sync with the root version by hand at release time (currently `"2.1.0"`) even though they're internal `*`-linked workspace references that never ship — cheap enough to keep from drifting once release bumps are already a manual step.
```

- [ ] **Step 3: Run the pipeline**

Run (from repo root): `npm run lint && npm run type-check && npm run build && npm test`
Expected: green.

- [ ] **Step 4: Commit the release-prep changes**

```bash
git add .github/workflows/release.yml package.json packages/core/package.json packages/ui-components/package.json packages/extension/package.json docs/architecture.md
git commit -m "release: honest release notes, bump to v2.1.0"
```

- [ ] **Step 5: USER-GATE — full manual E2E verification (required per `docs/next_plans/README.md` rule 4; this is the milestone's mandatory manual gate)**

Load `packages/extension/dist/` unpacked at `chrome://extensions`, then on a real Kaggle notebook edit page confirm all of:

1. Overlay appears on page load; built-in (ruff, default) lint runs and shows results.
2. Editing a cell triggers a re-lint within ~1s of the debounce settling (F8).
3. Ctrl+Shift+L re-lints on demand; Ctrl+Shift+H toggles the overlay.
4. Switching to Flake8 in the popup works fully offline (no network tab activity to PyPI/CDN — F9's bundled-wheels fix).
5. Popup: engine radio, ignore-codes field (both engines), Re-lint Now, Toggle Overlay all work; popup on a non-notebook `kaggle.com` page shows "Not Connected" (Task 3).
6. Overlay drag, minimize/expand, close/reopen (via popup's Toggle Overlay) all behave correctly, including the close-button desync F11 originally reported (should no longer reproduce).

**STOP here and report the result to the user before proceeding to Step 6.** If anything fails, fix it as a new task appended to this plan — do not tag a release against a failing manual gate.

- [ ] **Step 6: STOP — confirm with the user before tagging or pushing anything**

Do not run any command in Steps 7–8 until the user explicitly confirms they want to proceed with the tag/push/publish. This is the one genuinely outward-facing action in this milestone.

- [ ] **Step 7: Tag and push (only after explicit confirmation)**

```bash
git tag v2.1.0
git push origin main
git push origin v2.1.0
```

- [ ] **Step 8: Confirm the release published and smoke-test the artifact**

Watch the `release.yml` workflow run (GitHub Actions tab) to completion, then:

```bash
gh release download v2.1.0 -p "kaggle-linter-v2.1.0.zip"
```

Unzip, load unpacked at `chrome://extensions`, open a Kaggle notebook, confirm the overlay loads and lints — same smoke test as Step 5 items 1 and 4, just against the actual release artifact rather than a local build.

---

## Deferred (documented, not planned)

- **Standalone demo page** replacement after `old-linter/` deletion (Task 5) — noted in `docs/next_plans/README.md`'s new "Follow-ups" section.
- **Chrome Web Store publication** (listing assets, privacy policy) — separate effort with user involvement; the zip release covers sideloading only.
