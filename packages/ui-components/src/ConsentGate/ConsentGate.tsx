/**
 * ConsentGate Component
 * Shown once, in place of the overlay, before a user has agreed to the
 * extension's disclaimer — see README.md's "Disclaimer" section for the
 * full text this summarizes. ContentApp decides whether to render this or
 * <Overlay/> based on a persisted `disclaimerAccepted` flag; this
 * component has no storage access of its own, it just reports the click.
 */

import React from 'react';
import { ConsentGateProps } from '../types';
// No CSS import here deliberately — webpack's CopyPlugin only ever copies
// Overlay.css verbatim into the extension's content.css (the file
// manifest.json actually injects; the sole source of styling reliability
// this project has established, see webpack.config.js), so this
// component's rules live at the bottom of Overlay.css instead of a
// separate file that wouldn't reach that copy.

export const ConsentGate: React.FC<ConsentGateProps> = ({
  theme = 'light',
  onAgree,
}) => {
  return (
    <div
      id="kaggle-lint-consent-gate"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme}`}
    >
      <div className="kaggle-lint-header">
        <span className="kaggle-lint-title">
          <img
            src={chrome?.runtime?.getURL?.('icons/icon48.png') || ''}
            alt="Kaggle Linter"
            className="kaggle-lint-title-icon"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="kaggle-lint-title-text">Kaggle Linter</span>
        </span>
      </div>

      <div className="kaggle-lint-content kaggle-lint-consent-content">
        <p className="kaggle-lint-consent-intro">
          Before your first lint, a few things worth knowing:
        </p>
        <ul className="kaggle-lint-consent-list">
          <li>
            This is an independent project, not affiliated with or endorsed
            by Kaggle or Google.
          </li>
          <li>
            It only reads your notebook to lint it — it never edits, runs,
            or submits anything, and never leaves your browser.
          </li>
          <li>
            Lint results are suggestions, not guarantees. Use your own
            judgment, and use the extension at your own risk.
          </li>
        </ul>
        <p className="kaggle-lint-consent-links">
          Full details:{' '}
          <a
            href="https://github.com/chater-marzougui/kaggle-lint#%EF%B8%8F-disclaimer"
            target="_blank"
            rel="noreferrer"
          >
            Disclaimer
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/chater-marzougui/kaggle-lint/blob/main/PRIVACY.md"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
        </p>
        <button
          type="button"
          className="kaggle-lint-consent-agree-btn"
          onClick={onAgree}
        >
          I Agree — Start Linting
        </button>
      </div>
    </div>
  );
};
