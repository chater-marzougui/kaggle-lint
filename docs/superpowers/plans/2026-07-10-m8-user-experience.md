# Milestone 8: User-Experience Features — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the linter feel like a product a Kaggle user keeps enabled: instant results on open (ruff default), problems visible _at the line_ in the editor, one-click muting of noisy codes, a glanceable count when the panel is tucked away, and a panel that stays where you put it.

**Architecture:** Task 1 rewrites `Overlay` from imperative DOM manipulation to React state + CSS (F11 full, moved here from Milestone 6 Task 1) so every later task in this milestone builds on a clean, typed component instead of extending the old pattern. Tasks 2–6 each layer one independent feature on top of Task 1's interfaces and on M7's plumbing (errors already carry `uuid` + exact `cellLine`; the MAIN-world scroll bridge already exists).

**Tech Stack:** React 18, CSS, `chrome.storage` (`sync` for linter settings, `local` for UI-only state), `chrome.action` badge API.

**Fixes findings:** F11 (full, via Task 1) plus pure feature work (no F-ids — this milestone came out of the 2026-07-10 "think as a user" review, not the original findings). Depends on: Milestone 7 (merged 2026-07-10). Runs before Milestones 4/5/6 in the recommended order (user-visible value first; M4/M5 are hygiene).

**Source-of-truth check (done 2026-07-10):** every file this plan touches was read in full from the current working tree, post-M7: `packages/ui-components/src/Overlay/Overlay.tsx`, `packages/ui-components/src/Overlay/Overlay.css`, `packages/ui-components/src/ErrorList/ErrorList.tsx`, `packages/ui-components/src/ErrorItem/ErrorItem.tsx`, `packages/ui-components/src/types/index.ts`, `packages/ui-components/src/index.ts`, `packages/core/src/types/index.ts`, `packages/core/src/index.ts`, `packages/extension/src/content/index.tsx`, `packages/extension/src/content/ContentApp.tsx`, `packages/extension/src/page/bridgeProtocol.ts`, `packages/extension/src/page/pageExtractor.ts`, `packages/extension/src/utils/KaggleDomParser.ts`, `packages/extension/src/utils/CodeMirrorManager.ts`, `packages/extension/src/utils/logger.ts`, `packages/extension/src/engine/EngineClient.ts`, `packages/extension/src/engine/protocol.ts`, `packages/extension/src/background/index.ts`, `packages/extension/src/offscreen/index.ts`, `packages/extension/src/popup/PopupApp.tsx`, `packages/extension/webpack.config.js`, `packages/extension/public/manifest.json`, `packages/extension/package.json`, `packages/ui-components/package.json`. Findings that correct or extend the milestone plan text (`docs/next_plans/milestone-8-user-experience/plan.md`), none of which reopen a milestone decision — logged in full at the end under "Deviations":

- Confirmed live (per `docs/next_plans/DEVELOPER_PROMPTS.md`'s M8 note): M7 already added `uuid?: string | null` to `OverlayProps['errors']` and deleted `Overlay.tsx`'s internal `scrollToError`/`highlightCell` plus its own `handleErrorClick`'s scroll call — `onErrorClick` is now a pure pass-through. Task 1 below is written against this actual current file, not the pre-M7 shape the milestone plan's Task 1 text paraphrases.
- **`packages/extension/public/content.css` does not exist.** The milestone plan's Task 3 lists it as a file to modify, but per `webpack.config.js`'s `CopyPlugin` config, the bundle's `content.css` is a straight copy of `packages/ui-components/src/Overlay/Overlay.css` — there is no separate extension-owned stylesheet. Task 3's marker CSS goes into `Overlay.css`, which already doubles as the page-level stylesheet the manifest injects (`content_scripts[0].css: ["content.css"]`), so rules targeting `.cm-line` (a Kaggle page element, not something inside the overlay's own subtree) apply correctly from there.
- `packages/extension/package.json` and `packages/ui-components/package.json` confirm neither package has a `test` script — this repo has exactly one Jest project (`packages/core`, per `CLAUDE.md`). Every task below substitutes `type-check && build` plus static `grep` checks for what would otherwise be a failing-test-first step, mirroring the established convention from `docs/superpowers/plans/2026-07-09-m2-reliable-code-extraction.md` and `docs/superpowers/plans/2026-07-10-m7-single-frame-and-navigation.md`. Do not add a Jest suite for either package; that's Milestone 5's job.
- `packages/ui-components/src/types/index.ts` still keeps its own local `Severity`/`LintError` duplicated from core (finding F15) — this plan does not fix that duplication; it is explicitly Milestone 4 Task 4's job (per `docs/architecture.md`). Task 1 below adds a new `LintUIError` type in the _same_ file, extending that local `LintError`, not core's — consistent with the file's existing (if duplicated) convention, and not a new instance of the drift since it's additive to what F15 already covers.
- `packages/extension/public/manifest.json` already declares an `"action"` key (popup + icons) with no separate `"action"` permission string required for `chrome.action.setBadgeText`/`setBadgeBackgroundColor` in MV3 — Task 5 needs no manifest change.
- The milestone plan's Task 5 Step 1 says "Minimized state currently shows only the title." Reading `Overlay.css` shows this is not quite accurate: only `.kaggle-lint-errors` and `.kaggle-lint-success` collapse to zero height when minimized (`Overlay.css:28-47`); `.kaggle-lint-summary` (the error/warning/info counts) has no such rule and stays visible today. Task 5 below is scoped down accordingly — it adds the worst-severity accent color (the part not already true) rather than re-adding counts that already render; this is noted again in Task 5 and in "Deviations."

## Global Constraints

- Every task ends with `npm run type-check && npm run build && npm test` green (Git Bash, repo root). `npm test` only exercises `packages/core`, which no task in this plan touches — it is a regression guard, not a new-test signal for this milestone's own work.
- Settings storage **shape** stays `{ linterEngine, flake8IgnoreCodes, ruffIgnoreCodes }` under the `linterSettings` key in `chrome.storage.sync` — Tasks 2 and 4 change _values_ only, never keys or types. New UI-only state (Task 6) goes in a _new_ `chrome.storage.local` key, never reusing or restructuring `linterSettings`.
- New UI is React-state + CSS only; no new imperative style-writing except ref-based drag-offset writes (Task 1), which the milestone plan explicitly allows.
- No new npm dependencies in any `package.json`.
- No test runner exists for `packages/extension` or `packages/ui-components` (confirmed above) — every task substitutes `type-check && build` plus static `grep`/`ls` checks for a failing-test-first step. Do not add one; that's Milestone 5's job.
- Bridge protocol (`bridgeProtocol.ts`) changes, if Task 3's live probe forces one, are additive-only (new message types / new optional fields), per M7's established convention — a stale-cached `pageExtractor.js` talking to a freshly-reloaded content script must degrade to safe default behavior, not throw or hang.
- No DOM elements or page expandos cross the `postMessage`/`chrome.runtime` boundary — plain JSON only.

## File Structure

| File                                                 | Responsibility after this milestone                                                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-components/src/types/index.ts`          | Gains `LintUIError` (the enriched error shape `Overlay`/`ErrorList`/`ErrorItem` actually render); `OverlayProps`/`ErrorListProps`/`ErrorItemProps` use it instead of `any`; gains `onIgnoreCode`, `initialPosition`, `initialMinimized`, `onStateChange`. |
| `packages/ui-components/src/Overlay/Overlay.tsx`     | Minimize/expand driven entirely by the `kaggle-lint-minimized` class + CSS; drag writes a ref-held offset to CSS custom properties; typed props throughout; accepts persisted UI state and reports changes via `onStateChange`.                           |
| `packages/ui-components/src/Overlay/Overlay.css`     | Owns minimize/drag geometry (was inline JS), the mute-button hover reveal, the in-editor line-marker classes (doubles as the page-injected `content.css`), and the worst-severity pill accent.                                                            |
| `packages/ui-components/src/ErrorItem/ErrorItem.tsx` | Gains a per-row mute button that calls `onIgnoreCode(code)` without triggering the row's scroll-to click.                                                                                                                                                 |
| `packages/ui-components/src/ErrorList/ErrorList.tsx` | Threads `onIgnoreCode` through to each `ErrorItem`.                                                                                                                                                                                                       |
| `packages/extension/src/content/lineMarkers.ts`      | New. Maps lint errors to rendered `.cm-line` elements via the CM6 line-number gutter (virtualization-safe) and applies/clears severity classes + tooltips.                                                                                                |
| `packages/extension/src/content/ContentApp.tsx`      | Typed `errors` state; ruff-first default; wires line markers (apply on lint, refresh on notebook mutation, clear on hide); one-click-ignore handler; sends lint-stats to the background worker; loads/saves/clamps persisted overlay UI state.            |
| `packages/extension/src/background/statsProtocol.ts` | New. Shared message type for content→background lint-count reporting (kept separate from `engine/protocol.ts`, which is engine-specific).                                                                                                                 |
| `packages/extension/src/background/index.ts`         | Gains a badge-setting branch for the new stats message, alongside its existing engine-message relay.                                                                                                                                                      |
| `packages/extension/src/popup/PopupApp.tsx`          | Ruff-first default; engine labels note load-time tradeoff.                                                                                                                                                                                                |

---

### Task 1: React-pure Overlay (F11 full)

**Files:**

- Modify: `packages/ui-components/src/types/index.ts` (entire file)
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (entire file)
- Modify: `packages/ui-components/src/Overlay/Overlay.css` (4 targeted edits)
- Modify: `packages/extension/src/content/ContentApp.tsx` (import + 2 targeted edits)

**Interfaces:**

- Consumes: nothing from an earlier task (this is the milestone's foundation task).
- Produces: `LintUIError` (exported from `packages/ui-components/src/types/index.ts`, re-exported via `@kaggle-lint/ui-components`'s `export * from './types'`) — the shape every later task's error-handling code uses. `Overlay`'s internal `dragOffsetRef: { x: number; y: number }` and the `--kaggle-lint-drag-x`/`--kaggle-lint-drag-y` CSS custom properties it writes — Task 6 reads/seeds these. The `kaggle-lint-btn-toggle` class on the minimize button and the `kaggle-lint-minimized` root class — Task 5 keys its pill accent off the same class.

- [ ] **Step 1: Add `LintUIError` and retype the UI prop interfaces**

Read the current file first (`packages/ui-components/src/types/index.ts`, 61 lines, already quoted in the source-of-truth check above). Replace its entire contents with:

```ts
/**
 * UI Component Types
 * Re-export core types and add UI-specific types
 */

// Note: These types are duplicated from core to avoid circular dependency during build
export type Severity = 'error' | 'warning' | 'info';

export interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: Severity;
  rule?: string;
  code?: string;
  cellIndex?: number;
}

/**
 * A LintError enriched with what the overlay needs to render and act on a
 * violation: its position within the cell (vs. the whole-notebook line the
 * bare `line` field carries), the live DOM element for click-to-scroll
 * (null once Kaggle virtualizes the cell out of the DOM), and the cell's
 * stable uuid (added in Milestone 7) for the MAIN-world scroll bridge.
 * This is the actual shape every UI component below receives — replacing
 * the untyped `any` that used to stand in for it (F29).
 */
export interface LintUIError extends LintError {
  cellLine?: number;
  element?: Element | null;
  uuid?: string | null;
}

export interface OverlayProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
}

export interface ErrorStats {
  total: number;
  bySeverity: {
    error: number;
    warning: number;
    info: number;
  };
}

export interface ErrorListProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
}

export interface ErrorItemProps {
  error: LintUIError;
  index: number;
  onClick?: () => void;
}
```

(This step deliberately does not add `onIgnoreCode`, `initialPosition`, `initialMinimized`, or `onStateChange` yet — those are Tasks 4 and 6's job, kept out of this task so its diff stays scoped to F11/F29.)

- [ ] **Step 2: Rewrite `Overlay.tsx`**

Read the current file first (`packages/ui-components/src/Overlay/Overlay.tsx`, 284 lines, already quoted in the source-of-truth check above — note its own header comment claims "ALL DOM manipulation... preserved exactly," which this step makes false and removes). Replace its entire contents with:

```tsx
/**
 * Overlay Component
 * Main overlay UI for displaying lint results. Minimize/expand state and
 * geometry are driven by React state + CSS classes (F11) — dragging is the
 * one place this component still writes to the DOM directly, and it does
 * so via a ref-held offset written to CSS custom properties, not React
 * state, so a drag doesn't re-render the panel on every mousemove.
 */

import React, { useState, useEffect, useRef } from 'react';
import { OverlayProps, ErrorStats, LintUIError } from '../types';
import { ErrorList } from '../ErrorList';
import './Overlay.css';

const SEVERITY_ICONS = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

function calculateStats(errors: LintUIError[]): ErrorStats {
  const stats: ErrorStats = {
    total: errors.length,
    bySeverity: {
      error: 0,
      warning: 0,
      info: 0,
    },
  };

  errors.forEach((error) => {
    stats.bySeverity[error.severity]++;
  });

  return stats;
}

export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
  engineStatus,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const stats = calculateStats(errors);

  /**
   * Dragging: ref-based, no re-render per mousemove. Writes the offset
   * straight to `--kaggle-lint-drag-x`/`-y`, consumed by the root's
   * `transform: translate(...)` in Overlay.css.
   */
  useEffect(() => {
    if (!overlayRef.current || !headerRef.current) return;

    const overlay = overlayRef.current;
    const header = headerRef.current;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      baseX = dragOffsetRef.current.x;
      baseY = dragOffsetRef.current.y;
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const x = baseX + (e.clientX - startX);
      const y = baseY + (e.clientY - startY);
      dragOffsetRef.current = { x, y };
      overlay.style.setProperty('--kaggle-lint-drag-x', `${x}px`);
      overlay.style.setProperty('--kaggle-lint-drag-y', `${y}px`);
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    header.style.cursor = 'move';
    header.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      header.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  /**
   * Toggle minimize state. All geometry/opacity/transition for the
   * minimized "pill" shape lives in Overlay.css, driven by the
   * `kaggle-lint-minimized` class — no direct style writes here beyond
   * resetting the drag offset so the pill docks bottom-right, matching the
   * pre-rewrite UX.
   */
  const handleToggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      if (next && overlayRef.current) {
        dragOffsetRef.current = { x: 0, y: 0 };
        overlayRef.current.style.setProperty('--kaggle-lint-drag-x', '0px');
        overlayRef.current.style.setProperty('--kaggle-lint-drag-y', '0px');
      }
      return next;
    });
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      await new Promise((resolve) => setTimeout(resolve, 200)); // Small delay for UX
      setIsRefreshing(false);
    }
  };

  /**
   * Handle error click. Scrolling is the app's responsibility (F33,
   * Milestone 7) — ContentApp's onErrorClick drives the MAIN-world bridge
   * scroll with its own DOM fallback; Overlay never scrolls on its own.
   */
  const handleErrorClick = (error: LintUIError) => {
    onErrorClick?.(error);
  };

  if (!visible) {
    return null;
  }

  const chevronIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );

  const refreshIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );

  return (
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme} ${
        isMinimized ? 'kaggle-lint-minimized' : ''
      }`}
    >
      <div ref={headerRef} className="kaggle-lint-header">
        <span className="kaggle-lint-title">
          <img
            src={chrome?.runtime?.getURL?.('icons/icon48.png') || ''}
            alt="Kaggle Linter"
            className="kaggle-lint-title-icon"
            onError={(e) => {
              // Hide image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="kaggle-lint-title-text">Python Linter</span>
        </span>

        <div className="kaggle-lint-controls">
          <button
            className={`kaggle-lint-btn kaggle-lint-btn-icon ${
              isRefreshing || isLoading ? 'kaggle-lint-spinning' : ''
            }`}
            title="Refresh lint"
            id="kaggle-lint-refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            {refreshIcon}
          </button>

          <button
            className="kaggle-lint-btn kaggle-lint-btn-icon kaggle-lint-btn-toggle"
            title={isMinimized ? 'Expand' : 'Minimize'}
            onClick={handleToggleMinimize}
          >
            {chevronIcon}
          </button>

          <button
            className="kaggle-lint-btn kaggle-lint-btn-close"
            title="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="kaggle-lint-content" id="kaggle-lint-content">
        {engineStatus === 'loading' && (
          <div className="kaggle-lint-engine-status">
            Loading linter engine… first load can take up to 30 s
          </div>
        )}
        {engineStatus === 'failed' && (
          <div className="kaggle-lint-engine-status">
            Linter engine failed to load — check the offscreen document's
            console (chrome://extensions → this extension → inspect the "service
            worker" / "offscreen document" links) or try re-linting.
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
    </div>
  );
};
```

Note what's gone versus the current file: the module-level `handleToggleMinimize`'s nested `setTimeout`s and direct `overlay.style.width/right/bottom/left/top` writes, and the `titleText` opacity/display choreography — all replaced by the `kaggle-lint-minimized` class plus Step 3's CSS. The chevron's inline `style={{ transform: ..., transition: ... }}` is also gone, replaced by the `kaggle-lint-btn-toggle` class plus Step 3's CSS.

- [ ] **Step 3: Move minimize/drag geometry into `Overlay.css`**

In `packages/ui-components/src/Overlay/Overlay.css`, find the top rule block (currently lines 1-22):

```css
.kaggle-lint-overlay {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 450px;
  max-height: 65vh;
  z-index: 10000;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
    'Cantarell', sans-serif;
  font-size: 13px;
  overflow: hidden;
  transition:
    width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    right 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

Replace with:

```css
.kaggle-lint-overlay {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 450px;
  max-height: 65vh;
  z-index: 10000;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
    'Cantarell', sans-serif;
  font-size: 13px;
  overflow: hidden;
  /* Overlay.tsx writes these two directly via ref on drag, never through
     React state, so a drag doesn't re-render the panel. */
  --kaggle-lint-drag-x: 0px;
  --kaggle-lint-drag-y: 0px;
  transform: translate(var(--kaggle-lint-drag-x), var(--kaggle-lint-drag-y));
  transition:
    width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

Find the minimized max-height rule right after it (currently lines 24-26):

```css
.kaggle-lint-overlay.kaggle-lint-minimized {
  max-height: none;
}
```

Replace with:

```css
.kaggle-lint-overlay.kaggle-lint-minimized {
  max-height: none;
  width: 200px;
}
```

Find the title-text rule (currently lines 113-120):

```css
.kaggle-lint-title-text {
  font-weight: 500;
  font-size: 13px;
  letter-spacing: 0.5px;
  vertical-align: middle;
  transition: opacity 0.2s ease;
  margin: 0;
}
```

Replace with:

```css
.kaggle-lint-title-text {
  font-weight: 500;
  font-size: 13px;
  letter-spacing: 0.5px;
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  max-width: 160px;
  opacity: 1;
  margin: 0;
  transition:
    opacity 0.2s ease,
    max-width 0.2s ease;
}

.kaggle-lint-minimized .kaggle-lint-title-text {
  opacity: 0;
  max-width: 0;
}
```

Find the button-icon svg sizing rule (currently lines 158-161):

```css
.kaggle-lint-btn svg {
  width: 16px;
  height: 16px;
}
```

Replace with:

```css
.kaggle-lint-btn svg {
  width: 16px;
  height: 16px;
}

.kaggle-lint-btn-toggle svg {
  transition: transform 0.3s ease;
}

.kaggle-lint-minimized .kaggle-lint-btn-toggle svg {
  transform: rotate(180deg);
}
```

- [ ] **Step 4: Type `ContentApp`'s error state and click handler**

In `packages/extension/src/content/ContentApp.tsx`, add the import (near the other `@kaggle-lint/ui-components` import, currently line 8):

```tsx
import { Overlay } from '@kaggle-lint/ui-components';
```

Replace with:

```tsx
import { Overlay } from '@kaggle-lint/ui-components';
import type { LintUIError } from '@kaggle-lint/ui-components';
```

Find (currently line 30):

```tsx
const [errors, setErrors] = useState<any[]>([]);
```

Replace with:

```tsx
const [errors, setErrors] = useState<LintUIError[]>([]);
```

Find `handleErrorClick` (currently lines 372-396, the doc comment plus function):

```tsx
  const handleErrorClick = async (error: any) => {
```

Replace with:

```tsx
  const handleErrorClick = async (error: LintUIError) => {
```

(No other line in that function changes — `error.uuid`, `error.cellIndex`, `error.cellLine`, `error.line`, `error.element` are all already valid reads under `LintUIError`'s shape.)

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build && npm test`
Expected: all exit 0. (`npm test` only touches `packages/core`, untouched by this task — a pure regression check.)

```bash
grep -n "errors: any\[\]\|error: any" packages/extension/src/content/ContentApp.tsx
```

Expected: no matches (both `any` sites this task targets are gone; the chrome-messaging `message: any`/`sendResponse: any` in the unrelated `messageListener` callback further down the file are out of this task's scope and will still match a broader `grep -n "any"` — that's expected, not a failure).

```bash
grep -n "overlay.style.width\|overlay.style.right\|overlay.style.bottom\|overlay.style.left\|overlay.style.top\|titleText" packages/ui-components/src/Overlay/Overlay.tsx
```

Expected: no matches — confirms the imperative minimize choreography is gone.

```bash
grep -n "kaggle-lint-drag-x\|kaggle-lint-minimized" packages/ui-components/src/Overlay/Overlay.tsx packages/ui-components/src/Overlay/Overlay.css
```

Expected: matches in both files.

This task's visual behavior (minimize/expand animates, drag works, click-to-scroll still works) needs a real Chrome + Kaggle notebook to confirm — covered by Task 7's USER-GATE, not repeated per-task from here on (same convention Milestone 7 used for its own UI-adjacent tasks).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-components/src/types/index.ts packages/ui-components/src/Overlay/Overlay.tsx packages/ui-components/src/Overlay/Overlay.css packages/extension/src/content/ContentApp.tsx
git commit -m "refactor(ui): overlay state and animation via React + CSS; typed error props (F11, F29)"
```

---

### Task 2: Ruff as the default engine

**Files:**

- Modify: `packages/extension/src/content/ContentApp.tsx` (`DEFAULT_SETTINGS`, currently lines 23-27)
- Modify: `packages/extension/src/popup/PopupApp.tsx` (`DEFAULT_SETTINGS` at lines 14-18, and the two `option-label` spans at lines 191 and 206)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks — this is a self-contained default-value change.

- [ ] **Step 1: Default to ruff in the content script**

In `packages/extension/src/content/ContentApp.tsx`, find:

```tsx
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'flake8',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};
```

Replace with:

```tsx
// Ruff (ruff-wasm, no Python/Pyodide) initializes in milliseconds; flake8's
// first Pyodide load is ~30 s. A first-run user should see results before
// they wonder if the extension works. This only affects installs with no
// saved settings yet — chrome.storage.sync's `linterSettings` always wins
// once it exists, so upgrading users keep whatever they already chose.
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'ruff',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};
```

- [ ] **Step 2: Default to ruff in the popup**

In `packages/extension/src/popup/PopupApp.tsx`, find:

```tsx
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'flake8',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};
```

Replace with:

```tsx
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'ruff',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};
```

- [ ] **Step 3: Label the load-time tradeoff in the popup copy**

Find (currently lines 190-196):

```tsx
<div className="option-info">
  <span className="option-label">Flake8</span>
  <span className="option-description">
    Industry-standard Python linter (pyflakes + pycodestyle + mccabe)
  </span>
</div>
```

Replace with:

```tsx
<div className="option-info">
  <span className="option-label">Flake8 (slower first load)</span>
  <span className="option-description">
    Industry-standard Python linter (pyflakes + pycodestyle + mccabe)
  </span>
</div>
```

Find (currently lines 205-211):

```tsx
<div className="option-info">
  <span className="option-label">Ruff</span>
  <span className="option-description">
    Fast Rust-based Python linter — no Python runtime needed
  </span>
</div>
```

Replace with:

```tsx
<div className="option-info">
  <span className="option-label">Ruff (recommended — instant)</span>
  <span className="option-description">
    Fast Rust-based Python linter — no Python runtime needed
  </span>
</div>
```

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run build && npm test`
Expected: all exit 0.

```bash
grep -n "linterEngine: 'ruff'" packages/extension/src/content/ContentApp.tsx packages/extension/src/popup/PopupApp.tsx
```

Expected: one match in each file.

Manual (or defer to Task 7): clear extension storage (`chrome.storage.sync.clear()` from the popup's own DevTools inspector, or a fresh profile) and reload a notebook — ruff runs with no configuration, results well under 5 s.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/content/ContentApp.tsx packages/extension/src/popup/PopupApp.tsx
git commit -m "feat(extension): default new installs to the ruff engine"
```

---

### Task 3: In-editor line markers (the flagship)

**Files:**

- Create: `packages/extension/src/content/lineMarkers.ts`
- Modify: `packages/extension/src/content/ContentApp.tsx`
- Modify: `packages/ui-components/src/Overlay/Overlay.css` (**not** `packages/extension/public/content.css` — see the source-of-truth note above; that file doesn't exist, and `Overlay.css` is the actual source of the bundled `content.css`)
- Create: `docs/next_plans/milestone-8-user-experience/notes.md`

**Interfaces:**

- Consumes: `LintUIError` (Task 1), specifically `.element` (the `.jp-Cell`), `.cellLine`/`.line`, `.severity`, `.code`, `.msg`.
- Produces: `applyLineMarkers(targets: MarkerTarget[]): void` and `clearAllLineMarkers(root?: ParentNode): void`, exported from `lineMarkers.ts` — used only within `ContentApp.tsx` in this plan, but self-contained enough for a later task to reuse.

**Live-probe caveat (per the milestone plan's explicit instruction — this is a probe-first task, not a solved one):** the mapping below reads CodeMirror 6's line-number gutter (`.cm-gutters .cm-lineNumbers .cm-gutterElement`) to pair each rendered `.cm-line` with its real document line number, rather than trusting position-in-children (which is only correct for the top of a short, fully-rendered cell). This is CM6's own standard package structure (stable across CM6-based editors, not a Kaggle-specific guess — a line-number gutter's entire purpose is staying correct as you scroll), and is the "isolated-world signal" the milestone plan itself names as most promising to try first. It has **not** been confirmed against a live Kaggle notebook. Step 1 below is a live DevTools probe to run before trusting the implementation; if the selectors don't match what Kaggle actually renders, adapt `buildLineElementMap` in Step 3 to match what you find (keep the two exported function signatures unchanged so `ContentApp.tsx`'s Step 4 wiring doesn't need to change), and record what you found in `notes.md`. Only if **no** reliable isolated-world DOM signal exists at all should you extend `bridgeProtocol.ts` with a new `LINE_GEOMETRY`-style request/response pair, following the exact request/response-with-timeout pattern `SCROLL_TO_CELL_LINE_REQUEST`/`_RESPONSE` already established in Milestone 7 (`packages/extension/src/page/bridgeProtocol.ts`, `pageExtractor.ts`, `KaggleDomParser.ts`) — do not design a new pattern for it if you end up needing it.

- [ ] **Step 1: Live-probe the gutter structure**

On a real Kaggle notebook in edit mode, open DevTools, select any code cell's editor, and run in the console:

```js
document.querySelector('.jp-CodeCell .cm-gutters .cm-lineNumbers');
```

Expected: a non-null element containing one `.cm-gutterElement` child per currently-rendered line, each with a `textContent` equal to that line's real document line number (test this explicitly: scroll a 200+ line cell partway down and confirm the _first visible_ gutter element's text is **not** `"1"`).

```js
document.querySelectorAll('.jp-CodeCell .cm-content > .cm-line').length ===
  document.querySelectorAll(
    '.jp-CodeCell .cm-gutters .cm-lineNumbers .cm-gutterElement'
  ).length;
```

Expected: `true` — confirms the gutter and content render the same number of visible lines in the same order, which is what lets Step 3 pair them positionally without ever assuming "line N" means "the Nth `.cm-line` child."

If either check fails, do not proceed with Step 3 as written — inspect the actual class names/structure via `document.querySelector('.jp-CodeCell .cm-editor')` and adapt, recording what you found in `notes.md` per the caveat above.

- [ ] **Step 2: Add the CSS marker classes**

In `packages/ui-components/src/Overlay/Overlay.css`, append at the end of the file:

```css
/* In-editor severity markers (Milestone 8, Task 3). Added directly to a
   Kaggle .cm-line element (a page element, not part of the overlay's own
   subtree) for as long as that line holds an active lint error. A
   background tint, not a text-decoration underline: an empty or
   whitespace-only line has no text to draw an underline under, so a
   decoration-based marker would silently fail to render on exactly the
   lines a blank-line rule (e.g. flake8's W391) flags. Alpha-blended so it
   reads on both Kaggle's light and dark themes without a separate
   .kaggle-lint-theme-dark variant (same approach already used for
   .kaggle-lint-severity-* below). */
.cm-line.kaggle-lint-line-error {
  background-color: rgba(244, 71, 113, 0.18);
}

.cm-line.kaggle-lint-line-warning {
  background-color: rgba(222, 184, 135, 0.18);
}

.cm-line.kaggle-lint-line-info {
  background-color: rgba(106, 159, 181, 0.18);
}
```

- [ ] **Step 3: Create `lineMarkers.ts`**

Create `packages/extension/src/content/lineMarkers.ts`:

```ts
/**
 * In-editor severity markers (Milestone 8, Task 3 — the "flagship"
 * feature): tags the rendered `.cm-line` DOM elements directly from the
 * content script. Never touches CodeMirror state/effects — injecting
 * StateEffects from our bundle into the page's own CM6 instances is a
 * cross-instance trap, and the `cmView` expando that would be needed to
 * reach them doesn't exist on Kaggle's build anyway (see
 * page/pageExtractor.ts's doc comment on extractViaJupyterModel).
 *
 * The hard part is mapping a lint error's line number to the right
 * `.cm-line` element when a cell is virtualized: CodeMirror only mounts
 * `.cm-line` nodes for the visible viewport, and their position among
 * `.cm-content`'s children is relative to *that viewport*, not the
 * document — `children[line - 1]` is correct at the top of a short,
 * fully-rendered cell and wrong everywhere a marker actually matters.
 *
 * Fix: CM6's line-number gutter renders one `.cm-gutterElement` per
 * visible line, in the same order as `.cm-content`'s `.cm-line` children,
 * and a gutter element's *text* is always the real document line number —
 * that's the entire purpose of a line-number gutter, it has to stay
 * correct as you scroll. So this reads the gutter's line numbers, pairs
 * each one with the `.cm-line` at the same position, and looks the target
 * line up directly in that map — no reliance on "the Nth mounted line"
 * ever meaning "document line N." Live-probed per this milestone's
 * notes.md before trusting this in production.
 */

import type { Severity } from '@kaggle-lint/core';

export interface MarkerTarget {
  cellElement: Element;
  cellLine: number;
  severity: Severity;
  code?: string;
  msg: string;
}

const MARKER_CLASSES = [
  'kaggle-lint-line-error',
  'kaggle-lint-line-warning',
  'kaggle-lint-line-info',
] as const;

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function severityClass(severity: Severity): string {
  return `kaggle-lint-line-${severity}`;
}

/**
 * Maps document line number -> rendered `.cm-line` element for one cell,
 * using the line-number gutter as the source of truth for "which document
 * line is this DOM node." Returns an empty map if the cell has no gutter
 * or the gutter/content line counts don't match (not a code cell, gutter
 * disabled, or a live DOM shape this hasn't been probed against) — callers
 * must treat that as "can't mark this cell right now," not an error.
 */
function buildLineElementMap(cellElement: Element): Map<number, HTMLElement> {
  const map = new Map<number, HTMLElement>();
  const gutterElements = Array.from(
    cellElement.querySelectorAll(
      '.cm-gutters .cm-lineNumbers .cm-gutterElement'
    )
  );
  const lineElements = Array.from(
    cellElement.querySelectorAll('.cm-content > .cm-line')
  );

  if (
    gutterElements.length === 0 ||
    gutterElements.length !== lineElements.length
  ) {
    return map;
  }

  gutterElements.forEach((gutterEl, i) => {
    const text = gutterEl.textContent?.trim() ?? '';
    const lineNumber = Number.parseInt(text, 10);
    if (Number.isInteger(lineNumber) && lineNumber > 0) {
      map.set(lineNumber, lineElements[i] as HTMLElement);
    }
  });

  return map;
}

/**
 * Applies severity markers for every target whose cell is currently
 * rendered and whose line is currently mounted; clears every marker this
 * module has ever added first, notebook-wide (or scoped to `root`), so a
 * line whose error disappeared on the next lint doesn't keep a stale
 * marker — a per-cell "only clear cells present in the new targets"
 * optimization would miss exactly that case (a cell that HAD an error and
 * now has none isn't in `targets` at all). Errors for virtualized-out
 * cells/lines are silently skipped; they'll get marked once the user
 * scrolls them into view and a refresh pass re-runs this function.
 */
export function applyLineMarkers(
  targets: MarkerTarget[],
  root: ParentNode = document
): void {
  clearAllLineMarkers(root);

  const mapByCell = new Map<Element, Map<number, HTMLElement>>();
  const bestSeverityByLine = new Map<HTMLElement, Severity>();
  const titlesByLine = new Map<HTMLElement, string[]>();

  for (const target of targets) {
    let lineMap = mapByCell.get(target.cellElement);
    if (!lineMap) {
      lineMap = buildLineElementMap(target.cellElement);
      mapByCell.set(target.cellElement, lineMap);
    }
    const lineEl = lineMap.get(target.cellLine);
    if (!lineEl) continue;

    const current = bestSeverityByLine.get(lineEl);
    if (!current || SEVERITY_RANK[target.severity] < SEVERITY_RANK[current]) {
      bestSeverityByLine.set(lineEl, target.severity);
    }
    const codePart = target.code ? `${target.code}: ` : '';
    const titles = titlesByLine.get(lineEl) ?? [];
    titles.push(`${codePart}${target.msg}`);
    titlesByLine.set(lineEl, titles);
  }

  bestSeverityByLine.forEach((severity, lineEl) => {
    lineEl.classList.add(severityClass(severity));
  });
  titlesByLine.forEach((titles, lineEl) => {
    lineEl.setAttribute('title', titles.join('\n'));
  });
}

/** Clears every marker this module has ever added, scoped to `root` (the whole document by default). Used on overlay hide/disable and at the start of every applyLineMarkers call. */
export function clearAllLineMarkers(root: ParentNode = document): void {
  const marked = root.querySelectorAll(
    '.cm-line.kaggle-lint-line-error, .cm-line.kaggle-lint-line-warning, .cm-line.kaggle-lint-line-info'
  );
  marked.forEach((el) => {
    el.classList.remove(...MARKER_CLASSES);
    el.removeAttribute('title');
  });
}
```

- [ ] **Step 4: Wire markers into `ContentApp`**

In `packages/extension/src/content/ContentApp.tsx`, add the import (alongside the other local imports, currently around line 12):

```tsx
import { createLogger } from '../utils/logger';
```

Replace with:

```tsx
import { createLogger } from '../utils/logger';
import { applyLineMarkers, clearAllLineMarkers } from './lineMarkers';
```

After the `errors`/`visible` state declarations (currently lines 30-31), add a ref that mirrors the latest `errors` for the mutation-driven refresh effect below (same "read the latest value inside a long-lived listener without adding it to deps" pattern this file already uses for `runLinterRef`/`isLintingRef`):

```tsx
const [errors, setErrors] = useState<LintUIError[]>([]);
const [visible, setVisible] = useState(true);
```

Replace with:

```tsx
const [errors, setErrors] = useState<LintUIError[]>([]);
const errorsRef = React.useRef<LintUIError[]>([]);
const [visible, setVisible] = useState(true);
```

Add a small local helper plus two new effects right after the keyboard-shortcut effect (currently ending at line 271, just before the "Setup message listener" comment):

```tsx
/**
 * In-editor line markers (Task 3). Converts the current error list into
 * lineMarkers.ts's MarkerTarget shape — only errors whose cell element
 * is still live get a target; a virtualized-out cell simply gets no
 * marker until it's scrolled back into view and this reruns.
 */
const buildMarkerTargets = (list: LintUIError[]) =>
  list
    .filter((error): error is LintUIError & { element: Element } =>
      Boolean(error.element)
    )
    .map((error) => ({
      cellElement: error.element,
      cellLine: error.cellLine ?? error.line,
      severity: error.severity,
      code: error.code,
      msg: error.msg,
    }));

/** Refresh markers whenever the error list itself changes (a completed lint). */
useEffect(() => {
  errorsRef.current = errors;
  applyLineMarkers(buildMarkerTargets(errors));
}, [errors]);

/**
 * Refresh markers on notebook DOM mutations too: Kaggle's virtualization
 * mounts/unmounts `.cm-line` nodes on scroll independently of any lint
 * running, so a cell whose errors are already known can still need its
 * markers reapplied without a new lint. This observer only ever calls
 * classList.add/removeAttribute('title') (attribute mutations), which the
 * separate auto-relint observer above does NOT watch (its config is
 * childList/characterData/subtree only, no `attributes: true`) — so
 * marker writes never trigger a relint loop. `.jp-Notebook` is guaranteed
 * present here: content/index.tsx only mounts ContentApp once it exists.
 */
useEffect(() => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleMarkerRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applyLineMarkers(buildMarkerTargets(errorsRef.current));
    }, 300);
  };

  const notebook = document.querySelector('.jp-Notebook');
  if (!notebook) return undefined;

  const observer = new MutationObserver(scheduleMarkerRefresh);
  observer.observe(notebook, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}, []);

/** Full clear when the overlay is hidden (F-free feature, but same discipline as the rest of this file: no stale markers left behind). */
useEffect(() => {
  if (!visible) {
    clearAllLineMarkers();
  }
}, [visible]);
```

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build && npm test`
Expected: all exit 0.

```bash
grep -n "applyLineMarkers\|clearAllLineMarkers" packages/extension/src/content/ContentApp.tsx
```

Expected: at least 4 matches (import, the two effect bodies, the visibility-clear effect).

```bash
grep -n "kaggle-lint-line-error\|kaggle-lint-line-warning\|kaggle-lint-line-info" packages/ui-components/src/Overlay/Overlay.css packages/extension/src/content/lineMarkers.ts
```

Expected: matches in both files.

Manual (defer to Task 7 if no browser handy right now): open a 200+ line cell with a flagged line near the bottom, scroll it out of view and back — the marker survives and stays on the correct line at multiple scroll positions; editing the cell clears/re-adds markers within about a second (bounded by the 800 ms auto-relint debounce plus this task's 300 ms refresh debounce); toggling the overlay off clears every marker.

- [ ] **Step 6: Record the probe result**

Create `docs/next_plans/milestone-8-user-experience/notes.md`:

```markdown
# Notes — Milestone 8 (User-Experience Features)

## Task 3: line-marker mapping — live-probe result

<Record here, after running Step 1's DevTools probe on a real Kaggle notebook: did `.cm-gutters .cm-lineNumbers .cm-gutterElement` exist and line up 1:1 with `.cm-content > .cm-line` at multiple scroll positions in a 200+ line cell? If yes, `lineMarkers.ts` as written needs no change — note that. If the selectors differed, record the actual structure found and what was changed in `buildLineElementMap`. If no reliable isolated-world signal existed at all, record that a `LINE_GEOMETRY`-style bridge request was added instead, following `SCROLL_TO_CELL_LINE_REQUEST`'s pattern, and link the commit.>
```

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/content/lineMarkers.ts packages/extension/src/content/ContentApp.tsx packages/ui-components/src/Overlay/Overlay.css docs/next_plans/milestone-8-user-experience/notes.md
git commit -m "feat(extension): in-editor severity markers on error lines"
```

---

### Task 4: One-click ignore from an error item

**Files:**

- Modify: `packages/ui-components/src/types/index.ts` (add `onIgnoreCode` to three interfaces)
- Modify: `packages/ui-components/src/ErrorItem/ErrorItem.tsx`
- Modify: `packages/ui-components/src/ErrorList/ErrorList.tsx`
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (thread the prop through)
- Modify: `packages/ui-components/src/Overlay/Overlay.css` (mute-button hover reveal)
- Modify: `packages/extension/src/content/ContentApp.tsx` (handler)

**Interfaces:**

- Consumes: `LintUIError.code` (Task 1); the `Settings` interface/`DEFAULT_SETTINGS` already in `ContentApp.tsx`.
- Produces: `OverlayProps.onIgnoreCode?: (code: string) => void` — Task 6 does not depend on this, but both features live on the same `<Overlay>` call site in `ContentApp.tsx`, so this task's edit and Task 6's edit to that same JSX block must both be applied (order doesn't matter between them).

- [ ] **Step 1: Add `onIgnoreCode` to the three prop interfaces**

In `packages/ui-components/src/types/index.ts`, find:

```ts
export interface OverlayProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
}
```

Replace with:

```ts
export interface OverlayProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onIgnoreCode?: (code: string) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
}
```

Find:

```ts
export interface ErrorListProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
}
```

Replace with:

```ts
export interface ErrorListProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onIgnoreCode?: (code: string) => void;
}
```

Find:

```ts
export interface ErrorItemProps {
  error: LintUIError;
  index: number;
  onClick?: () => void;
}
```

Replace with:

```ts
export interface ErrorItemProps {
  error: LintUIError;
  index: number;
  onClick?: () => void;
  onIgnoreCode?: (code: string) => void;
}
```

- [ ] **Step 2: Add the mute button to `ErrorItem`**

In `packages/ui-components/src/ErrorItem/ErrorItem.tsx`, find:

```tsx
export const ErrorItem: React.FC<ErrorItemProps> = ({
  error,
  index,
  onClick,
}) => {
  const severityClass = `kaggle-lint-severity-${error.severity}`;

  return (
    <li
      className={`kaggle-lint-error-item ${severityClass}`}
      data-error-index={index}
      onClick={onClick}
    >
      <span className={`kaggle-lint-icon kaggle-lint-${error.severity}`}>
        {SEVERITY_ICONS[error.severity]}
      </span>
      <span className="kaggle-lint-location">
        Cell {(error.cellIndex ?? 0) + 1}:{error.cellLine ?? error.line}
      </span>
      <span
        className="kaggle-lint-message"
        dangerouslySetInnerHTML={{ __html: escapeHtml(error.msg) }}
      />
      <span className="kaggle-lint-rule">
        [{error.rule}
        {error.code ? ` ${error.code}` : ''}]
      </span>
    </li>
  );
};
```

Replace with:

```tsx
export const ErrorItem: React.FC<ErrorItemProps> = ({
  error,
  index,
  onClick,
  onIgnoreCode,
}) => {
  const severityClass = `kaggle-lint-severity-${error.severity}`;

  const handleIgnoreClick = (e: React.MouseEvent) => {
    // Don't trigger the row's own click (scroll-to-error) — muting a code
    // is a separate action from navigating to it.
    e.stopPropagation();
    if (error.code) {
      onIgnoreCode?.(error.code);
    }
  };

  return (
    <li
      className={`kaggle-lint-error-item ${severityClass}`}
      data-error-index={index}
      onClick={onClick}
    >
      <span className={`kaggle-lint-icon kaggle-lint-${error.severity}`}>
        {SEVERITY_ICONS[error.severity]}
      </span>
      <span className="kaggle-lint-location">
        Cell {(error.cellIndex ?? 0) + 1}:{error.cellLine ?? error.line}
      </span>
      <span
        className="kaggle-lint-message"
        dangerouslySetInnerHTML={{ __html: escapeHtml(error.msg) }}
      />
      <span className="kaggle-lint-rule">
        [{error.rule}
        {error.code ? ` ${error.code}` : ''}]
      </span>
      {error.code && (
        <button
          type="button"
          className="kaggle-lint-btn-ignore"
          title={`Ignore ${error.code} everywhere`}
          onClick={handleIgnoreClick}
        >
          🔇
        </button>
      )}
    </li>
  );
};
```

- [ ] **Step 3: Thread `onIgnoreCode` through `ErrorList`**

In `packages/ui-components/src/ErrorList/ErrorList.tsx`, find:

```tsx
export const ErrorList: React.FC<ErrorListProps> = ({
  errors,
  onErrorClick,
}) => {
  // EXACT LOGIC from displayErrors function in old-linter/src/ui/overlay.js
  if (errors.length === 0) {
    return <div className="kaggle-lint-success">✅ No issues found!</div>;
  }

  const sortedErrors = [...errors].sort(bySeverityThenPosition);

  return (
    <ul className="kaggle-lint-errors">
      {sortedErrors.map((error, idx) => (
        <ErrorItem
          key={idx}
          error={error}
          index={idx}
          onClick={() => onErrorClick?.(error)}
        />
      ))}
    </ul>
  );
};
```

Replace with:

```tsx
export const ErrorList: React.FC<ErrorListProps> = ({
  errors,
  onErrorClick,
  onIgnoreCode,
}) => {
  // EXACT LOGIC from displayErrors function in old-linter/src/ui/overlay.js
  if (errors.length === 0) {
    return <div className="kaggle-lint-success">✅ No issues found!</div>;
  }

  const sortedErrors = [...errors].sort(bySeverityThenPosition);

  return (
    <ul className="kaggle-lint-errors">
      {sortedErrors.map((error, idx) => (
        <ErrorItem
          key={idx}
          error={error}
          index={idx}
          onClick={() => onErrorClick?.(error)}
          onIgnoreCode={onIgnoreCode}
        />
      ))}
    </ul>
  );
};
```

- [ ] **Step 4: Thread `onIgnoreCode` through `Overlay`**

In `packages/ui-components/src/Overlay/Overlay.tsx`, find the destructured props (as left by Task 1):

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
  engineStatus,
}) => {
```

Replace with:

```tsx
export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onIgnoreCode,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
  engineStatus,
}) => {
```

Find the `<ErrorList>` call:

```tsx
<ErrorList errors={errors} onErrorClick={handleErrorClick} />
```

Replace with:

```tsx
<ErrorList
  errors={errors}
  onErrorClick={handleErrorClick}
  onIgnoreCode={onIgnoreCode}
/>
```

- [ ] **Step 5: Style the mute button (hover-revealed, doesn't shift layout)**

In `packages/ui-components/src/Overlay/Overlay.css`, append (before the line-marker block Task 3 added, or after — order doesn't matter within the file):

```css
/* One-click ignore (Milestone 8, Task 4): hidden until the row is
   hovered, so it doesn't compete visually with the message/rule text at
   rest. */
.kaggle-lint-btn-ignore {
  flex-shrink: 0;
  margin-left: 6px;
  padding: 2px 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}

.kaggle-lint-error-item:hover .kaggle-lint-btn-ignore {
  opacity: 0.7;
}

.kaggle-lint-btn-ignore:hover {
  opacity: 1 !important;
  background: rgba(0, 0, 0, 0.08);
}

.kaggle-lint-theme-dark .kaggle-lint-btn-ignore:hover {
  background: rgba(255, 255, 255, 0.12);
}
```

- [ ] **Step 6: Wire the ContentApp handler**

In `packages/extension/src/content/ContentApp.tsx`, add a handler right after `handleErrorClick` (the one Task 1 retyped):

```tsx
/**
 * One-click ignore (Task 4): appends the code to whichever engine is
 * active, deduped, reusing the exact same chrome.storage.sync write and
 * `linterSettings` key the popup uses — so the popup's own ignore-codes
 * input reflects this immediately next time it's opened (it already
 * reads storage on mount). Writing to `settings` state also re-triggers
 * the existing settings-changed effect, which debounces and re-lints —
 * no separate re-lint call needed here.
 */
const handleIgnoreCode = (code: string) => {
  setSettings((prev) => {
    const key =
      prev.linterEngine === 'flake8' ? 'flake8IgnoreCodes' : 'ruffIgnoreCodes';
    const existing = prev[key]
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (existing.includes(code)) {
      return prev;
    }
    const updated: Settings = {
      ...prev,
      [key]: [...existing, code].join(', '),
    };
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ linterSettings: updated });
    }
    return updated;
  });
};
```

Find the render's `<Overlay>` call:

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
    engineStatus={engineStatus}
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
    onIgnoreCode={handleIgnoreCode}
    onRefresh={runLinter}
    onClose={() => setVisible(false)}
    isLoading={isLinting}
    engineStatus={engineStatus}
  />
);
```

- [ ] **Step 7: Verify**

Run: `npm run type-check && npm run build && npm test`
Expected: all exit 0.

```bash
grep -n "onIgnoreCode" packages/ui-components/src/types/index.ts packages/ui-components/src/ErrorItem/ErrorItem.tsx packages/ui-components/src/ErrorList/ErrorList.tsx packages/ui-components/src/Overlay/Overlay.tsx packages/extension/src/content/ContentApp.tsx
```

Expected: at least one match in every listed file.

Manual (or defer to Task 7): mute an `E501`-class code from the list → matching errors vanish and stay gone after a page reload; the popup's ignore-codes input shows the code next time it's opened; deleting it there brings the errors back.

- [ ] **Step 8: Commit**

```bash
git add packages/ui-components/src/types/index.ts packages/ui-components/src/ErrorItem/ErrorItem.tsx packages/ui-components/src/ErrorList/ErrorList.tsx packages/ui-components/src/Overlay/Overlay.tsx packages/ui-components/src/Overlay/Overlay.css packages/extension/src/content/ContentApp.tsx
git commit -m "feat: one-click ignore of a violation code from the error list"
```

---

### Task 5: Glanceable status (minimized pill accent + toolbar badge)

**Files:**

- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (worst-severity class on the root)
- Modify: `packages/ui-components/src/Overlay/Overlay.css` (accent color rules)
- Create: `packages/extension/src/background/statsProtocol.ts`
- Modify: `packages/extension/src/content/ContentApp.tsx` (send stats after each lint)
- Modify: `packages/extension/src/background/index.ts` (set the badge)

**Interfaces:**

- Consumes: `stats` (already computed inside `Overlay` via `calculateStats`, from Task 1); `errors` state in `ContentApp.tsx`.
- Produces: `LINT_STATS` message type + `LintStatsMessage` interface (`statsProtocol.ts`) — self-contained to this task, not consumed elsewhere in this plan.

**Scope correction (per the source-of-truth check above):** the milestone plan's Step 1 says "Minimized state currently shows only the title — render the error/warning counts in the pill." Reading `Overlay.css` shows the counts (`.kaggle-lint-summary`) already stay visible when minimized — only `.kaggle-lint-errors`/`.kaggle-lint-success` collapse. So Step 1 below adds the "colored by worst severity present" part only; it does not re-add counts that already render. Confirm this is still true after Task 1's rewrite (it doesn't touch `.kaggle-lint-summary`'s CSS) before assuming this step is unnecessary.

- [ ] **Step 1: Accent the minimized pill by worst severity**

In `packages/ui-components/src/Overlay/Overlay.tsx`, find the root `<div>`'s `className` (as left by Task 1):

```tsx
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme} ${
        isMinimized ? 'kaggle-lint-minimized' : ''
      }`}
    >
```

Replace with:

```tsx
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme} ${
        isMinimized ? 'kaggle-lint-minimized' : ''
      } ${
        stats.bySeverity.error > 0
          ? 'kaggle-lint-worst-error'
          : stats.bySeverity.warning > 0
            ? 'kaggle-lint-worst-warning'
            : ''
      }`}
    >
```

In `packages/ui-components/src/Overlay/Overlay.css`, append:

```css
/* Glanceable status (Milestone 8, Task 5): only visually distinct while
   minimized — the expanded panel already shows per-severity counts and
   colors in .kaggle-lint-summary, so an accent border there would be
   redundant. */
.kaggle-lint-overlay.kaggle-lint-minimized.kaggle-lint-worst-error {
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 2px #f48771;
}

.kaggle-lint-overlay.kaggle-lint-minimized.kaggle-lint-worst-warning {
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 2px #deb887;
}
```

- [ ] **Step 2: Add the stats message protocol**

Create `packages/extension/src/background/statsProtocol.ts`:

```ts
/**
 * Message the content script sends after every lint so the background
 * worker can reflect totals on the toolbar badge. Kept separate from
 * engine/protocol.ts: this is engine-agnostic (a total is a total
 * regardless of which engine produced it), and chrome.action (the badge
 * API) is only reachable from a background/extension-page context, never
 * a content script — hence routing through here at all.
 */

export const LINT_STATS = 'LINT_STATS' as const;

export interface LintStatsMessage {
  type: typeof LINT_STATS;
  errors: number;
  warnings: number;
}
```

- [ ] **Step 3: Send stats after every lint**

In `packages/extension/src/content/ContentApp.tsx`, add the import:

```tsx
import { applyLineMarkers, clearAllLineMarkers } from './lineMarkers';
```

Replace with:

```tsx
import { applyLineMarkers, clearAllLineMarkers } from './lineMarkers';
import { LINT_STATS, type LintStatsMessage } from '../background/statsProtocol';
```

Find, inside `runLinter`, the line right after `setErrors(lintErrors);` (currently followed by a `logger.log` call):

```tsx
// Update errors state
setErrors(lintErrors);
logger.log('Updated errors state with', lintErrors.length, 'errors');
```

Replace with:

```tsx
// Update errors state
setErrors(lintErrors);
logger.log('Updated errors state with', lintErrors.length, 'errors');

if (typeof chrome !== 'undefined' && chrome.runtime) {
  const statsMessage: LintStatsMessage = {
    type: LINT_STATS,
    errors: lintErrors.filter((e) => e.severity === 'error').length,
    warnings: lintErrors.filter((e) => e.severity === 'warning').length,
  };
  chrome.runtime.sendMessage(statsMessage);
}
```

- [ ] **Step 4: Set the badge in the background worker**

In `packages/extension/src/background/index.ts`, add the import:

```ts
import {
  ENGINE_LINT_NOTEBOOK,
  ENGINE_OFFSCREEN_REQUEST,
  ENGINE_STATUS,
} from '../engine/protocol';
```

Replace with:

```ts
import {
  ENGINE_LINT_NOTEBOOK,
  ENGINE_OFFSCREEN_REQUEST,
  ENGINE_STATUS,
} from '../engine/protocol';
import { LINT_STATS, type LintStatsMessage } from './statsProtocol';
```

Find the top of the `onMessage` listener:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type !== 'string' || !ENGINE_MESSAGE_TYPES.has(message.type)) {
    return false;
  }
```

Replace with:

```ts
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
```

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build && npm test`
Expected: all exit 0.

```bash
grep -n "LINT_STATS" packages/extension/src/background/statsProtocol.ts packages/extension/src/content/ContentApp.tsx packages/extension/src/background/index.ts
```

Expected: matches in all three files.

```bash
grep -n "setBadgeText\|setBadgeBackgroundColor" packages/extension/src/background/index.ts
```

Expected: one match each.

Manual (or defer to Task 7): badge total matches the panel's error+warning count; badge clears (empty text) on a clean notebook; switching tabs shows each tab's own badge, not a bled-over value from another tab; badge state after navigating to a different notebook in the same tab is worth double-checking explicitly rather than assumed (`chrome.action`'s per-tab badge text is documented to persist across navigation within the same tab unless explicitly cleared — if that's not the desired behavior, note it, but doing nothing here matches the milestone plan's own "verify, don't assume" instruction rather than pre-guessing a fix).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-components/src/Overlay/Overlay.tsx packages/ui-components/src/Overlay/Overlay.css packages/extension/src/background/statsProtocol.ts packages/extension/src/content/ContentApp.tsx packages/extension/src/background/index.ts
git commit -m "feat: error counts on minimized pill accent and toolbar badge"
```

---

### Task 6: Overlay state persistence

**Files:**

- Modify: `packages/ui-components/src/types/index.ts` (add 3 props to `OverlayProps`)
- Modify: `packages/ui-components/src/Overlay/Overlay.tsx` (accept initial state, report changes)
- Modify: `packages/extension/src/content/ContentApp.tsx` (load/save/clamp)

**Interfaces:**

- Consumes: `dragOffsetRef`, `isMinimized` state, `handleToggleMinimize` (all from Task 1); this task extends each rather than introducing new state.
- Produces: nothing consumed by a later task — this is the milestone's last feature task before the gate.

- [ ] **Step 1: Add persistence props to `OverlayProps`**

In `packages/ui-components/src/types/index.ts`, find (as left by Task 4):

```ts
export interface OverlayProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onIgnoreCode?: (code: string) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
}
```

Replace with:

```ts
export interface OverlayUiState {
  position: { x: number; y: number };
  isMinimized: boolean;
}

export interface OverlayProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onIgnoreCode?: (code: string) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
  initialPosition?: { x: number; y: number };
  initialMinimized?: boolean;
  onStateChange?: (state: OverlayUiState) => void;
}
```

- [ ] **Step 2: Read the initial state and report changes from `Overlay`**

In `packages/ui-components/src/Overlay/Overlay.tsx`, find the destructured props (as left by Task 4):

```tsx
export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onIgnoreCode,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
  engineStatus,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
```

Replace with:

```tsx
export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onIgnoreCode,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
  engineStatus,
  initialPosition,
  initialMinimized = false,
  onStateChange,
}) => {
  const [isMinimized, setIsMinimized] = useState(initialMinimized);
  const isMinimizedRef = useRef(initialMinimized);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: initialPosition?.x ?? 0, y: initialPosition?.y ?? 0 });

  // Read the latest isMinimized inside the long-lived drag listeners below
  // without adding it to their effect's deps (same pattern this repo
  // already uses for runLinterRef/isLintingRef in ContentApp.tsx).
  useEffect(() => {
    isMinimizedRef.current = isMinimized;
  }, [isMinimized]);

  // Apply the restored drag offset once, on mount only — a later prop
  // change must not fight the user's live drag position.
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.style.setProperty('--kaggle-lint-drag-x', `${dragOffsetRef.current.x}px`);
    overlayRef.current.style.setProperty('--kaggle-lint-drag-y', `${dragOffsetRef.current.y}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Find the drag effect's `handleMouseUp` (as left by Task 1):

```tsx
const handleMouseUp = () => {
  isDragging = false;
};
```

Replace with:

```tsx
const handleMouseUp = () => {
  if (!isDragging) return;
  isDragging = false;
  onStateChange?.({
    position: dragOffsetRef.current,
    isMinimized: isMinimizedRef.current,
  });
};
```

Find `handleToggleMinimize` (as left by Task 1):

```tsx
const handleToggleMinimize = () => {
  setIsMinimized((prev) => {
    const next = !prev;
    if (next && overlayRef.current) {
      dragOffsetRef.current = { x: 0, y: 0 };
      overlayRef.current.style.setProperty('--kaggle-lint-drag-x', '0px');
      overlayRef.current.style.setProperty('--kaggle-lint-drag-y', '0px');
    }
    return next;
  });
};
```

Replace with:

```tsx
const handleToggleMinimize = () => {
  setIsMinimized((prev) => {
    const next = !prev;
    if (next && overlayRef.current) {
      dragOffsetRef.current = { x: 0, y: 0 };
      overlayRef.current.style.setProperty('--kaggle-lint-drag-x', '0px');
      overlayRef.current.style.setProperty('--kaggle-lint-drag-y', '0px');
    }
    onStateChange?.({ position: dragOffsetRef.current, isMinimized: next });
    return next;
  });
};
```

Note: `handleMouseDown`'s existing `isDragging = true;` line needs no change — the `if (!isDragging) return;` guard added to `handleMouseUp` above only affects the case where mouseup fires without a preceding drag (e.g. a stray click), which now correctly skips calling `onStateChange` for a no-op "drag."

- [ ] **Step 3: Load, save, and clamp overlay UI state in `ContentApp`**

In `packages/extension/src/content/ContentApp.tsx`, add the import:

```tsx
import { LINT_STATS, type LintStatsMessage } from '../background/statsProtocol';
```

Replace with:

```tsx
import { LINT_STATS, type LintStatsMessage } from '../background/statsProtocol';
import type { OverlayUiState } from '@kaggle-lint/ui-components';
```

Add a module-level constant and default near `DEFAULT_SETTINGS`:

```tsx
const OVERLAY_UI_STATE_KEY = 'overlayUiState';
const DEFAULT_OVERLAY_UI_STATE: OverlayUiState = {
  position: { x: 0, y: 0 },
  isMinimized: false,
};
```

Add state and a load effect near the other settings-loading state (after `const [settingsLoaded, setSettingsLoaded] = useState(false);`):

```tsx
const [overlayUiState, setOverlayUiState] = useState<OverlayUiState>(
  DEFAULT_OVERLAY_UI_STATE
);
const [overlayUiStateLoaded, setOverlayUiStateLoaded] = useState(false);
const overlayStateSaveTimerRef = React.useRef<ReturnType<
  typeof setTimeout
> | null>(null);

/**
 * Overlay position/minimize state is deliberately chrome.storage.local
 * (per-machine UI state), not .sync, and deliberately a separate key
 * from `linterSettings` — it's not a linter setting, and mixing it in
 * would violate this milestone's frozen-settings-shape constraint.
 * `visible` is intentionally NOT persisted here: a user who closed the
 * panel should get it back on the next notebook, since a
 * persisted-closed overlay looks like a broken extension, not a
 * deliberate choice.
 */
useEffect(() => {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    setOverlayUiStateLoaded(true);
    return;
  }
  chrome.storage.local.get([OVERLAY_UI_STATE_KEY], (result: any) => {
    const stored = result[OVERLAY_UI_STATE_KEY] as OverlayUiState | undefined;
    if (stored) {
      // Window size can differ between sessions; clamp so a
      // previously-dragged-far position can't land off-screen.
      const maxX = Math.max(0, window.innerWidth - 100);
      const maxY = Math.max(0, window.innerHeight - 60);
      setOverlayUiState({
        position: {
          x: Math.min(Math.max(stored.position.x, -maxX), maxX),
          y: Math.min(Math.max(stored.position.y, -maxY), maxY),
        },
        isMinimized: Boolean(stored.isMinimized),
      });
    }
    setOverlayUiStateLoaded(true);
  });
}, []);

const handleOverlayStateChange = (state: OverlayUiState) => {
  setOverlayUiState(state);
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  if (overlayStateSaveTimerRef.current)
    clearTimeout(overlayStateSaveTimerRef.current);
  overlayStateSaveTimerRef.current = setTimeout(() => {
    chrome.storage.local.set({ [OVERLAY_UI_STATE_KEY]: state });
  }, 300);
};
```

Find the render (as left by Task 4):

```tsx
return (
  <Overlay
    errors={errors}
    visible={visible}
    theme={theme}
    onErrorClick={handleErrorClick}
    onIgnoreCode={handleIgnoreCode}
    onRefresh={runLinter}
    onClose={() => setVisible(false)}
    isLoading={isLinting}
    engineStatus={engineStatus}
  />
);
```

Replace with:

```tsx
if (!overlayUiStateLoaded) {
  return null;
}

return (
  <Overlay
    errors={errors}
    visible={visible}
    theme={theme}
    onErrorClick={handleErrorClick}
    onIgnoreCode={handleIgnoreCode}
    onRefresh={runLinter}
    onClose={() => setVisible(false)}
    isLoading={isLinting}
    engineStatus={engineStatus}
    initialPosition={overlayUiState.position}
    initialMinimized={overlayUiState.isMinimized}
    onStateChange={handleOverlayStateChange}
  />
);
```

`chrome.storage.local.get` is typically near-instant, so gating the initial render on `overlayUiStateLoaded` costs an imperceptible delay in exchange for never flashing the overlay at its default position before snapping to the restored one.

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run build && npm test`
Expected: all exit 0.

```bash
grep -n "OverlayUiState\|overlayUiState\|OVERLAY_UI_STATE_KEY" packages/ui-components/src/types/index.ts packages/ui-components/src/Overlay/Overlay.tsx packages/extension/src/content/ContentApp.tsx
```

Expected: matches in all three files.

```bash
grep -n "chrome.storage.local" packages/extension/src/content/ContentApp.tsx
```

Expected: at least 2 matches (the `get` and the debounced `set`) — confirms this uses `local`, not `sync` (per the settings-shape-frozen constraint: `sync`'s `linterSettings` key is untouched by this task).

Manual (or defer to Task 7): drag the panel, minimize it, reload the page → same position, still minimized. Close it, reload → visible again (never persisted as closed).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-components/src/types/index.ts packages/ui-components/src/Overlay/Overlay.tsx packages/extension/src/content/ContentApp.tsx
git commit -m "feat(ui): remember overlay position and minimized state"
```

---

### Task 7: USER-GATE — manual verification

**This task is not delegable to an agentic worker without a real browser.** Requires real Chrome + a logged-in Kaggle session, a fresh (or storage-cleared) extension profile, and a notebook with 10+ cells including at least one 200+ line cell (reuse the fixture noted in Milestone 2/7's notes if one is on hand). Per `docs/next_plans/README.md` rule 4: if you cannot drive a browser, stop and hand the user this checklist — do not claim the milestone done.

- [ ] **Step 1:** From repo root, run `npm run build`. Confirm it exits 0 and `packages/extension/dist/` contains `content.js`, `popup.js`, `pageExtractor.js`, `background.js`, `offscreen.js`, `manifest.json`, `content.css`, `popup.css`, `icons/`, `pyodide/`, `ruff/`.
- [ ] **Step 2:** Clear extension storage (fresh profile, or `chrome.storage.sync.clear()` and `chrome.storage.local.clear()` from the popup's DevTools inspector). Load/reload the unpacked extension at `chrome://extensions`, then refresh the notebook tab.
- [ ] **Step 3 (Task 2):** Open the test notebook in edit mode with zero prior configuration. Confirm ruff results appear in well under 5 s with no popup interaction needed.
- [ ] **Step 4 (Task 1):** Drag the panel to a new position — confirm it moves smoothly with no layout jump. Click minimize — confirm it animates into the pill shape at bottom-right (not wherever it was dragged to) and the chevron rotates. Click expand — confirm it animates back to 450px wide. Click an error — confirm click-to-scroll still lands on the exact line (the M7 behavior; Task 1 must not have regressed it).
- [ ] **Step 5 (Task 3):** In the 200+ line cell, confirm flagged lines show a background-tinted marker. Scroll that cell out of view and back — confirm the marker is still on the correct line, not shifted. Fix the error and re-lint (edit + wait, or Ctrl+Shift+L) — confirm the marker disappears within about a second. Toggle the overlay closed — confirm all markers clear immediately.
- [ ] **Step 6 (Task 4):** Hover an error row with a `code` (e.g. an `E501`/`F401`-style violation) — confirm a mute button appears. Click it — confirm that code's errors vanish from the list and stay gone after a page reload; open the popup and confirm the code appears in the ignore-codes field for the active engine; delete it there and confirm the errors come back.
- [ ] **Step 7 (Task 5):** With at least one error and one warning present, confirm the minimized pill shows an accent color reflecting the worst severity, and the toolbar badge shows the total error+warning count in a matching color (red if any error, amber if only warnings). Fix everything — confirm both the pill accent and the badge clear. Switch to a second tab on a different (or the same) notebook — confirm badges don't bleed between tabs.
- [ ] **Step 8 (Task 6):** Drag the panel somewhere non-default, minimize it, reload the page — confirm it reappears in the same place, still minimized. Expand it, close it (X button), reload — confirm it's visible again (not stuck closed).
- [ ] **Step 9 (regression):** Switch to flake8 in the popup — confirm it still works (loading message during the first Pyodide load, results afterward). Confirm the M7 fixes still hold: exactly one overlay on the page, deleting a cell drops its errors on next lint.
- [ ] **Step 10:** If any check fails, debug with `superpowers:systematic-debugging`. If a failure traces to Task 3's gutter-mapping assumption being wrong on the live page, adapt `lineMarkers.ts`'s `buildLineElementMap` per the live DOM shape you find (keep `applyLineMarkers`/`clearAllLineMarkers`'s signatures unchanged so `ContentApp.tsx`'s wiring doesn't need to change) and update `docs/next_plans/milestone-8-user-experience/notes.md` with what was actually found, per `docs/next_plans/README.md` rule 5.
- [ ] **Step 11:** Commit any fixes/notes from Step 10. If Step 10 wasn't triggered, no further commit is needed — this closes out Milestone 8.

---

## Deviations from the milestone plan

Per `docs/next_plans/README.md` rule 5, documented here rather than reopening any decision in `docs/next_plans/milestone-8-user-experience/plan.md`. None of these reverse a milestone decision — they correct stale file-path assumptions or fill in implementation details the milestone plan left to this TDD expansion.

1. **Task 3's CSS lands in `packages/ui-components/src/Overlay/Overlay.css`, not `packages/extension/public/content.css`.** The latter file does not exist in the current tree; `webpack.config.js`'s `CopyPlugin` builds the bundle's `content.css` by copying `Overlay.css` directly (confirmed by reading the config, not guessed). The milestone plan's file list for Task 3 names a file that was never created — this is the same class of drift M7's plan corrected for `getLastExtractionSource()`'s pre-M2 signature, not a new kind of deviation.
2. **Task 1 does not fix F15 (core/ui-components type duplication).** `LintUIError` is added to `packages/ui-components/src/types/index.ts` extending that file's own local `LintError`, not core's — consistent with the file's existing (duplicated) convention. `docs/architecture.md` and the milestone's own "Fixes findings" line both confirm F15 is Milestone 4 Task 4's job, not this milestone's.
3. **Task 5's Step 1 is scoped down from "render the error/warning counts in the pill" to "accent the pill by worst severity."** Reading `Overlay.css` (both pre- and post-Task-1) shows `.kaggle-lint-summary` (the counts) has no minimized-state hiding rule — it already renders in the pill today. The milestone plan's premise ("Minimized state currently shows only the title") doesn't match the current file; the actually-missing piece (a severity accent) is what Step 1 implements.
4. **Line-marker mapping is implemented as a CM6 line-number-gutter lookup, not a bridge extension**, per the milestone plan's own explicit "probe-first, cheapest path that survives a 200+ line cell test" instruction — Task 3's Step 1 is a live-probe gate before the implementation is trusted, and Step 6 requires recording the actual probe result in `notes.md`. If the probe fails, Task 3's own text names the fallback (a `LINE_GEOMETRY`-style bridge request following `SCROLL_TO_CELL_LINE_REQUEST`'s established pattern) without prescribing it up front, per the constraint in the original request not to presuppose which mechanism wins.
5. **`onStateChange`'s `state` parameter type is named `OverlayUiState` and exported from `packages/ui-components/src/types/index.ts`**, rather than an inline object-literal type repeated at each of `Overlay.tsx`/`ContentApp.tsx`'s call sites — the milestone plan's Task 6 Step 1 says only "accept initial state + change callback" without naming a type; giving it one name used everywhere avoids a fourth inline repetition of `{ position: {x,y}; isMinimized }` across two files.

No other deviations were found: every other file path, signature, and interface named in `docs/next_plans/milestone-8-user-experience/plan.md` matched the current working tree (post-M7) as of 2026-07-10.
