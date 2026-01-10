/**
 * ErrorList Component
 * Displays list of lint errors
 * 
 * MIGRATION NOTE: Logic copied verbatim from old-linter/src/ui/overlay.js
 * Only converted to React component format with TypeScript
 */

import React from 'react';
import { ErrorListProps } from '../types';
import { ErrorItem } from '../ErrorItem';

export const ErrorList: React.FC<ErrorListProps> = ({ errors, onErrorClick }) => {
  // EXACT LOGIC from displayErrors function in old-linter/src/ui/overlay.js
  if (errors.length === 0) {
    return <div className="kaggle-lint-success">✅ No issues found!</div>;
  }

  return (
    <ul className="kaggle-lint-errors">
      {errors.map((error, idx) => (
        <ErrorItem
          key={idx}
          error={error}
          index={idx}
          onClick={() => onErrorClick?.(error)}
        />
      ))}
    </ul>
  );
};
