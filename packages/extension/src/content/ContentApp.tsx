/**
 * ContentApp Component
 * Main React component for the content script
 * Integrates linting and UI overlay
 *
 * MIGRATION NOTE: Logic from old-linter/src/content.js
 * Converted to React component structure
 */

import React, { useState, useEffect, useCallback } from 'react';
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

interface Settings {
  linterEngine: 'handmade' | 'flake8';
  rules: Record<string, boolean>;
}

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

export const ContentApp: React.FC = () => {
  const [errors, setErrors] = useState<any[]>([]);
  const [visible, setVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLinting, setIsLinting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [flake8Status, setFlake8Status] = useState<'unloaded' | 'loading' | 'ready'>('unloaded');

  const handmadeLintEngineRef = React.useRef<LintEngine | null>(null);
  const flake8EngineRef = React.useRef<Flake8Engine>(new Flake8Engine());
  const domParser = React.useRef(new KaggleDomParser()).current;
  const codeMirrorManager = React.useRef(new CodeMirrorManager()).current;

  const runLinterRef = React.useRef<() => Promise<void>>(async () => {});
  const isLintingRef = React.useRef(false);

  /**
   * Create handmade lint engine based on settings
   */
  const getHandmadeLintEngine = useCallback(() => {
    const enabledRules = Object.entries(settings.rules)
      .filter(([_, enabled]) => enabled)
      .map(([ruleId]) => RULE_MAP[ruleId]?.())
      .filter(Boolean);
    
    console.log(`[Linter] Creating handmade engine with ${enabledRules.length} rules`);
    handmadeLintEngineRef.current = new LintEngine(enabledRules);
    
    return handmadeLintEngineRef.current;
  }, [settings.rules]);

  /**
   * Initialize Flake8 engine if needed
   */
  const initializeFlake8 = useCallback(async () => {
    if (flake8Status === 'ready') {
      return flake8EngineRef.current;
    }

    if (flake8Status === 'loading') {
      // Wait for it to finish loading
      while (!flake8EngineRef.current.isReady()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return flake8EngineRef.current;
    }

    console.log('[Linter] Initializing Flake8 engine...');
    setFlake8Status('loading');
    
    try {
      await flake8EngineRef.current.initialize();
      setFlake8Status('ready');
      console.log('[Linter] Flake8 engine ready');
      return flake8EngineRef.current;
    } catch (error) {
      console.error('[Linter] Failed to initialize Flake8:', error);
      setFlake8Status('unloaded');
      throw error;
    }
  }, [flake8Status]);

  /**
   * Run the linter
   * EXACT LOGIC from old-linter/src/content.js runLinter function
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

    try {
      // Extract cells from DOM
      const cells = await domParser.extractCells();
      console.log(`[Linter] Extracted ${cells.length} cells`);

      // Sync with CodeMirror storage
      codeMirrorManager.syncCells(cells);

      // Prepare cells for linting
      const cellsForLinting = cells.map((cell, index) => ({
        code: cell.code,
        element: cell.element,
        cellIndex: index,
      }));

      let lintErrors;
      
      if (settings.linterEngine === 'handmade') {
        // Run handmade linter
        console.log('[Linter] Running handmade engine...');
        const engine = getHandmadeLintEngine();
        lintErrors = engine.lintNotebook(cellsForLinting);
        console.log(`[Linter] Handmade engine found ${lintErrors.length} errors`);
      } else {
        // Run flake8
        console.log('[Linter] Running flake8 engine...');
        const flake8Engine = await initializeFlake8();
        lintErrors = await flake8Engine.lintNotebook(cellsForLinting);
        console.log(`[Linter] Flake8 engine found ${lintErrors.length} errors`);
      }

      // Update errors state
      setErrors(lintErrors);
      console.log('[Linter] Updated errors state with', lintErrors.length, 'errors');
    } catch (error) {
      console.error('[Linter] Error during linting:', error);
      // If flake8 fails, show user-friendly message
      if (settings.linterEngine === 'flake8') {
        console.warn('[Linter] Flake8 failed, you may need to reload the page');
      }
    } finally {
      isLintingRef.current = false;
      setIsLinting(false);
    }
  }, [domParser, codeMirrorManager, settings, getHandmadeLintEngine, initializeFlake8]);

  useEffect(() => {
    runLinterRef.current = runLinter;
  }, [runLinter]);

  /**
   * Initialize linter on mount
   * EXACT LOGIC from old-linter/src/content.js init function
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

  /**
   * Re-run linter when settings change (but not on initial mount)
   */
  useEffect(() => {
    console.log('[Linter] Settings changed:', settings);
    // Invalidate the handmade engine so it gets recreated with new settings
    handmadeLintEngineRef.current = null;
  }, [settings]);

  /**
   * Setup keyboard shortcuts
   * EXACT LOGIC from old-linter/src/content.js keyboard event handler
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
   * EXACT LOGIC from old-linter/src/content.js setupMessageListener function
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

  /**
   * Handle error click
   * EXACT LOGIC from old-linter/src/ui/overlay.js scrollToError function
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
      isLoading={isLinting}
      flake8Status={settings.linterEngine === 'flake8' ? flake8Status : undefined}
    />
  );
};