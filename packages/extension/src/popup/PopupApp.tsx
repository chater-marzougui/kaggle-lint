/**
 * Popup App Component
 * Simple settings panel for the extension
 *
 * MIGRATION NOTE: Simplified version of old-linter/src/popup/popup.js
 * Core functionality preserved
 */

import React, { useState, useEffect } from 'react';

interface Settings {
  engine: 'custom' | 'flake8';
  autoLint: boolean;
  showInfo: boolean;
}

export const PopupApp: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    engine: 'custom',
    autoLint: true,
    showInfo: true,
  });

  // Load settings from chrome storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['linterSettings'], (result: any) => {
        if (result.linterSettings) {
          setSettings(result.linterSettings);
        }
      });
    }
  }, []);

  // Save settings to chrome storage
  const handleSettingsChange = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ linterSettings: updated });

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'settingsChanged',
            settings: updated,
          });
        }
      });
    }
  };

  return (
    <div className="popup">
      <h1>Kaggle Python Linter</h1>

      <div className="section">
        <h3 style={{ fontSize: '13px', marginBottom: '8px' }}>
          Linting Engine
        </h3>
        <select
          value={settings.engine}
          onChange={(e) =>
            handleSettingsChange({
              engine: e.target.value as 'custom' | 'flake8',
            })
          }
          style={{ width: '100%', padding: '4px' }}
        >
          <option value="custom">Custom Rules (Fast)</option>
          <option value="flake8">Flake8 (Comprehensive)</option>
        </select>
      </div>

      <div className="section" style={{ marginTop: '16px' }}>
        <h3 style={{ fontSize: '13px', marginBottom: '8px' }}>Options</h3>
        <label
          style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}
        >
          <input
            type="checkbox"
            checked={settings.autoLint}
            onChange={(e) =>
              handleSettingsChange({ autoLint: e.target.checked })
            }
          />
          <span style={{ marginLeft: '8px' }}>Auto-lint on code changes</span>
        </label>
        <label style={{ display: 'block', fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={settings.showInfo}
            onChange={(e) =>
              handleSettingsChange({ showInfo: e.target.checked })
            }
          />
          <span style={{ marginLeft: '8px' }}>Show info-level messages</span>
        </label>
      </div>

      <div className="stats">
        <p>Press Ctrl+Shift+L in notebook to run linter</p>
        <p>Press Ctrl+Shift+H to toggle overlay</p>
      </div>
    </div>
  );
};
