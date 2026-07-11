/**
 * ErrorItem Component
 * Displays a single lint error item
 *
 * MIGRATION NOTE: Logic copied verbatim from old-linter/src/ui/overlay.js
 * Only converted to React component format with TypeScript
 */

import React from 'react';
import { ErrorItemProps } from '../types';
import { ErrorIcon, WarningIcon, InfoIcon, EyeOffIcon } from '../icons';

const SEVERITY_ICONS = {
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

/**
 * Escapes HTML special characters
 * EXACT COPY from old-linter/src/ui/overlay.js escapeHtml function
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export const ErrorItem: React.FC<ErrorItemProps> = ({
  error,
  index,
  onClick,
  onIgnoreCode,
}) => {
  const severityClass = `kaggle-lint-severity-${error.severity}`;
  const SeverityIcon = SEVERITY_ICONS[error.severity];

  const handleIgnoreClick = (e: React.MouseEvent) => {
    // Don't trigger the row's own click (scroll-to-error) — muting a code
    // is a separate action from navigating to it.
    e.stopPropagation();
    if (error.code) {
      onIgnoreCode?.(error.code);
    }
  };

  return (
    <li
      className={`kaggle-lint-error-item ${severityClass}`}
      data-error-index={index}
      onClick={onClick}
    >
      {/* 1. Left Icon Column */}
      <div className={`kaggle-lint-icon kaggle-lint-${error.severity}`}>
        <SeverityIcon />
      </div>

      {/* 2. Middle Content Stack */}
      <div className="kaggle-lint-error-content">
        <div className="kaggle-lint-error-header">
          <span className="kaggle-lint-location">
            Cell {(error.cellIndex ?? 0) + 1}:{error.cellLine ?? error.line}
          </span>
          <span className="kaggle-lint-code-badge">
            {error.code || error.rule}
          </span>
        </div>
        <span
          className="kaggle-lint-message"
          dangerouslySetInnerHTML={{ __html: escapeHtml(error.msg) }}
        />
      </div>

      {/* 3. Right Action Column */}
      {error.code && (
        <button
          type="button"
          className="kaggle-lint-btn-ignore"
          title={`Ignore ${error.code} everywhere`}
          onClick={handleIgnoreClick}
        >
          <EyeOffIcon />
        </button>
      )}
    </li>
  );
};
