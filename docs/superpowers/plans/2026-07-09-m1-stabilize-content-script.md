# Milestone 1: Stabilize the Content Script — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the built-in lint path behave correctly: lint exactly once on load (after settings arrive), on explicit triggers only, with rule metadata defined in one place and overlay visibility owned by React state.

**Architecture:** All changes are inside `packages/extension/src/content/ContentApp.tsx`, `packages/extension/src/popup/PopupApp.tsx`, `packages/ui-components/src/Overlay/Overlay.tsx`, `packages/ui-components/src/types/index.ts`, plus one new registry module in `packages/core` (`packages/core/src/rules/registry.ts`). No new dependencies, no manifest changes.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`/`noUnusedParameters` on — see Global Constraints), React 18, Chrome extension APIs (`storage.sync`, `runtime.onMessage`), Jest 29 + ts-jest (core only).

**Fixes findings:** F2 (infinite loop), F6 (settings race), F10 (flake8Status unrendered), F11-partial (close button), F14 (rule metadata ×3), F26 (engine rebuilt per lint). See `docs/review-findings.md`.

**Source-of-truth check (done 2026-07-09):** every file path, line range, and signature named below was diffed against the actual current working tree (`git status` shows `ContentApp.tsx`, `PopupApp.tsx`, `Overlay.tsx`, and `ui-components/src/types/index.ts` as already-modified-but-uncommitted — this is the exact state `docs/review-findings.md` was written against). All line numbers the milestone plan cited matched byte-for-byte; no drift was found and no file has moved. Two corrections to the milestone plan's own text are folded in below (not decision changes — see "Deviations from the milestone plan" at the end).

## Global Constraints

- Node >= 22.19.0, npm workspaces; run all commands from repo root unless a task says otherwise.
- Every task ends with `npm run type-check && npm run build` passing.
- `tsconfig.base.json` has `"noUnusedLocals": true` and `"noUnusedParameters": true` — any import or variable a task's edit makes unused **will fail the build**, not just lint. Every task below explicitly deletes imports it orphans.
- Core changes require Jest tests (`cd packages/core && npx jest <file> -v`). Extension/UI packages have no test infra until Milestone 5 — verify those tasks by `type-check && build` plus the static `grep` checks each task specifies; do not invent a test runner for them.
- Do not change the settings storage shape `{ linterEngine: 'handmade' | 'flake8', rules: Record<string, boolean> }` — existing users have it persisted in `chrome.storage.sync`.
- Keep console logging behavior as-is (cleanup is Milestone 6 / F27) — do not delete or add `console.log` calls except where a step explicitly shows one moving.
- `@kaggle-lint/core` is already a runtime dependency of `packages/extension` (`packages/extension/package.json:12`) and is already imported successfully from `ContentApp.tsx` today — importing it from `PopupApp.tsx` (new in Task 3) needs no config change; webpack's alias (`webpack.config.js:41`) and the workspace symlink both already resolve it.

## File Structure

| File                                                 | Responsibility after this milestone                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/rules/registry.ts` (new)          | Single source of truth for rule id, display name, description, default-enabled, and factory — replaces the metadata copies in `PopupApp.tsx` and `ContentApp.tsx`.                                                                                     |
| `packages/core/src/__tests__/registry.test.ts` (new) | Jest coverage for the registry's three exports.                                                                                                                                                                                                        |
| `packages/core/src/rules/index.ts`                   | Re-exports `registry.ts` alongside the existing rule classes.                                                                                                                                                                                          |
| `packages/extension/src/content/ContentApp.tsx`      | Consumes `runLinterRef` (stable callback identity) instead of raw `useCallback` identities in effect deps; loads settings before first lint; builds the handmade engine from `createEnabledRules`/`defaultRuleToggles`; passes `onClose` to `Overlay`. |
| `packages/extension/src/popup/PopupApp.tsx`          | Renders rule toggles from `RULE_REGISTRY` instead of its own `RULES` array.                                                                                                                                                                            |
| `packages/ui-components/src/Overlay/Overlay.tsx`     | Close button calls `onClose` (React state) instead of mutating `overlayRef.current.style.display`; renders a `flake8Status === 'loading'` banner.                                                                                                      |
| `packages/ui-components/src/types/index.ts`          | `OverlayProps` gains `onClose?: () => void`.                                                                                                                                                                                                           |
| `packages/ui-components/src/Overlay/Overlay.css`     | New `.kaggle-lint-engine-status` rule (light + dark theme variants).                                                                                                                                                                                   |

---

### Task 1: Kill the infinite re-lint loop (F2)

**Files:**

- Modify: `packages/extension/src/content/ContentApp.tsx` — mount effect (currently lines 183-217), keyboard effect (currently lines 232-250), message effect (currently lines 256-295), `runLinter` callback (currently lines 124-177)

**Interfaces:**

- Produces: `runLinterRef: React.MutableRefObject<() => Promise<void>>` and `isLintingRef: React.MutableRefObject<boolean>` — both consumed by Task 2's edits to the same file.
- Consumes: nothing new; this task only restructures existing state (`isLinting`, `settings`) and the existing `runLinter`/`domParser`/`codeMirrorManager`/`getHandmadeLintEngine`/`initializeFlake8` already in the file.

**Root cause recap:** the mount effect (`ContentApp.tsx:217`) lists `runLinter` in its dependency array; `runLinter`'s `useCallback` identity changes whenever `isLinting` or `settings` change (`ContentApp.tsx:177`), so every lint re-arms the mount effect's 1-second timer → endless lint cycle. The keyboard and message effects have the same `[runLinter]` problem, so it doubles as a fix for spurious shortcut/message re-binding, though those two don't loop by themselves.

- [ ] **Step 1: Introduce the latest-callback ref**

In `ContentApp.tsx`, immediately after the existing refs (after the line `const codeMirrorManager = React.useRef(new CodeMirrorManager()).current;`, currently line 72), add:

```tsx
const runLinterRef = React.useRef<() => Promise<void>>(async () => {});
const isLintingRef = React.useRef(false);
```

- [ ] **Step 2: Replace the `isLinting` closure guard with the ref guard inside `runLinter`**

Find the `runLinter` callback (currently `ContentApp.tsx:124-177`):

```tsx
  const runLinter = useCallback(async () => {
    if (isLinting) {
      console.log('[Linter] Already linting, skipping...');
      return;
    }

    setIsLinting(true);
```

...

```tsx
    } finally {
      setIsLinting(false);
    }
  }, [isLinting, domParser, codeMirrorManager, settings, getHandmadeLintEngine, initializeFlake8]);
```

Replace with:

```tsx
  const runLinter = useCallback(async () => {
    if (isLintingRef.current) {
      console.log('[Linter] Already linting, skipping...');
      return;
    }

    isLintingRef.current = true;
    setIsLinting(true);
```

...

```tsx
    } finally {
      isLintingRef.current = false;
      setIsLinting(false);
    }
  }, [domParser, codeMirrorManager, settings, getHandmadeLintEngine, initializeFlake8]);
```

(Only the guard, the two lines inside `finally`, and the dependency array change — the body between `setIsLinting(true)` and the `finally` block, i.e. the cell-extraction/linting logic, is untouched.) `isLinting` state itself stays (still read by `isLoading={isLinting}` on the `<Overlay>` at the bottom of the component) — only its use as a re-render-triggering closure guard is removed.

- [ ] **Step 3: Sync the ref to the latest `runLinter` identity**

Directly after the `runLinter` callback's closing `}, [...]);`, add a new effect:

```tsx
useEffect(() => {
  runLinterRef.current = runLinter;
}, [runLinter]);
```

This is the only place `[runLinter]` may appear as a dependency array from now on — it exists precisely to let `runLinter`'s identity change freely without any _other_ effect re-running because of it.

- [ ] **Step 4: Make the mount effect run exactly once**

Find the mount effect (currently `ContentApp.tsx:183-217`):

```tsx
useEffect(() => {
  console.log('[Linter] Initializing ContentApp...');

  // Detect theme
  const detectedTheme = domParser.detectTheme();
  setTheme(detectedTheme);
  console.log('[Linter] Detected theme:', detectedTheme);

  // Load settings
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['linterSettings'], (result: any) => {
      if (result.linterSettings) {
        console.log(
          '[Linter] Loaded settings from storage:',
          result.linterSettings
        );
        setSettings({
          ...DEFAULT_SETTINGS,
          ...result.linterSettings,
          rules: {
            ...DEFAULT_SETTINGS.rules,
            ...(result.linterSettings.rules || {}),
          },
        });
      } else {
        console.log('[Linter] No saved settings, using defaults');
      }
    });
  }

  // Run linter after a brief delay
  const timer = setTimeout(() => {
    console.log('[Linter] Running initial lint...');
    runLinter();
  }, 1000);

  return () => clearTimeout(timer);
}, [domParser, runLinter]);
```

Replace the closing line and the lint-scheduling call (leave the theme detection and settings-loading body untouched — Task 2 will restructure the settings-loading part; this step only fixes the dependency array and the stale `runLinter()` call):

```tsx
    // Run linter after a brief delay
    const timer = setTimeout(() => {
      console.log('[Linter] Running initial lint...');
      runLinterRef.current();
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 5: Point the keyboard-shortcut effect at the ref**

Find (currently `ContentApp.tsx:232-250`):

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Shift+L: Run linter
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      console.log('[Linter] Keyboard shortcut: Re-lint');
      runLinter();
    }
    // Ctrl+Shift+H: Toggle overlay
    if (e.ctrlKey && e.shiftKey && e.key === 'H') {
      e.preventDefault();
      console.log('[Linter] Keyboard shortcut: Toggle overlay');
      setVisible((prev) => !prev);
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [runLinter]);
```

Replace `runLinter();` with `runLinterRef.current();` and the dependency array with `[]`:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Shift+L: Run linter
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      console.log('[Linter] Keyboard shortcut: Re-lint');
      runLinterRef.current();
    }
    // Ctrl+Shift+H: Toggle overlay
    if (e.ctrlKey && e.shiftKey && e.key === 'H') {
      e.preventDefault();
      console.log('[Linter] Keyboard shortcut: Toggle overlay');
      setVisible((prev) => !prev);
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

- [ ] **Step 6: Point the message-listener effect at the ref, and stop it from linting directly on `settingsChanged`**

Find (currently `ContentApp.tsx:256-295`):

```tsx
useEffect(() => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const messageListener = (message: any, _sender: any, sendResponse: any) => {
      console.log('[Linter] Received message:', message);

      if (message.type === 'runLinter') {
        console.log('[Linter] Message: runLinter');
        runLinter();
        sendResponse({ success: true });
      } else if (message.type === 'toggleOverlay') {
        console.log('[Linter] Message: toggleOverlay');
        setVisible((prev) => !prev);
        sendResponse({ success: true });
      } else if (message.type === 'settingsChanged') {
        console.log('[Linter] Message: settingsChanged', message.settings);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...message.settings,
          rules: {
            ...DEFAULT_SETTINGS.rules,
            ...(message.settings.rules || {}),
          },
        });
        // Run linter with new settings
        runLinter();
        sendResponse({ success: true });
      }

      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }
  return undefined;
}, [runLinter]);
```

Replace with (drops the direct `runLinter()` call in the `settingsChanged` branch — Task 2 Step 3 makes the settings-change itself trigger exactly one re-lint via `prevSettingsRef`; calling it here too would double-lint and, worse, would run with the pre-update `settings` closure since this listener's own `runLinter`/`settings` are frozen at effect-creation time under `[]` deps):

```tsx
useEffect(() => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const messageListener = (message: any, _sender: any, sendResponse: any) => {
      console.log('[Linter] Received message:', message);

      if (message.type === 'runLinter') {
        console.log('[Linter] Message: runLinter');
        runLinterRef.current();
        sendResponse({ success: true });
      } else if (message.type === 'toggleOverlay') {
        console.log('[Linter] Message: toggleOverlay');
        setVisible((prev) => !prev);
        sendResponse({ success: true });
      } else if (message.type === 'settingsChanged') {
        console.log('[Linter] Message: settingsChanged', message.settings);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...message.settings,
          rules: {
            ...DEFAULT_SETTINGS.rules,
            ...(message.settings.rules || {}),
          },
        });
      }

      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }
  return undefined;
}, []);
```

- [ ] **Step 7: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Static check — no effect may depend on `runLinter` except the ref-sync effect from Step 3:

```bash
grep -n "\[runLinter\]\|\[domParser, runLinter\]" packages/extension/src/content/ContentApp.tsx
```

Expected: exactly one match — the `useEffect(() => { runLinterRef.current = runLinter; }, [runLinter]);` line. If any other effect still lists `runLinter`, Step 4/5/6 was not applied correctly.

- [ ] **Step 8: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx
git commit -m "fix(extension): stop infinite re-lint loop with latest-ref callback pattern"
```

---

### Task 2: First lint waits for settings (F6)

**Files:**

- Modify: `packages/extension/src/content/ContentApp.tsx` (builds on Task 1's edits to the mount effect and settings-change effect)

**Interfaces:**

- Consumes: `runLinterRef` from Task 1 Step 1; the mount effect and settings-change effect as left by Task 1 Steps 4 and 6.
- Produces: `settingsLoaded: boolean` state and `prevSettingsRef: React.MutableRefObject<Settings | null>` — not consumed by any later task in this milestone, but Milestone 2/3 code that touches settings loading should be aware these exist.

- [ ] **Step 1: Add `settingsLoaded` state**

Directly after `const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);` (currently `ContentApp.tsx:66`), add:

```tsx
const [settingsLoaded, setSettingsLoaded] = useState(false);
```

- [ ] **Step 2: Flip `settingsLoaded` once settings are loaded, and stop scheduling the lint from inside the mount effect**

Find the mount effect as Task 1 Step 4 left it:

```tsx
useEffect(() => {
  console.log('[Linter] Initializing ContentApp...');

  // Detect theme
  const detectedTheme = domParser.detectTheme();
  setTheme(detectedTheme);
  console.log('[Linter] Detected theme:', detectedTheme);

  // Load settings
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['linterSettings'], (result: any) => {
      if (result.linterSettings) {
        console.log(
          '[Linter] Loaded settings from storage:',
          result.linterSettings
        );
        setSettings({
          ...DEFAULT_SETTINGS,
          ...result.linterSettings,
          rules: {
            ...DEFAULT_SETTINGS.rules,
            ...(result.linterSettings.rules || {}),
          },
        });
      } else {
        console.log('[Linter] No saved settings, using defaults');
      }
    });
  }

  // Run linter after a brief delay
  const timer = setTimeout(() => {
    console.log('[Linter] Running initial lint...');
    runLinterRef.current();
  }, 1000);

  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Replace with (removes the `setTimeout`/lint-scheduling block entirely — that moves to Step 3 below — and flips `settingsLoaded` in every branch, including when `chrome.storage` is unavailable, e.g. running the component outside the extension):

```tsx
useEffect(() => {
  console.log('[Linter] Initializing ContentApp...');

  // Detect theme
  const detectedTheme = domParser.detectTheme();
  setTheme(detectedTheme);
  console.log('[Linter] Detected theme:', detectedTheme);

  // Load settings
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['linterSettings'], (result: any) => {
      if (result.linterSettings) {
        console.log(
          '[Linter] Loaded settings from storage:',
          result.linterSettings
        );
        setSettings({
          ...DEFAULT_SETTINGS,
          ...result.linterSettings,
          rules: {
            ...DEFAULT_SETTINGS.rules,
            ...(result.linterSettings.rules || {}),
          },
        });
      } else {
        console.log('[Linter] No saved settings, using defaults');
      }
      setSettingsLoaded(true);
    });
  } else {
    setSettingsLoaded(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3: Schedule the initial lint off `settingsLoaded`, not off mount**

Directly after the mount effect from Step 2, add a new effect:

```tsx
useEffect(() => {
  if (!settingsLoaded) return;
  console.log('[Linter] Running initial lint...');
  const timer = setTimeout(() => runLinterRef.current(), 1000);
  return () => clearTimeout(timer);
}, [settingsLoaded]);
```

- [ ] **Step 4: Re-lint on genuine settings changes only (correction: this is the effect Task 1 Step 6 refers to, not a "Task 3" effect — see Deviations section at the end of this plan)**

Find the settings-change effect (currently `ContentApp.tsx:222-226`, untouched by Task 1):

```tsx
useEffect(() => {
  console.log('[Linter] Settings changed:', settings);
  // Invalidate the handmade engine so it gets recreated with new settings
  handmadeLintEngineRef.current = null;
}, [settings]);
```

Replace with:

```tsx
const prevSettingsRef = React.useRef<Settings | null>(null);
useEffect(() => {
  console.log('[Linter] Settings changed:', settings);
  // Invalidate the handmade engine so it gets recreated with new settings
  handmadeLintEngineRef.current = null;
  if (settingsLoaded && prevSettingsRef.current !== null) {
    runLinterRef.current();
  }
  prevSettingsRef.current = settings;
}, [settings, settingsLoaded]);
```

This is what makes the `settingsChanged` chrome-runtime message (Task 1 Step 6, which now only calls `setSettings(...)`) still trigger exactly one re-lint: `setSettings` changes `settings`, this effect runs, sees `prevSettingsRef.current` already non-null (set on the previous render), and lints with the _new_ `settings` — not the stale closure the old direct `runLinter()` call would have used.

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm exactly one code path calls the linter for each of the four triggers (initial load, Ctrl+Shift+L, popup `runLinter` message, settings change):

```bash
grep -n "runLinterRef.current()" packages/extension/src/content/ContentApp.tsx
```

Expected: 4 matches — the `settingsLoaded`-gated initial-lint effect, the keyboard handler, the `runLinter` message branch, and the settings-change effect.

Confirm the mount effect no longer schedules a lint itself:

```bash
grep -n "setTimeout" packages/extension/src/content/ContentApp.tsx
```

Expected: exactly one match, inside the `settingsLoaded`-gated effect from Step 3 (plus the unrelated `setTimeout` inside `handleErrorClick`'s highlight-removal at the bottom of the file, which is untouched — 2 matches total is also correct if that one counts).

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx
git commit -m "fix(extension): defer first lint until settings load; re-lint once per settings change"
```

---

### Task 3: Single source of truth for rule metadata (F14, plus F26)

**Files:**

- Create: `packages/core/src/rules/registry.ts`
- Test: `packages/core/src/__tests__/registry.test.ts`
- Modify: `packages/core/src/rules/index.ts` (re-export)
- Modify: `packages/extension/src/content/ContentApp.tsx` (delete `RULE_MAP`, the 9 rule-class imports it alone justified, and the `DEFAULT_SETTINGS.rules` literal; fix F26 by returning the cached engine)
- Modify: `packages/extension/src/popup/PopupApp.tsx` (delete the `RULES` literal; render from `RULE_REGISTRY`)

**Interfaces:**

- Produces (exact exports from `@kaggle-lint/core`, re-exported through `packages/core/src/rules/index.ts` → `packages/core/src/index.ts`'s existing `export * from './rules';`, so no edit to `packages/core/src/index.ts` is needed — see Deviations section):

```ts
export interface RuleInfo {
  id: string; // e.g. 'undefinedVariables' — matches each rule class's `name` field
  displayName: string; // e.g. 'Undefined Variables'
  description: string; // popup copy
  defaultEnabled: boolean; // true for all 9 today
  create: () => LintRule; // factory, e.g. () => new UndefinedVariablesRule()
}
export const RULE_REGISTRY: RuleInfo[]; // all 9, in current popup order
export function createEnabledRules(
  toggles: Record<string, boolean>
): LintRule[];
export function defaultRuleToggles(): Record<string, boolean>;
```

- Consumes: the 9 rule classes already exported from `packages/core/src/rules/index.ts` (`UndefinedVariablesRule`, `CapitalizationTyposRule`, `DuplicateFunctionsRule`, `EmptyCellsRule`, `ImportIssuesRule`, `IndentationErrorsRule`, `MissingReturnRule`, `RedefinedVariablesRule`, `UnclosedBracketsRule`) and `LintRule` from `packages/core/src/types/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/__tests__/registry.test.ts`:

```ts
import {
  RULE_REGISTRY,
  createEnabledRules,
  defaultRuleToggles,
} from '../rules/registry';

describe('rule registry', () => {
  it('has 9 rules whose ids match their instance names', () => {
    expect(RULE_REGISTRY).toHaveLength(9);
    for (const info of RULE_REGISTRY) {
      expect(info.create().name).toBe(info.id);
    }
  });

  it('defaultRuleToggles enables every rule', () => {
    const toggles = defaultRuleToggles();
    expect(Object.keys(toggles).sort()).toEqual(
      RULE_REGISTRY.map((r) => r.id).sort()
    );
    expect(Object.values(toggles).every(Boolean)).toBe(true);
  });

  it('createEnabledRules honors toggles and ignores unknown ids', () => {
    const rules = createEnabledRules({
      undefinedVariables: true,
      emptyCells: false,
      bogus: true,
    });
    expect(rules.map((r) => r.name)).toEqual(['undefinedVariables']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/core && npx jest registry -v`
Expected: FAIL — `Cannot find module '../rules/registry'`.

- [ ] **Step 3: Implement `registry.ts`**

Create `packages/core/src/rules/registry.ts`. Rule ids/display names/descriptions/order are copied verbatim from `packages/extension/src/popup/PopupApp.tsx:12-67` (the `RULES` array, which is the user-facing source about to be deleted in Step 5):

```ts
/**
 * Rule Registry
 * Single source of truth for rule metadata: id, display name, description,
 * default-enabled state, and the factory that builds a rule instance.
 */

import { LintRule } from '../types';
import { UndefinedVariablesRule } from './UndefinedVariablesRule';
import { CapitalizationTyposRule } from './CapitalizationTyposRule';
import { DuplicateFunctionsRule } from './DuplicateFunctionsRule';
import { ImportIssuesRule } from './ImportIssuesRule';
import { IndentationErrorsRule } from './IndentationErrorsRule';
import { EmptyCellsRule } from './EmptyCellsRule';
import { UnclosedBracketsRule } from './UnclosedBracketsRule';
import { RedefinedVariablesRule } from './RedefinedVariablesRule';
import { MissingReturnRule } from './MissingReturnRule';

export interface RuleInfo {
  id: string;
  displayName: string;
  description: string;
  defaultEnabled: boolean;
  create: () => LintRule;
}

export const RULE_REGISTRY: RuleInfo[] = [
  {
    id: 'undefinedVariables',
    displayName: 'Undefined Variables',
    description: 'Detect usage of undefined variables',
    defaultEnabled: true,
    create: () => new UndefinedVariablesRule(),
  },
  {
    id: 'capitalizationTypos',
    displayName: 'Capitalization Typos',
    description: 'Detect true/false/none instead of True/False/None',
    defaultEnabled: true,
    create: () => new CapitalizationTyposRule(),
  },
  {
    id: 'duplicateFunctions',
    displayName: 'Duplicate Functions',
    description: 'Detect duplicate function definitions',
    defaultEnabled: true,
    create: () => new DuplicateFunctionsRule(),
  },
  {
    id: 'importIssues',
    displayName: 'Import Issues',
    description: 'Detect wildcard and duplicate imports',
    defaultEnabled: true,
    create: () => new ImportIssuesRule(),
  },
  {
    id: 'indentationErrors',
    displayName: 'Indentation Errors',
    description: 'Detect missing indentation after colons',
    defaultEnabled: true,
    create: () => new IndentationErrorsRule(),
  },
  {
    id: 'emptyCells',
    displayName: 'Empty Cells',
    description: 'Detect empty or comment-only cells',
    defaultEnabled: true,
    create: () => new EmptyCellsRule(),
  },
  {
    id: 'unclosedBrackets',
    displayName: 'Unclosed Brackets',
    description: 'Detect unclosed parentheses, brackets, braces',
    defaultEnabled: true,
    create: () => new UnclosedBracketsRule(),
  },
  {
    id: 'redefinedVariables',
    displayName: 'Redefined Built-ins',
    description: 'Detect shadowing of built-in names',
    defaultEnabled: true,
    create: () => new RedefinedVariablesRule(),
  },
  {
    id: 'missingReturn',
    displayName: 'Missing Return',
    description: 'Detect functions that might need a return statement',
    defaultEnabled: true,
    create: () => new MissingReturnRule(),
  },
];

export function defaultRuleToggles(): Record<string, boolean> {
  return Object.fromEntries(
    RULE_REGISTRY.map((info) => [info.id, info.defaultEnabled])
  );
}

export function createEnabledRules(
  toggles: Record<string, boolean>
): LintRule[] {
  return RULE_REGISTRY.filter((info) => toggles[info.id] === true).map((info) =>
    info.create()
  );
}
```

- [ ] **Step 4: Re-export from `rules/index.ts`**

In `packages/core/src/rules/index.ts`, add one line to the export block at the top (after `export * from './UnclosedBracketsRule';`, currently line 15):

```ts
export * from './registry';
```

`packages/core/src/index.ts` needs **no change** — it already contains `export * from './rules';` (line 10), which now transitively re-exports `RuleInfo`, `RULE_REGISTRY`, `createEnabledRules`, and `defaultRuleToggles` from the package root `@kaggle-lint/core`.

- [ ] **Step 5: Run tests**

Run: `cd packages/core && npx jest -v`
Expected: PASS — the 2 existing suites (`LintEngine.test.ts`, `UndefinedVariablesRule.test.ts`) plus the new `registry.test.ts`, all green.

- [ ] **Step 6: Commit the registry**

```bash
git add packages/core/src/rules/registry.ts packages/core/src/rules/index.ts packages/core/src/__tests__/registry.test.ts
git commit -m "feat(core): add single-source rule registry"
```

- [ ] **Step 7: Consume the registry in `ContentApp.tsx` — delete `RULE_MAP` and its now-orphaned imports, fix F26**

`ContentApp.tsx` imports the 9 rule classes (currently lines 15-25) _solely_ to build `RULE_MAP` (currently lines 48-59). Once `RULE_MAP` is deleted those imports become unused, and `noUnusedLocals` (Global Constraints) will fail the build if they're left in — delete them together.

Find the two import blocks (currently `ContentApp.tsx:11-25`):

```tsx
import { Overlay } from '@kaggle-lint/ui-components';
import { LintEngine, Flake8Engine } from '@kaggle-lint/core';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
import {
  UndefinedVariablesRule,
  CapitalizationTyposRule,
  DuplicateFunctionsRule,
  EmptyCellsRule,
  ImportIssuesRule,
  IndentationErrorsRule,
  MissingReturnRule,
  RedefinedVariablesRule,
  UnclosedBracketsRule,
} from '@kaggle-lint/core';
```

Replace with:

```tsx
import { Overlay } from '@kaggle-lint/ui-components';
import {
  LintEngine,
  Flake8Engine,
  createEnabledRules,
  defaultRuleToggles,
} from '@kaggle-lint/core';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
```

Find `DEFAULT_SETTINGS` (currently lines 33-46):

```tsx
// Default settings
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'handmade',
  rules: {
    undefinedVariables: true,
    capitalizationTypos: true,
    duplicateFunctions: true,
    importIssues: true,
    indentationErrors: true,
    emptyCells: true,
    unclosedBrackets: true,
    redefinedVariables: true,
    missingReturn: true,
  },
};

// Rule mapping
const RULE_MAP: Record<string, () => any> = {
  undefinedVariables: () => new UndefinedVariablesRule(),
  capitalizationTypos: () => new CapitalizationTyposRule(),
  duplicateFunctions: () => new DuplicateFunctionsRule(),
  emptyCells: () => new EmptyCellsRule(),
  importIssues: () => new ImportIssuesRule(),
  indentationErrors: () => new IndentationErrorsRule(),
  missingReturn: () => new MissingReturnRule(),
  redefinedVariables: () => new RedefinedVariablesRule(),
  unclosedBrackets: () => new UnclosedBracketsRule(),
};
```

Replace with:

```tsx
// Default settings
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'handmade',
  rules: defaultRuleToggles(),
};
```

Find `getHandmadeLintEngine` (currently lines 77-87):

```tsx
const getHandmadeLintEngine = useCallback(() => {
  const enabledRules = Object.entries(settings.rules)
    .filter(([_, enabled]) => enabled)
    .map(([ruleId]) => RULE_MAP[ruleId]?.())
    .filter(Boolean);

  console.log(
    `[Linter] Creating handmade engine with ${enabledRules.length} rules`
  );
  handmadeLintEngineRef.current = new LintEngine(enabledRules);

  return handmadeLintEngineRef.current;
}, [settings.rules]);
```

Replace with (this is also the F26 fix — return the cached engine instead of rebuilding it on every call):

```tsx
const getHandmadeLintEngine = useCallback(() => {
  if (handmadeLintEngineRef.current) {
    return handmadeLintEngineRef.current;
  }

  const enabledRules = createEnabledRules(settings.rules);
  console.log(
    `[Linter] Creating handmade engine with ${enabledRules.length} rules`
  );
  handmadeLintEngineRef.current = new LintEngine(enabledRules);

  return handmadeLintEngineRef.current;
}, [settings.rules]);
```

This is safe because of Task 2 Step 4: the settings-change effect already sets `handmadeLintEngineRef.current = null` whenever `settings` changes, so the cache is invalidated exactly when it should be, and this function only ever rebuilds after a genuine settings change.

- [ ] **Step 8: Consume the registry in `PopupApp.tsx`**

Find the imports and `RULES` array (currently lines 9-83):

```tsx
import React, { useState, useEffect } from 'react';

// Available linting rules with display names and descriptions
const RULES = [
  {
    id: 'undefinedVariables',
    name: 'Undefined Variables',
    description: 'Detect usage of undefined variables',
    enabled: true,
  },
  // ... (8 more entries)
];

interface Settings {
  linterEngine: 'handmade' | 'flake8';
  rules: Record<string, boolean>;
}

const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'handmade',
  rules: RULES.reduce(
    (acc, rule) => {
      acc[rule.id] = rule.enabled;
      return acc;
    },
    {} as Record<string, boolean>
  ),
};
```

Replace with:

```tsx
import React, { useState, useEffect } from 'react';
import { RULE_REGISTRY, defaultRuleToggles } from '@kaggle-lint/core';

interface Settings {
  linterEngine: 'handmade' | 'flake8';
  rules: Record<string, boolean>;
}

const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'handmade',
  rules: defaultRuleToggles(),
};
```

Find the rule-list render block (currently lines 291-313):

```tsx
{
  RULES.map((rule) => {
    const isEnabled = settings.rules?.[rule.id] !== false;
    return (
      <div key={rule.id} className="rule-item">
        <div className="rule-info">
          <span className="rule-name">{rule.name}</span>
          <span className="rule-description">{rule.description}</span>
        </div>
        <label className="rule-toggle">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleRuleToggle(rule.id, e.target.checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>
    );
  });
}
```

Replace `RULES.map` with `RULE_REGISTRY.map` and `rule.name` with `rule.displayName` (the `RuleInfo` field name — `RULES` used `name`, `RuleInfo` uses `displayName`; everything else in the block is unchanged):

```tsx
{
  RULE_REGISTRY.map((rule) => {
    const isEnabled = settings.rules?.[rule.id] !== false;
    return (
      <div key={rule.id} className="rule-item">
        <div className="rule-info">
          <span className="rule-name">{rule.displayName}</span>
          <span className="rule-description">{rule.description}</span>
        </div>
        <label className="rule-toggle">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleRuleToggle(rule.id, e.target.checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>
    );
  });
}
```

- [ ] **Step 9: Verify**

Run: `npm run type-check && npm run build && npm test` → all pass.

Confirm no leftover per-rule metadata literals outside the registry:

```bash
grep -rn "RULE_MAP\|const RULES = \[" packages/extension/src/ | grep -v node_modules
```

Expected: no matches.

Confirm the 9 rule-class imports were actually removed from `ContentApp.tsx` (not just unused-but-present, which would fail the build anyway, but double-check intent):

```bash
grep -n "UndefinedVariablesRule\|CapitalizationTyposRule" packages/extension/src/content/ContentApp.tsx
```

Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx packages/extension/src/popup/PopupApp.tsx
git commit -m "refactor: popup and content script consume the core rule registry"
```

---

### Task 4: Overlay close button uses React state (F11, partial)

**Files:**

- Modify: `packages/ui-components/src/types/index.ts` (add `onClose?: () => void` to `OverlayProps`)
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (currently lines 64-72 destructuring, 219-225 root div, 265-275 close button)
- Modify: `packages/extension/src/content/ContentApp.tsx` (currently lines 312-322, the `<Overlay>` JSX)

**Interfaces:**

- Consumes: nothing new from earlier tasks in this file set (independent of Tasks 1-3's logic, though it touches the same `ContentApp.tsx` file — apply after Task 3 to avoid a merge conflict on the `<Overlay>` JSX block).
- Produces: `onClose?: () => void` on `OverlayProps`, consumed by `ContentApp.tsx`'s `<Overlay onClose={...} />`.

- [ ] **Step 1: Add `onClose` to `OverlayProps`**

In `packages/ui-components/src/types/index.ts`, find `OverlayProps` (currently lines 18-36):

```ts
export interface OverlayProps {
  errors: Array<{
    line: number;
    column?: number;
    msg: string;
    severity: 'error' | 'warning' | 'info';
    rule?: string;
    cellIndex?: number;
    cellLine?: number;
    element?: Element | null;
  }>;
  onErrorClick?: (error: any) => void;
  onRefresh?: () => Promise<void>;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  flake8Status?: 'unloaded' | 'loading' | 'ready';
}
```

Add `onClose` after `onRefresh`:

```ts
export interface OverlayProps {
  errors: Array<{
    line: number;
    column?: number;
    msg: string;
    severity: 'error' | 'warning' | 'info';
    rule?: string;
    cellIndex?: number;
    cellLine?: number;
    element?: Element | null;
  }>;
  onErrorClick?: (error: any) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  flake8Status?: 'unloaded' | 'loading' | 'ready';
}
```

- [ ] **Step 2: Destructure `onClose` in `Overlay.tsx` and wire the close button to it**

Find the component's prop destructuring (currently lines 64-72):

```tsx
export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onRefresh,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
}) => {
```

Replace with:

```tsx
export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
}) => {
```

Find the close button (currently lines 265-275):

```tsx
<button
  className="kaggle-lint-btn kaggle-lint-btn-close"
  title="Close"
  onClick={() => {
    if (overlayRef.current) {
      overlayRef.current.style.display = 'none';
    }
  }}
>
  ✕
</button>
```

Replace with:

```tsx
<button
  className="kaggle-lint-btn kaggle-lint-btn-close"
  title="Close"
  onClick={onClose}
>
  ✕
</button>
```

- [ ] **Step 3: Remove the redundant inline `display` style on the root div**

Find (currently lines 219-225):

```tsx
  return (
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme}`}
      style={{ display: visible ? 'block' : 'none' }}
    >
```

Replace with (the `if (!visible) return null;` a few lines above, currently line 202-204, already handles visibility — this `style` prop was the second half of the state-desync bug, since the close button used to bypass React by setting this same property directly):

```tsx
  return (
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme}`}
    >
```

- [ ] **Step 4: Pass `onClose` from `ContentApp.tsx`**

Find the returned `<Overlay>` (currently lines 312-322):

```tsx
return (
  <Overlay
    errors={errors}
    visible={visible}
    theme={theme}
    onErrorClick={handleErrorClick}
    onRefresh={runLinter}
    isLoading={isLinting}
    flake8Status={settings.linterEngine === 'flake8' ? flake8Status : undefined}
  />
);
```

Replace with:

```tsx
return (
  <Overlay
    errors={errors}
    visible={visible}
    theme={theme}
    onErrorClick={handleErrorClick}
    onRefresh={runLinter}
    onClose={() => setVisible(false)}
    isLoading={isLinting}
    flake8Status={settings.linterEngine === 'flake8' ? flake8Status : undefined}
  />
);
```

Now the popup's "Toggle Overlay" (which flips `visible` true→false→true via the `toggleOverlay` message handled in Task 1 Step 6) and Ctrl+Shift+H (which also flips `visible` via `setVisible((prev) => !prev)`, Task 1 Step 5) both restore the overlay in a single action after it's been closed with ✕, because `visible` in React state now always matches what's on screen.

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm the close button no longer touches `overlayRef` directly:

```bash
grep -n "overlayRef.current.style.display" packages/ui-components/src/Overlay/Overlay.tsx
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-components/src/types/index.ts packages/ui-components/src/Overlay/Overlay.tsx packages/extension/src/content/ContentApp.tsx
git commit -m "fix(ui): overlay close goes through React state via onClose prop"
```

---

### Task 5: Render Flake8 loading status (F10)

**Files:**

- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (currently lines 64-72 destructuring, 279-293 content block)
- Modify: `packages/ui-components/src/Overlay/Overlay.css`

**Interfaces:**

- Consumes: `flake8Status?: 'unloaded' | 'loading' | 'ready'`, already declared on `OverlayProps` (`packages/ui-components/src/types/index.ts:35`) and already passed by `ContentApp.tsx` (`flake8Status={settings.linterEngine === 'flake8' ? flake8Status : undefined}`, present since before this milestone and unchanged by Tasks 1-4).

- [ ] **Step 1: Destructure `flake8Status`**

In `Overlay.tsx`, extend the destructuring from Task 4 Step 2:

```tsx
export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
  flake8Status,
}) => {
```

- [ ] **Step 2: Render the status banner above the summary**

Find the content block (currently lines 279-293):

```tsx
<div className="kaggle-lint-content" id="kaggle-lint-content">
  <div className="kaggle-lint-summary">
    <span className="kaggle-lint-stat kaggle-lint-error">
      {SEVERITY_ICONS.error} {stats.bySeverity.error || 0}
    </span>
    <span className="kaggle-lint-stat kaggle-lint-warning">
      {SEVERITY_ICONS.warning} {stats.bySeverity.warning || 0}
    </span>
    <span className="kaggle-lint-stat kaggle-lint-info">
      {SEVERITY_ICONS.info} {stats.bySeverity.info || 0}
    </span>
  </div>

  <ErrorList errors={errors} onErrorClick={handleErrorClick} />
</div>
```

Replace with:

```tsx
<div className="kaggle-lint-content" id="kaggle-lint-content">
  {flake8Status === 'loading' && (
    <div className="kaggle-lint-engine-status">
      Loading Flake8 (Pyodide)… first load can take up to 30 s
    </div>
  )}

  <div className="kaggle-lint-summary">
    <span className="kaggle-lint-stat kaggle-lint-error">
      {SEVERITY_ICONS.error} {stats.bySeverity.error || 0}
    </span>
    <span className="kaggle-lint-stat kaggle-lint-warning">
      {SEVERITY_ICONS.warning} {stats.bySeverity.warning || 0}
    </span>
    <span className="kaggle-lint-stat kaggle-lint-info">
      {SEVERITY_ICONS.info} {stats.bySeverity.info || 0}
    </span>
  </div>

  <ErrorList errors={errors} onErrorClick={handleErrorClick} />
</div>
```

- [ ] **Step 3: Add the status banner style**

In `packages/ui-components/src/Overlay/Overlay.css`, add after the `.kaggle-lint-summary` / `.kaggle-lint-theme-dark .kaggle-lint-summary` rules (currently lines 236-253), following the same light/dark-pair convention used throughout this file:

```css
/* Engine status banner (e.g. Flake8/Pyodide loading) */
.kaggle-lint-engine-status {
  padding: 8px 16px;
  font-size: 11px;
  color: #666;
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.kaggle-lint-theme-dark .kaggle-lint-engine-status {
  color: #999;
  background: rgba(255, 255, 255, 0.03);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}
```

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run build` → both exit 0.

Confirm `flake8Status` is actually read (not just declared) in `Overlay.tsx`:

```bash
grep -n "flake8Status" packages/ui-components/src/Overlay/Overlay.tsx
```

Expected: 2 matches — the destructured prop and the `{flake8Status === 'loading' && ...}` render.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-components/src/Overlay/Overlay.tsx packages/ui-components/src/Overlay/Overlay.css
git commit -m "feat(ui): show Flake8 loading status in overlay"
```

---

### Task 6: Manual verification gate — USER-GATE

This task is not delegable to an agentic worker. It requires a real Chrome browser against a real Kaggle notebook, per the milestone plan (`docs/next_plans/README.md` rule 4: "If you cannot drive a browser, stop and ask the user to verify — do not claim the milestone done.").

- [ ] **Step 1:** From repo root, run `npm run build`. Confirm it exits 0 and `packages/extension/dist/` contains `content.js`, `popup.js`, `manifest.json`, `content.css`, `popup.css`, `icons/`, `pyodide/`.
- [ ] **Step 2:** Load `packages/extension/dist/` unpacked at `chrome://extensions` (Developer mode → "Load unpacked").
- [ ] **Step 3:** Open any Kaggle notebook in edit mode: `https://www.kaggle.com/code/<user>/<slug>/edit`.
- [ ] **Step 4:** Open DevTools console. Confirm `[Linter] Starting lint...` appears **exactly once**, roughly 1 second after the settings load, and does **not** repeat over the next 60+ seconds of idle observation. This is the F2 acceptance test — if it repeats, stop and use `superpowers:systematic-debugging` before proceeding; do not paper over it with another timer tweak.
- [ ] **Step 5:** Confirm Ctrl+Shift+L triggers exactly one additional lint (one more `[Linter] Starting lint...` line, no repeats afterward).
- [ ] **Step 6:** Open the extension popup, toggle a rule checkbox off/on. Confirm exactly one additional lint fires per toggle (this is the settings-change re-lint from Task 2 Step 4 — watch for it firing twice, which would mean the message-listener in Task 1 Step 6 still calls `runLinter()` directly somewhere).
- [ ] **Step 7:** Click the overlay's ✕ close button, then click "Toggle Overlay" in the popup. Confirm the overlay reappears after that **single** click (not two).
- [ ] **Step 8:** If any check in Steps 4-7 fails, debug with `superpowers:systematic-debugging`, fix, re-run the full Step 4-7 sequence from a fresh `npm run build` + reload, then commit the fix with a `fix(extension): ...` message before proceeding.
- [ ] **Step 9:** Once all checks pass, this comment closes out Milestone 1. No further commit is needed if Step 8 wasn't triggered.

---

## Deviations from the milestone plan

Per `docs/next_plans/README.md` rule 5, documented here rather than re-opening any decision in `docs/next_plans/milestone-1-stabilize-content-script/plan.md`:

1. **Task 1 Step 3 / Task 2 Step 3 cross-reference typo.** The milestone plan's Task 1 Step 3 says _"setSettings(...) plus **Task 3's** settings-change effect handles the re-lint"_ — but the settings-change re-lint effect is actually built in the milestone plan's own **Task 2** Step 3 ("Re-lint on genuine settings changes"); Task 3 in the milestone plan is the unrelated rule-registry work (F14). This TDD plan's Task 1 Step 6 and Task 2 Step 4 implement the intended behavior correctly and flag the correction inline; no behavior changes as a result, only the doc cross-reference.
2. **Orphaned imports from deleting `RULE_MAP`.** The milestone plan's Task 3 doesn't mention that `ContentApp.tsx`'s 9 individual rule-class imports (`UndefinedVariablesRule`, etc.) exist _only_ to build `RULE_MAP`, and that `tsconfig.base.json` has `noUnusedLocals`/`noUnusedParameters` enabled — so deleting `RULE_MAP` without deleting those imports would fail `npm run build`, not just look untidy. This plan's Task 3 Step 7 deletes them together; this is an implementation detail filling a gap, not a reversal of the milestone's decision to centralize rule metadata.
3. **`packages/core/src/index.ts` needs no edit.** The milestone plan's Task 3 "Files" list names `packages/core/src/index.ts` as something to modify for re-export. It already contains `export * from './rules';`, which transitively re-exports everything Step 4 adds to `packages/core/src/rules/index.ts`. No functional gap — noted so the executing agent doesn't add a no-op edit or, worse, a duplicate/conflicting explicit re-export line.

No other deviations were found: every other file path, line range, and signature named in `docs/next_plans/milestone-1-stabilize-content-script/plan.md` matched the current working tree exactly as of 2026-07-09.
