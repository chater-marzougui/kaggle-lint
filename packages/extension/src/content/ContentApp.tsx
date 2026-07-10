/**
 * ContentApp Component
 * Main React component for the content script
 * Integrates linting and UI overlay
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Overlay } from '@kaggle-lint/ui-components';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';
import { EngineClient } from '../engine/EngineClient';

interface Settings {
  linterEngine: 'flake8' | 'ruff';
  flake8IgnoreCodes: string;
  ruffIgnoreCodes: string;
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'flake8',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};

export const ContentApp: React.FC = () => {
  const [errors, setErrors] = useState<any[]>([]);
  const [visible, setVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLinting, setIsLinting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [engineStatus, setEngineStatus] = useState<'unloaded' | 'loading' | 'ready' | 'failed'>('unloaded');

  const engineClientRef = React.useRef(new EngineClient()).current;
  const domParser = React.useRef(new KaggleDomParser()).current;
  const codeMirrorManager = React.useRef(new CodeMirrorManager()).current;

  const runLinterRef = React.useRef<() => Promise<void>>(async () => {});
  const isLintingRef = React.useRef(false);

  /**
   * Run the linter
   */
  const runLinter = useCallback(async () => {
    if (isLintingRef.current) {
      console.log('[Linter] Already linting, skipping...');
      return;
    }

    isLintingRef.current = true;
    setIsLinting(true);
    console.log('[Linter] Starting lint...');
    console.log('[Linter] Current settings:', settings);

    let lintStartTime = 0;

    try {
      lintStartTime = performance.now();
      // Extract cells from DOM (MAIN-world bridge, DOM-scrape fallback)
      const cells = await domParser.extractCells();
      console.log(`[Linter] Extracted ${cells.length} cells`);

      // Never clear() the store here. Both extraction paths are DOM-based:
      // the MAIN-world bridge sees full CodeMirror document text for
      // editors that ARE rendered, but — like the DOM-scrape fallback — it
      // has no visibility into cells Kaggle hasn't mounted a `.cm-editor`
      // for at all (i.e. cells scrolled out of a virtualized notebook). So
      // "bridge succeeded" never means "saw every cell," and clearing on
      // that basis would wipe exactly the virtualized-out coverage this
      // store exists to provide. We only ever merge; a cell the user
      // deletes leaves a stale store entry until the page reloads, which
      // is an accepted tradeoff (extraction can't tell "deleted" apart
      // from "not currently rendered").
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
          elementByCellId.get(codeMirrorManager.getCellId(stored.cellIndex, stored.uuid)) ?? null,
      }));

      // The protocol is JSON-only (no DOM elements cross chrome.runtime
      // messaging), so strip elements before sending and re-attach them
      // to the returned errors by cellIndex — error-click-to-scroll needs
      // them.
      const ignoreCodes = (settings.linterEngine === 'flake8'
        ? settings.flake8IgnoreCodes
        : settings.ruffIgnoreCodes
      )
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code.length > 0);

      console.log(`[Linter] Running ${settings.linterEngine} engine...`);
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
        console.log(`[Linter] ${settings.linterEngine} engine found ${lintErrors.length} errors`);
      } catch (error) {
        setEngineStatus('failed');
        throw error;
      }

      // Update errors state
      setErrors(lintErrors);
      console.log('[Linter] Updated errors state with', lintErrors.length, 'errors');
    } catch (error) {
      console.error('[Linter] Error during linting:', error);
      console.warn(`[Linter] ${settings.linterEngine} failed, you may need to reload the page`);
    } finally {
      isLintingRef.current = false;
      setIsLinting(false);
      console.log(`[Linter] Lint completed in ${(performance.now() - lintStartTime).toFixed(0)}ms`);
    }
  }, [domParser, codeMirrorManager, settings, engineClientRef]);

  useEffect(() => {
    runLinterRef.current = runLinter;
  }, [runLinter]);

  /**
   * Initialize linter on mount
   */
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
          console.log('[Linter] Loaded settings from storage:', result.linterSettings);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...result.linterSettings,
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

  useEffect(() => {
    if (!settingsLoaded) return;
    console.log('[Linter] Running initial lint...');
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
   * Re-run linter when settings change (but not on initial mount)
   */
  const prevSettingsRef = React.useRef<Settings | null>(null);
  useEffect(() => {
    console.log('[Linter] Settings changed:', settings);
    if (!settingsLoaded) return;
    if (prevSettingsRef.current !== null) {
      runLinterRef.current();
    }
    prevSettingsRef.current = settings;
  }, [settings, settingsLoaded]);

  /**
   * Setup keyboard shortcuts
   */
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

  /**
   * Setup message listener for chrome extension
   */
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const messageListener = (
        message: any,
        _sender: any,
        sendResponse: any
      ) => {
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
          });
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
   * trigger another lint.
   */
  useEffect(() => {
    if (!settingsLoaded) return undefined;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRelint = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        console.log('[Linter] Auto re-lint after edit');
        runLinterRef.current();
      }, 800);
    };

    const overlayRoot = document.getElementById('kaggle-linter-root');

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
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
   * Handle error click
   */
  const handleErrorClick = (error: any) => {
    if (error.element) {
      error.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight cell
      error.element.classList.add('kaggle-lint-highlight');
      setTimeout(() => {
        error.element.classList.remove('kaggle-lint-highlight');
      }, 2000);
    }
  };

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
};
