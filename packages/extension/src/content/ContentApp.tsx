/**
 * ContentApp Component
 * Main React component for the content script
 * Integrates linting and UI overlay
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Overlay } from '@kaggle-lint/ui-components';
import type { LintUIError } from '@kaggle-lint/ui-components';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
import { EngineClient } from '../engine/EngineClient';
import { createLogger } from '../utils/logger';
import { applyLineMarkers, clearAllLineMarkers } from './lineMarkers';
import { LINT_STATS, type LintStatsMessage } from '../background/statsProtocol';
import type { OverlayUiState } from '@kaggle-lint/ui-components';

const logger = createLogger('ContentApp');

interface Settings {
  linterEngine: 'flake8' | 'ruff';
  flake8IgnoreCodes: string;
  ruffIgnoreCodes: string;
}

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

type ContentScriptMessage =
  | { type: 'runLinter' }
  | { type: 'toggleOverlay' }
  | { type: 'settingsChanged'; settings: Partial<Settings> }
  | { type: 'ping' };

const OVERLAY_UI_STATE_KEY = 'overlayUiState';
const DEFAULT_OVERLAY_UI_STATE: OverlayUiState = {
  position: { x: 0, y: 0 },
  isMinimized: false,
};

export const ContentApp: React.FC = () => {
  const [errors, setErrors] = useState<LintUIError[]>([]);
  const errorsRef = React.useRef<LintUIError[]>([]);
  const [visible, setVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLinting, setIsLinting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [engineStatus, setEngineStatus] = useState<
    'unloaded' | 'loading' | 'ready' | 'failed'
  >('unloaded');
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
    chrome.storage.local.get(
      [OVERLAY_UI_STATE_KEY],
      (result: Record<string, OverlayUiState | undefined>) => {
        const stored = result[OVERLAY_UI_STATE_KEY];
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
      }
    );
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

  const engineClientRef = React.useRef(new EngineClient()).current;
  const domParser = React.useRef(new KaggleDomParser()).current;
  const codeMirrorManager = React.useRef(new CodeMirrorManager()).current;

  const runLinterRef = React.useRef<() => Promise<void>>(async () => {});
  const isLintingRef = React.useRef(false);
  const visibleRef = React.useRef(visible);

  /**
   * Run the linter
   */
  const runLinter = useCallback(async () => {
    if (isLintingRef.current) {
      logger.log('Already linting, skipping...');
      return;
    }

    isLintingRef.current = true;
    setIsLinting(true);
    logger.log('Starting lint...');
    logger.log('Current settings:', settings);

    let lintStartTime = 0;

    try {
      lintStartTime = performance.now();
      // Extract cells from DOM (MAIN-world bridge, DOM-scrape fallback)
      const cells = await domParser.extractCells();
      logger.log(`Extracted ${cells.length} cells`);

      // The Jupyter-model path (pageExtractor.ts's extractViaJupyterModel)
      // is rendering-independent — it reads every cell's source straight
      // off the notebook model via sharedModel.getSource(), so it sees
      // cells Kaggle has virtualized out of the DOM just as reliably as
      // ones currently rendered. That result is a complete, authoritative
      // sweep, so the store can safely be replaced: a cell the user
      // deleted simply isn't in the new sweep and drops out (F34). Both
      // DOM-based paths — the bridge's own internal DOM fallback, and this
      // class's isolated-world DOM-scrape fallback used when the bridge
      // doesn't respond at all — only ever see cells/lines Kaggle
      // currently has mounted, so they stay merge-only; replacing on a
      // partial sweep would wipe exactly the virtualized-out coverage this
      // store exists to provide.
      if (domParser.getLastExtractionSource() === 'model') {
        codeMirrorManager.clear();
      }
      codeMirrorManager.syncCells(cells);

      // Lint from the store (survives cells Kaggle has unloaded from the
      // DOM), enriched with live element references from this extraction
      // pass so error-click-to-scroll keeps working.
      const elementByCellId = new Map(
        cells.map((cell) => [
          codeMirrorManager.getCellId(cell.cellIndex, cell.uuid ?? null),
          cell.element ?? null,
        ])
      );
      const cellsForLinting = codeMirrorManager.getAllCells().map((stored) => ({
        code: stored.code,
        cellIndex: stored.cellIndex,
        uuid: stored.uuid,
        element:
          elementByCellId.get(
            codeMirrorManager.getCellId(stored.cellIndex, stored.uuid)
          ) ?? null,
      }));

      // The protocol is JSON-only (no DOM elements cross chrome.runtime
      // messaging), so strip elements before sending and re-attach them
      // to the returned errors by cellIndex — error-click-to-scroll needs
      // them.
      const ignoreCodes = (
        settings.linterEngine === 'flake8'
          ? settings.flake8IgnoreCodes
          : settings.ruffIgnoreCodes
      )
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code.length > 0);

      logger.log(`Running ${settings.linterEngine} engine...`);
      setEngineStatus('loading');

      let lintErrors;
      try {
        const cellByCellIndex = new Map(
          cellsForLinting.map((cell) => [
            cell.cellIndex,
            { element: cell.element, uuid: cell.uuid },
          ])
        );
        const rawErrors = await engineClientRef.lintNotebook(
          settings.linterEngine,
          cellsForLinting.map(({ code, cellIndex }) => ({ code, cellIndex })),
          ignoreCodes
        );
        lintErrors = rawErrors.map((error) => {
          const cell = cellByCellIndex.get(error.cellIndex);
          return {
            ...error,
            element: cell?.element ?? null,
            uuid: cell?.uuid ?? null,
          };
        });
        setEngineStatus('ready');
        logger.log(
          `${settings.linterEngine} engine found ${lintErrors.length} errors`
        );
      } catch (error) {
        setEngineStatus('failed');
        throw error;
      }

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
    } catch (error) {
      logger.error('Error during linting:', error);
      logger.warn(
        `${settings.linterEngine} failed, you may need to reload the page`
      );
    } finally {
      isLintingRef.current = false;
      setIsLinting(false);
      logger.log(
        `Lint completed in ${(performance.now() - lintStartTime).toFixed(0)}ms`
      );
    }
  }, [domParser, codeMirrorManager, settings, engineClientRef]);

  useEffect(() => {
    runLinterRef.current = runLinter;
  }, [runLinter]);

  /**
   * Initialize linter on mount
   */
  useEffect(() => {
    logger.log('Initializing ContentApp...');

    // Detect theme
    const detectedTheme = domParser.detectTheme();
    setTheme(detectedTheme);
    logger.log('Detected theme:', detectedTheme);

    // Load settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(
        ['linterSettings'],
        (result: { linterSettings?: Partial<Settings> }) => {
          if (result.linterSettings) {
            logger.log('Loaded settings from storage:', result.linterSettings);
            setSettings({
              ...DEFAULT_SETTINGS,
              ...result.linterSettings,
            });
          } else {
            logger.log('No saved settings, using defaults');
          }
          setSettingsLoaded(true);
        }
      );
    } else {
      setSettingsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    logger.log('Running initial lint...');
    const timer = setTimeout(() => runLinterRef.current(), 1000);
    // Kaggle fetches notebook cell content asynchronously (a separate blob
    // download observed racing with page load) — the Jupyter cell widgets
    // can all be present, with some cells' sharedModel content not yet
    // loaded, so the very first lint can read those cells as empty and
    // undercount. A one-time catch-up lint a few seconds later covers
    // content that finished loading after the first pass; every trigger
    // after this one (keyboard shortcut, edits, settings changes) already
    // re-extracts fresh and is unaffected.
    const catchUpTimer = setTimeout(() => runLinterRef.current(), 4000);
    return () => {
      clearTimeout(timer);
      clearTimeout(catchUpTimer);
    };
  }, [settingsLoaded]);

  /**
   * Re-run linter when settings change (but not on initial mount).
   * Debounced: the popup's engine-switch radio buttons and ignore-codes
   * text field have no way to know a lint is already in flight, so
   * switching engines (or typing a code) several times in a row used to
   * queue up several full, back-to-back lint passes (each one skipped
   * only if it happened to land while the previous was still running).
   * flake8 in particular can take several seconds per pass on a large
   * notebook; enough of those stacking up in a row was long enough for
   * Chrome's own unresponsive-page detector to fire. Waiting for the
   * change to settle collapses N rapid changes into a single lint against
   * the final value. The ignore-codes field gets a longer delay (1s vs
   * 500ms for an engine switch) since typing produces far more rapid-fire
   * changes than clicking a radio button.
   */
  const prevSettingsRef = React.useRef<Settings | null>(null);
  useEffect(() => {
    logger.log('Settings changed:', settings);
    if (!settingsLoaded) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const prev = prevSettingsRef.current;
    if (prev !== null) {
      const engineChanged = prev.linterEngine !== settings.linterEngine;
      timer = setTimeout(
        () => {
          runLinterRef.current();
        },
        engineChanged ? 500 : 1000
      );
    }
    prevSettingsRef.current = settings;

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [settings, settingsLoaded]);

  /**
   * Setup keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+L: Run linter
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        logger.log('Keyboard shortcut: Re-lint');
        runLinterRef.current();
      }
      // Ctrl+Shift+H: Toggle overlay
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        logger.log('Keyboard shortcut: Toggle overlay');
        setVisible((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * In-editor line markers (Task 3). Converts the current error list into
   * lineMarkers.ts's MarkerTarget shape, keyed by uuid/cellIndex — the
   * MAIN-world bridge resolves the actual DOM node itself (via the real
   * CM6 view), so no local element reference is needed here. A cell whose
   * line isn't currently mounted simply gets no marker until it's scrolled
   * back into view and this reruns.
   */
  const buildMarkerTargets = (list: LintUIError[]) =>
    list.map((error) => ({
      uuid: error.uuid ?? null,
      cellIndex: error.cellIndex ?? 0,
      cellLine: error.cellLine ?? error.line,
      severity: error.severity,
      code: error.code,
      msg: error.msg,
    }));

  /**
   * Refresh markers whenever the error list itself changes (a completed
   * lint). errorsRef is updated unconditionally so the [visible] effect's
   * reapply-on-show always has fresh data; the repaint itself is skipped
   * while the overlay is hidden, otherwise linting while hidden (e.g.
   * Ctrl+Shift+L or auto-relint-on-edit) would repaint markers the user
   * explicitly hid, defeating the same visibility gate applied below to
   * the mutation-driven refresh.
   */
  useEffect(() => {
    errorsRef.current = errors;
    if (!visibleRef.current) return;
    void applyLineMarkers(buildMarkerTargets(errors));
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
   * Skips repainting while the overlay is hidden (`visibleRef`) — otherwise
   * an incidental mutation (e.g. scrolling) while toggled off would silently
   * repaint markers the user just hid.
   */
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMarkerRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!visibleRef.current) return;
        void applyLineMarkers(buildMarkerTargets(errorsRef.current));
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

  /**
   * Full clear when the overlay is hidden (F-free feature, but same
   * discipline as the rest of this file: no stale markers left behind).
   * Reapplies immediately when toggled back on, rather than waiting for
   * the next lint or an incidental mutation to bring markers back.
   */
  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      void applyLineMarkers(buildMarkerTargets(errorsRef.current));
    } else {
      void clearAllLineMarkers();
    }
  }, [visible]);

  /**
   * Setup message listener for chrome extension
   */
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
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

      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
    return undefined;
  }, []);

  /**
   * Auto re-lint on cell edits (F8)
   * Debounced MutationObserver watching for changes inside `.cm-content`
   * (CodeMirror's editable text), ignoring mutations inside the overlay's
   * own root (#kaggle-linter-root) so re-rendering lint results doesn't
   * trigger another lint. Also fires on whole-cell removal (deleting a
   * cell) regardless of focus — the deleted cell's own content is gone,
   * so "does its editor have focus" is meaningless, but its stale errors
   * still need clearing without the user having to press Ctrl+Shift+L
   * themselves (found during Task 7's manual gate).
   */
  useEffect(() => {
    if (!settingsLoaded) return undefined;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRelint = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        logger.log('Auto re-lint after edit');
        runLinterRef.current();
      }, 800);
    };

    const overlayRoot = document.getElementById('kaggle-linter-root');

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const removedCell = Array.from(mutation.removedNodes).some(
          (node) =>
            node instanceof Element &&
            (node.classList.contains('jp-Cell') ||
              node.querySelector('.jp-Cell'))
        );
        if (removedCell) {
          scheduleRelint();
          return;
        }
        const target = mutation.target;
        const el = target instanceof Element ? target : target.parentElement;
        if (!el) continue;
        if (overlayRoot && overlayRoot.contains(el)) continue;
        const mutatedContent = el.closest('.cm-content');
        if (mutatedContent) {
          // Kaggle's notebook is virtualized: scrolling mounts/unmounts
          // `.cm-line` nodes inside `.cm-content`, which is a childList
          // mutation indistinguishable from a real edit at this point.
          // Only schedule a re-lint if the user is actually editing THIS
          // cell — checking only "is focus in *some* .cm-content" isn't
          // enough: once you've clicked into any cell, focus stays there
          // through subsequent scrolling (scrolling doesn't blur an
          // editor), so a virtualization mutation in a totally different,
          // unfocused cell would still pass a same-any-cm-content check.
          const editorHasFocus =
            document.activeElement instanceof Element &&
            document.activeElement.closest('.cm-content') === mutatedContent;
          if (editorHasFocus) {
            scheduleRelint();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [settingsLoaded]);

  /**
   * Handle error click (F33): ask the MAIN-world bridge to scroll via
   * Jupyter's own virtualization-aware APIs and reveal the exact line.
   * Falls back to a plain DOM scrollIntoView only if the bridge can't
   * find the cell (pageExtractor not loaded in this frame, or the live
   * JupyterLab API shape doesn't match what pageExtractor.ts expects) —
   * 'auto' behavior, not 'smooth': an animated scroll can drift once
   * virtualization reflows mid-animation, which is the bug F33 reports.
   */
  const handleErrorClick = async (error: LintUIError) => {
    const ok = await domParser.scrollToCellLine(
      error.uuid ?? null,
      error.cellIndex ?? 0,
      error.cellLine ?? error.line ?? 1
    );
    if (!ok && error.element) {
      error.element.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    if (error.element) {
      const element = error.element;
      element.classList.add('kaggle-lint-highlight');
      setTimeout(() => {
        element.classList.remove('kaggle-lint-highlight');
      }, 2000);
    }
  };

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
        prev.linterEngine === 'flake8'
          ? 'flake8IgnoreCodes'
          : 'ruffIgnoreCodes';
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
};
