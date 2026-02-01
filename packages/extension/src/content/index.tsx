/**
 * Content Script Entry Point
 * Injects React app into Kaggle notebook pages
 *
 * MIGRATION NOTE: Logic from old-linter/src/content.js
 * Only the React mounting is new, core logic preserved
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ContentApp } from './ContentApp';

// Wait for DOM to be ready
function init() {
  console.log('[Kaggle Linter] Initializing...');

  // Check if already initialized to prevent double mounting
  const existingRoot = document.getElementById('kaggle-linter-root');
  if (existingRoot) {
    console.log('[Kaggle Linter] Already initialized, skipping...');
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

  console.log('[Kaggle Linter] Initialized successfully');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
