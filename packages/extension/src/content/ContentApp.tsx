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
import { createLogger } from '../utils/logger';

const logger = createLogger('ContentApp');

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
        logger.log(`${settings.linterEngine} engine found ${lintErrors.length} errors`);
      } catch (error) {
        setEngineStatus('failed');
        throw error;
      }

      // Update errors state
      setErrors(lintErrors);
      logger.log('Updated errors state with', lintErrors.length, 'errors');
    } catch (error) {
      logger.error('Error during linting:', error);
      logger.warn(`${settings.linterEngine} failed, you may need to reload the page`);
    } finally {
      isLintingRef.current = false;
      setIsLinting(false);
      logger.log(`Lint completed in ${(performance.now() - lintStartTime).toFixed(0)}ms`);
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
      chrome.storage.sync.get(['linterSettings'], (result: any) => {
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
      });
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
   * Setup message listener for chrome extension
   */
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const messageListener = (
        message: any,
        _sender: any,
        sendResponse: any
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
        logger.log('Auto re-lint after edit');
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
   * Handle error click (F33): ask the MAIN-world bridge to scroll via
   * Jupyter's own virtualization-aware APIs and reveal the exact line.
   * Falls back to a plain DOM scrollIntoView only if the bridge can't
   * find the cell (pageExtractor not loaded in this frame, or the live
   * JupyterLab API shape doesn't match what pageExtractor.ts expects) —
   * 'auto' behavior, not 'smooth': an animated scroll can drift once
   * virtualization reflows mid-animation, which is the bug F33 reports.
   */
  const handleErrorClick = async (error: any) => {
    const ok = await domParser.scrollToCellLine(
      error.uuid ?? null,
      error.cellIndex ?? 0,
      error.cellLine ?? error.line ?? 1
    );
    if (!ok && error.element) {
      error.element.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    if (error.element) {
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
