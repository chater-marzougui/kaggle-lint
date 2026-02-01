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
import { LintEngine } from '@kaggle-lint/core';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import { CodeMirrorManager } from '../utils/CodeMirrorManager';

interface Settings {
  engine: 'custom' | 'flake8';
  autoLint: boolean;
  showInfo: boolean;
}

export const ContentApp: React.FC = () => {
  const [errors, setErrors] = useState<any[]>([]);
  const [visible, setVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLinting, setIsLinting] = useState(false);
  const [_settings, _setSettings] = useState<Settings>({
    engine: 'custom',
    autoLint: true,
    showInfo: true,
  });

  const lintEngine = React.useRef(new LintEngine()).current;
  const domParser = React.useRef(new KaggleDomParser()).current;
  const codeMirrorManager = React.useRef(new CodeMirrorManager()).current;

  /**
   * Run the linter
   * EXACT LOGIC from old-linter/src/content.js runLinter function
   */
  const runLinter = useCallback(async () => {
    if (isLinting) {
      console.log('[Linter] Already linting, skipping...');
      return;
    }

    setIsLinting(true);
    console.log('[Linter] Starting lint...');

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

      // Run linter
      const lintErrors = lintEngine.lintNotebook(cellsForLinting);
      console.log(`[Linter] Found ${lintErrors.length} errors`);

      // Update errors state
      setErrors(lintErrors);
    } catch (error) {
      console.error('[Linter] Error during linting:', error);
    } finally {
      setIsLinting(false);
    }
  }, [isLinting, domParser, codeMirrorManager, lintEngine]);

  /**
   * Initialize linter on mount
   * EXACT LOGIC from old-linter/src/content.js init function
   */
  useEffect(() => {
    // Detect theme
    const detectedTheme = domParser.detectTheme();
    setTheme(detectedTheme);

    // Load settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['linterSettings'], (result: any) => {
        if (result.linterSettings) {
          _setSettings(result.linterSettings);
        }
      });
    }

    // Run linter after a brief delay
    const timer = setTimeout(() => {
      runLinter();
    }, 1000);

    return () => clearTimeout(timer);
  }, [domParser, runLinter]);

  /**
   * Setup keyboard shortcuts
   * EXACT LOGIC from old-linter/src/content.js keyboard event handler
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+L: Run linter
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        runLinter();
      }
      // Ctrl+Shift+H: Toggle overlay
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setVisible((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [runLinter]);

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
          runLinter();
          sendResponse({ success: true });
        } else if (message.type === 'toggleOverlay') {
          setVisible((prev) => !prev);
          sendResponse({ success: true });
        } else if (message.type === 'settingsChanged') {
          _setSettings(message.settings);
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
    />
  );
};
