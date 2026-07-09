# Milestone 1: Stabilize the Content Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the built-in lint path behave correctly: lint exactly once on load (after settings arrive), on explicit triggers only, with rule metadata defined in one place and overlay visibility owned by React state.

**Architecture:** All changes are inside `packages/extension/src/content/ContentApp.tsx`, `packages/extension/src/popup/PopupApp.tsx`, `packages/ui-components/src/Overlay/Overlay.tsx`, plus one new registry module in `packages/core`. No new dependencies, no manifest changes.

**Tech Stack:** TypeScript, React 18, Chrome extension APIs (`storage.sync`, `runtime.onMessage`), Jest (core only).

**Fixes findings:** F2 (infinite loop), F6 (settings race), F10 (flake8Status unrendered), F11-partial (close button), F14 (rule metadata ×3), F26 (engine rebuilt per lint). See `docs/review-findings.md`.

## Global Constraints

- Node >= 22.19.0, npm workspaces; run all commands from repo root unless a task says otherwise.
- Every task ends with `npm run type-check && npm run build` passing.
- Core changes require Jest tests (`cd packages/core && npx jest <file> -v`). Extension/UI packages have no test infra until Milestone 5 — verify those tasks by build + the manual check in the final task.
- Do not change the settings storage shape `{ linterEngine: 'handmade' | 'flake8', rules: Record<string, boolean> }` — existing users have it persisted in `chrome.storage.sync`.
- Keep console logging behavior as-is (cleanup is Milestone 6 / F27).

---

### Task 1: Kill the infinite re-lint loop (F2)

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx:183-217` (mount effect), `:232-250` (keyboard effect), `:256-295` (message effect)

**Interfaces:**
- Produces: a `runLinterRef: React.MutableRefObject<() => Promise<void>>` pattern that Tasks 2 and later tasks reuse. All effects that need to *call* the linter depend on the ref (stable identity), never on `runLinter` itself.

**Root cause recap:** the mount effect lists `runLinter` in its dependency array; `runLinter`'s `useCallback` identity changes whenever `isLinting` or `settings` change, so every lint re-arms the mount effect's 1-second timer → endless lint cycle.

- [ ] **Step 1: Introduce the latest-callback ref**

```tsx
// near the other refs in ContentApp
const runLinterRef = React.useRef<() => Promise<void>>(async () => {});
useEffect(() => {
  runLinterRef.current = runLinter;
}, [runLinter]);
```

- [ ] **Step 2: Make the mount effect run exactly once**

Replace the current mount effect's dependency array with `[]` and call through the ref:

```tsx
useEffect(() => {
  const detectedTheme = domParser.detectTheme();
  setTheme(detectedTheme);
  // (settings loading moves to Task 2)
  const timer = setTimeout(() => runLinterRef.current(), 1000);
  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3: Point the keyboard-shortcut and chrome.runtime message effects at the ref**

Both effects currently list `[runLinter]`; change their bodies to call `runLinterRef.current()` and their deps to `[]`. In the message listener, the `settingsChanged` branch must **not** call the linter directly anymore — `setSettings(...)` plus Task 3's settings-change effect handles the re-lint (otherwise it would lint with the previous engine due to the stale closure).

- [ ] **Step 4: Replace the `isLinting` state guard with a ref guard**

`if (isLinting) return;` inside `runLinter` reads a stale closure value and forces `isLinting` into the useCallback deps. Add `const isLintingRef = useRef(false);`, guard on the ref, keep `setIsLinting` solely for the spinner UI, and drop `isLinting` from `runLinter`'s dependency array.

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build` → both exit 0.
Static check: `grep -n "\[domParser, runLinter\]\|, \[runLinter\]" packages/extension/src/content/ContentApp.tsx` → no matches.

- [ ] **Step 6: Commit** — `fix(extension): stop infinite re-lint loop with latest-ref callback pattern`

---

### Task 2: First lint waits for settings (F6)

**Files:**
- Modify: `packages/extension/src/content/ContentApp.tsx`

**Interfaces:**
- Produces: `settingsLoaded: boolean` state; a dedicated settings-change effect that re-lints (consumed by Task 1 Step 3's message branch).

- [ ] **Step 1: Load settings in the mount effect, then flip a flag**

```tsx
const [settingsLoaded, setSettingsLoaded] = useState(false);

// inside the mount effect from Task 1, replacing the old storage block:
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.sync.get(['linterSettings'], (result: any) => {
    if (result.linterSettings) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...result.linterSettings,
        rules: { ...DEFAULT_SETTINGS.rules, ...(result.linterSettings.rules || {}) },
      });
    }
    setSettingsLoaded(true); // flips even when no saved settings exist
  });
} else {
  setSettingsLoaded(true);
}
```

Remove the `setTimeout(runLinter, 1000)` from the mount effect (moves to Step 2).

- [ ] **Step 2: Schedule the initial lint off `settingsLoaded`**

```tsx
useEffect(() => {
  if (!settingsLoaded) return;
  const timer = setTimeout(() => runLinterRef.current(), 1000);
  return () => clearTimeout(timer);
}, [settingsLoaded]);
```

- [ ] **Step 3: Re-lint on genuine settings changes**

Replace the existing settings-change effect (which only nulls the engine ref) with one that also lints — but skips the initial mount and the load itself:

```tsx
const prevSettingsRef = useRef<Settings | null>(null);
useEffect(() => {
  handmadeLintEngineRef.current = null;
  if (settingsLoaded && prevSettingsRef.current !== null) {
    runLinterRef.current();
  }
  prevSettingsRef.current = settings;
}, [settings, settingsLoaded]);
```

- [ ] **Step 4: Verify** — `npm run type-check && npm run build` pass. Confirm exactly one code path calls the linter for each trigger (initial load, shortcut, popup message, settings change): `grep -n "runLinterRef.current\|runLinter()" packages/extension/src/content/ContentApp.tsx`.

- [ ] **Step 5: Commit** — `fix(extension): defer first lint until settings load; re-lint once per settings change`

---

### Task 3: Single source of truth for rule metadata (F14)

**Files:**
- Create: `packages/core/src/rules/registry.ts`
- Test: `packages/core/src/__tests__/registry.test.ts`
- Modify: `packages/core/src/rules/index.ts` (re-export), `packages/core/src/index.ts` (re-export), `packages/extension/src/content/ContentApp.tsx` (delete `RULE_MAP` + `DEFAULT_SETTINGS.rules` literal), `packages/extension/src/popup/PopupApp.tsx` (delete `RULES` literal)

**Interfaces:**
- Produces (exact exports from `@kaggle-lint/core`):

```ts
export interface RuleInfo {
  id: string;                 // e.g. 'undefinedVariables' — must match LintRule.name
  displayName: string;        // e.g. 'Undefined Variables'
  description: string;        // popup copy
  defaultEnabled: boolean;    // true for all 9 today
  create: () => LintRule;     // factory, e.g. () => new UndefinedVariablesRule()
}
export const RULE_REGISTRY: RuleInfo[];                      // all 9, in current popup order
export function createEnabledRules(toggles: Record<string, boolean>): LintRule[];
export function defaultRuleToggles(): Record<string, boolean>;
```

- [ ] **Step 1: Write the failing test** (`packages/core/src/__tests__/registry.test.ts`)

```ts
import { RULE_REGISTRY, createEnabledRules, defaultRuleToggles } from '../rules/registry';

describe('rule registry', () => {
  it('has 9 rules whose ids match their instance names', () => {
    expect(RULE_REGISTRY).toHaveLength(9);
    for (const info of RULE_REGISTRY) {
      expect(info.create().name).toBe(info.id);
    }
  });

  it('defaultRuleToggles enables every rule', () => {
    const toggles = defaultRuleToggles();
    expect(Object.keys(toggles).sort()).toEqual(RULE_REGISTRY.map((r) => r.id).sort());
    expect(Object.values(toggles).every(Boolean)).toBe(true);
  });

  it('createEnabledRules honors toggles and ignores unknown ids', () => {
    const rules = createEnabledRules({ undefinedVariables: true, emptyCells: false, bogus: true });
    expect(rules.map((r) => r.name)).toEqual(['undefinedVariables']);
  });
});
```

- [ ] **Step 2: Run it to fail** — `cd packages/core && npx jest registry -v` → fails (module not found).

- [ ] **Step 3: Implement `registry.ts`** — build `RULE_REGISTRY` from the 9 rule classes, copying `displayName`/`description` strings from `PopupApp.tsx:12-67` (they are the user-facing source). `createEnabledRules(toggles)` = registry entries where `toggles[id] === true`, mapped through `create()`. `defaultRuleToggles()` = `Object.fromEntries(RULE_REGISTRY.map(r => [r.id, r.defaultEnabled]))`. Re-export all three plus `RuleInfo` from `rules/index.ts` and the package root `index.ts`.

- [ ] **Step 4: Run tests** — `cd packages/core && npx jest -v` → all pass (existing 2 suites + new one).

- [ ] **Step 5: Consume in the extension**
  - `ContentApp.tsx`: delete `RULE_MAP` and the rules literal in `DEFAULT_SETTINGS`; `DEFAULT_SETTINGS = { linterEngine: 'handmade', rules: defaultRuleToggles() }`; `getHandmadeLintEngine` becomes `new LintEngine(createEnabledRules(settings.rules))` — and while here, fix F26 by returning the cached `handmadeLintEngineRef.current` when non-null.
  - `PopupApp.tsx`: delete the `RULES` array; render from `RULE_REGISTRY` (`id`, `displayName`, `description`); derive `DEFAULT_SETTINGS.rules` from `defaultRuleToggles()`.

- [ ] **Step 6: Verify** — `npm run type-check && npm run build && npm test` all pass. `grep -rn "RULE_MAP\|description:" packages/extension/src/ | grep -v node_modules` shows no leftover per-rule metadata literals.

- [ ] **Step 7: Commit** — `refactor: single rule registry in core; popup and content script consume it`

---

### Task 4: Overlay close button uses React state (F11, partial)

**Files:**
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx:265-275`, `packages/ui-components/src/types/index.ts` (add `onClose?: () => void` to `OverlayProps`), `packages/extension/src/content/ContentApp.tsx` (pass `onClose={() => setVisible(false)}`)

- [ ] **Step 1:** Add `onClose?: () => void` to `OverlayProps`; in `Overlay.tsx` replace the close button's direct `style.display = 'none'` with `onClick={onClose}`.
- [ ] **Step 2:** In `ContentApp.tsx`, pass `onClose={() => setVisible(false)}`. Now popup "Toggle Overlay" and Ctrl+Shift+H restore it in one action.
- [ ] **Step 3:** Also remove the redundant `style={{ display: visible ? 'block' : 'none' }}` on the root div (`Overlay.tsx:224`) — the `if (!visible) return null;` above it already handles visibility; the inline style is the second half of the state-desync bug.
- [ ] **Step 4: Verify** — `npm run type-check && npm run build` pass.
- [ ] **Step 5: Commit** — `fix(ui): overlay close goes through React state via onClose prop`

---

### Task 5: Render Flake8 loading status (F10)

**Files:**
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (destructure `flake8Status`, render status line), `packages/ui-components/src/Overlay/Overlay.css` (one class)

**Interfaces:**
- Consumes: `flake8Status?: 'unloaded' | 'loading' | 'ready'` already declared in `OverlayProps` and already passed by `ContentApp.tsx:320`.

- [ ] **Step 1:** In `Overlay.tsx`, destructure `flake8Status` and render inside `.kaggle-lint-content`, above the summary:

```tsx
{flake8Status === 'loading' && (
  <div className="kaggle-lint-engine-status">
    Loading Flake8 (Pyodide)… first load can take up to 30 s
  </div>
)}
```

- [ ] **Step 2:** Add a `.kaggle-lint-engine-status` style to `Overlay.css` consistent with existing overlay styles (small, muted, padded; both `-theme-light` and `-theme-dark` variants like neighboring classes).
- [ ] **Step 3: Verify** — `npm run type-check && npm run build` pass; `grep -n flake8Status packages/ui-components/src/Overlay/Overlay.tsx` shows it used.
- [ ] **Step 4: Commit** — `feat(ui): show Flake8 loading status in overlay`

---

### Task 6: Manual verification gate

- [ ] **Step 1:** `npm run build`; load `packages/extension/dist/` unpacked at `chrome://extensions`; open any Kaggle notebook in edit mode (`https://www.kaggle.com/code/<user>/<slug>/edit`).
- [ ] **Step 2:** Confirm in DevTools console: `[Linter] Starting lint...` appears **once** ~1 s after load and does not repeat (watch ≥ 60 s). This is the F2 acceptance test.
- [ ] **Step 3:** Confirm: Ctrl+Shift+L triggers exactly one lint; toggling a rule in the popup triggers exactly one lint; overlay ✕ then popup "Toggle Overlay" brings it back in one click.
- [ ] **Step 4:** If any check fails, debug with superpowers:systematic-debugging before proceeding. If no browser is available, stop and ask the user to run this checklist.
- [ ] **Step 5: Commit** any fixes, then mark milestone complete.
