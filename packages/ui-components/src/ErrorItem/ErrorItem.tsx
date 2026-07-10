/**
 * ErrorItem Component
 * Displays a single lint error item
 *
 * MIGRATION NOTE: Logic copied verbatim from old-linter/src/ui/overlay.js
 * Only converted to React component format with TypeScript
 */

import React from 'react';
import { ErrorItemProps } from '../types';

const SEVERITY_ICONS = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
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
      <span className={`kaggle-lint-icon kaggle-lint-${error.severity}`}>
        {SEVERITY_ICONS[error.severity]}
      </span>
      <span className="kaggle-lint-location">
        Cell {(error.cellIndex ?? 0) + 1}:{error.cellLine ?? error.line}
      </span>
      <span
        className="kaggle-lint-message"
        dangerouslySetInnerHTML={{ __html: escapeHtml(error.msg) }}
      />
      <span className="kaggle-lint-rule">
        [{error.rule}
        {error.code ? ` ${error.code}` : ''}]
      </span>
      {error.code && (
        <button
          type="button"
          className="kaggle-lint-btn-ignore"
          title={`Ignore ${error.code} everywhere`}
          onClick={handleIgnoreClick}
        >
          🔇
        </button>
      )}
    </li>
  );
};
