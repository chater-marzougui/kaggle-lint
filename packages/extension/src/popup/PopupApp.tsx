/**
 * Popup App Component
 * Extension settings panel
 */

import React, { useState, useEffect } from 'react';
import { pingContentScript, sendToContentScript } from './contentScriptBridge';

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
  // ponytail: not wired to real overlay-visibility state (that's deliberately
  // never persisted/queried, see ContentApp.tsx) — purely local UI state for
  // the switch's on/off look, same as the old button being always clickable.
  const [overlayEnabled, setOverlayEnabled] = useState(true);

  // Load settings from chrome storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(
        ['linterSettings'],
        (result: { linterSettings?: Partial<Settings> }) => {
          if (result.linterSettings) {
            // Merge with defaults to ensure all properties exist
            setSettings({
              ...DEFAULT_SETTINGS,
              ...result.linterSettings,
            });
          }
        }
      );
    }
  }, []);

  // Detect whether the content script is actually running in the active
  // tab (F12) — a URL match alone can't tell, since the content script
  // only injects on /code/*/*/edit, not every kaggle.com page.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId === undefined) {
        setIsKaggle(false);
        return;
      }
      pingContentScript(tabId).then(setIsKaggle);
    });
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
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) return;
        sendToContentScript(tabId, {
          type: 'settingsChanged',
          settings: newSettings,
        }).then((result) => {
          if (!result.ok) setIsKaggle(false);
        });
      });
    }
  };

  const handleEngineChange = (engine: 'flake8' | 'ruff') => {
    saveSettings({ ...settings, linterEngine: engine });
  };

  const handleIgnoreCodesChange = (
    engine: 'flake8' | 'ruff',
    value: string
  ) => {
    if (engine === 'flake8') {
      saveSettings({ ...settings, flake8IgnoreCodes: value });
    } else {
      saveSettings({ ...settings, ruffIgnoreCodes: value });
    }
  };

  const handleToggleOverlay = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) return;
        sendToContentScript(tabId, { type: 'toggleOverlay' }).then((result) => {
          if (!result.ok) setIsKaggle(false);
        });
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
            <h2>Not Connected</h2>
            <p className="not-kaggle-text">
              Open a Kaggle notebook in edit mode to use this extension.
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
    settings.linterEngine === 'flake8'
      ? settings.flake8IgnoreCodes
      : settings.ruffIgnoreCodes;

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
            <div className="engine-selector">
              <button
                type="button"
                className={`engine-pill${settings.linterEngine === 'flake8' ? ' active' : ''}`}
                onClick={() => handleEngineChange('flake8')}
              >
                <span className="engine-pill-name">Flake8</span>
                <span className="engine-pill-meta">
                  Thorough{settings.linterEngine === 'flake8' ? ' · selected' : ''}
                </span>
              </button>
              <button
                type="button"
                className={`engine-pill${settings.linterEngine === 'ruff' ? ' active' : ''}`}
                onClick={() => handleEngineChange('ruff')}
              >
                <span className="engine-pill-name">Ruff</span>
                <span className="engine-pill-meta">
                  Instant{settings.linterEngine === 'ruff' ? ' · selected' : ''}
                </span>
              </button>
            </div>
            <p className="engine-caption">
              {settings.linterEngine === 'flake8'
                ? 'Industry-standard Python linter (pyflakes + pycodestyle + mccabe)'
                : 'Fast Rust-based Python linter — no Python runtime needed'}
            </p>
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
                Comma-separated codes to ignore for {settings.linterEngine}{' '}
                (e.g. E501, F401). Add &quot;debug&quot; to enable debug
                logging.
              </span>
              <input
                type="text"
                value={currentIgnoreCodes}
                onChange={(e) =>
                  handleIgnoreCodesChange(settings.linterEngine, e.target.value)
                }
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
            <div className="overlay-toggle-row">
              <div className="overlay-toggle-info">
                <span className="option-label">Show overlay on Kaggle</span>
                <span className="option-description">
                  Re-lints live as you edit
                </span>
              </div>
              <label className="rule-toggle">
                <input
                  type="checkbox"
                  checked={overlayEnabled}
                  onChange={(e) => {
                    setOverlayEnabled(e.target.checked);
                    handleToggleOverlay();
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="footer">
        <span className="footer-version">v{process.env.EXTENSION_VERSION}</span>
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
