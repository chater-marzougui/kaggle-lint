/**
 * Content Script Entry Point
 * Injects React app into Kaggle notebook pages
 *
 * MIGRATION NOTE: Logic from old-linter/src/content.js
 * Only the React mounting is new, core logic preserved
 */

import { createRoot } from 'react-dom/client';
import { ContentApp } from './ContentApp';
import { createLogger } from '../utils/logger';

const logger = createLogger();
const NOTEBOOK_SELECTOR = '.jp-Notebook';

function mount(): void {
  logger.log('Initializing...');

  // Check if already initialized to prevent double mounting
  const existingRoot = document.getElementById('kaggle-linter-root');
  if (existingRoot) {
    logger.log('Already initialized, skipping...');
    return;
  }

  // Create mount point for React app
  const mountPoint = document.createElement('div');
  mountPoint.id = 'kaggle-linter-root';
  mountPoint.style.position = 'fixed';
  mountPoint.style.zIndex = '10000';
  document.body.appendChild(mountPoint);

  // Render React app (without StrictMode to avoid double rendering)
  const root = createRoot(mountPoint);
  root.render(<ContentApp />);

  logger.log('Initialized successfully');
}

/**
 * manifest.json injects this script (all_frames: true) into both the
 * outer kaggle.com shell page and the jupyter-proxy iframe that actually
 * hosts the notebook. A manifest `matches` pattern can't express "only the
 * frame that has a notebook in it," so the gate runs at mount time
 * instead: only the frame where `.jp-Notebook` actually appears in the DOM
 * mounts the overlay (F32). No timeout-then-mount-anyway — a frame where
 * the notebook never appears (the outer shell, and the Pyodide-CDN match
 * until Milestone 4 Task 1 deletes it) must never mount: no overlay, no
 * keydown listener, no chrome.runtime message listener.
 */
function waitForNotebookThenMount(): void {
  if (document.querySelector(NOTEBOOK_SELECTOR)) {
    mount();
    return;
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(NOTEBOOK_SELECTOR)) {
      observer.disconnect();
      mount();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForNotebookThenMount);
} else {
  waitForNotebookThenMount();
}
