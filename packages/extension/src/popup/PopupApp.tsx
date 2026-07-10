/**
 * Popup App Component
 * Extension settings panel
 */

import React, { useState, useEffect } from 'react';

interface Settings {
  linterEngine: 'flake8' | 'ruff';
  flake8IgnoreCodes: string;
  ruffIgnoreCodes: string;
}

const DEFAULT_SETTINGS: Settings = {
  linterEngine: 'ruff',
  flake8IgnoreCodes: '',
  ruffIgnoreCodes: '',
};

export const PopupApp: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isKaggle, setIsKaggle] = useState(true);

  // Load settings from chrome storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['linterSettings'], (result: any) => {
        if (result.linterSettings) {
          // Merge with defaults to ensure all properties exist
          setSettings({
            ...DEFAULT_SETTINGS,
            ...result.linterSettings,
          });
        }
      });
    }
  }, []);

  // Check if current tab is a Kaggle page
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          const isKagglePage = tabs[0].url.includes('kaggle.com');
          setIsKaggle(isKagglePage);
        }
      });
    }
  }, []);

  // Detect and apply theme
  useEffect(() => {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
    if (!prefersDark) {
      document.body.classList.add('light-theme');
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.add('light-theme');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Save settings to chrome storage
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ linterSettings: newSettings });

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'settingsChanged',
            settings: newSettings,
          });
        }
      });
    }
  };

  const handleEngineChange = (engine: 'flake8' | 'ruff') => {
    saveSettings({ ...settings, linterEngine: engine });
  };

  const handleIgnoreCodesChange = (engine: 'flake8' | 'ruff', value: string) => {
    if (engine === 'flake8') {
      saveSettings({ ...settings, flake8IgnoreCodes: value });
    } else {
      saveSettings({ ...settings, ruffIgnoreCodes: value });
    }
  };

  const handleRefresh = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'runLinter' });
        }
      });
    }
  };

  const handleToggleOverlay = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleOverlay' });
        }
      });
    }
  };

  if (!isKaggle) {
    return (
      <div className="popup-container">
        <div id="not-kaggle-content" className="not-kaggle-container">
          <div className="not-kaggle-message">
            <svg
              className="not-kaggle-icon"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
              <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z" />
            </svg>
            <h2>Not in Kaggle Notebook</h2>
            <p className="not-kaggle-text">
              This extension only works on Kaggle Notebooks.
            </p>
            <a
              href="https://www.kaggle.com/code"
              target="_blank"
              rel="noreferrer"
              className="kaggle-link"
            >
              Open Kaggle
            </a>
          </div>
        </div>
      </div>
    );
  }

  const currentIgnoreCodes =
    settings.linterEngine === 'flake8' ? settings.flake8IgnoreCodes : settings.ruffIgnoreCodes;

  return (
    <div className="popup-container">
      <div className="header">
        <div className="header-title">
          <img
            src="/icons/icon48.png"
            alt="Kaggle Linter"
            className="header-icon"
          />
          <div className="header-text">
            <h1>Kaggle Linter</h1>
            <p className="subtitle">Python code quality checker</p>
          </div>
        </div>
      </div>

      <div id="kaggle-content">
        {/* Linter Engine Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Linter Engine</h2>
          </div>
          <div className="section-content">
            <div className="option-group">
              <label className="option-item">
                <input
                  type="radio"
                  name="linter-engine"
                  value="flake8"
                  checked={settings.linterEngine === 'flake8'}
                  onChange={() => handleEngineChange('flake8')}
                />
                <div className="option-info">
                  <span className="option-label">Flake8 (slower first load)</span>
                  <span className="option-description">
                    Industry-standard Python linter (pyflakes + pycodestyle + mccabe)
                  </span>
                </div>
              </label>
              <label className="option-item">
                <input
                  type="radio"
                  name="linter-engine"
                  value="ruff"
                  checked={settings.linterEngine === 'ruff'}
                  onChange={() => handleEngineChange('ruff')}
                />
                <div className="option-info">
                  <span className="option-label">Ruff (recommended — instant)</span>
                  <span className="option-description">
                    Fast Rust-based Python linter — no Python runtime needed
                  </span>
                </div>
              </label>
            </div>
            <div className="status-message">
              {settings.linterEngine} will be loaded on first lint
            </div>
          </div>
        </div>

        {/* Ignore Codes Section */}
        <div className="section" id="ignore-codes-section">
          <div className="section-header">
            <h2 className="section-title">Ignore Codes</h2>
          </div>
          <div className="section-content">
            <label className="option-item" style={{ display: 'block' }}>
              <span className="option-description">
                Comma-separated codes to ignore for {settings.linterEngine} (e.g. E501, F401)
              </span>
              <input
                type="text"
                value={currentIgnoreCodes}
                onChange={(e) => handleIgnoreCodesChange(settings.linterEngine, e.target.value)}
                placeholder="E501, F401"
              />
            </label>
          </div>
        </div>

        {/* Actions Section */}
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Actions</h2>
          </div>
          <div className="section-content">
            <button
              id="refresh-btn"
              className="action-btn action-btn-primary"
              onClick={handleRefresh}
            >
              <svg className="btn-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
              </svg>
              Re-lint Now
            </button>
            <button
              id="toggle-overlay-btn"
              className="action-btn action-btn-secondary"
              onClick={handleToggleOverlay}
            >
              <svg className="btn-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
              </svg>
              Toggle Overlay
            </button>
          </div>
        </div>
      </div>

      <div className="footer">
        <span className="footer-version">v2.0.0</span>
        <a
          href="https://github.com/chater-marzougui/kaggle-lint"
          target="_blank"
          rel="noreferrer"
          className="footer-link"
        >
          <svg className="footer-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
      </div>
    </div>
  );
};
