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

export const ErrorItem: React.FC<ErrorItemProps> = ({ error, index, onClick }) => {
  const severityClass = `kaggle-lint-severity-${error.severity}`;
  
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
      <span className="kaggle-lint-rule">[{error.rule}]</span>
    </li>
  );
};
