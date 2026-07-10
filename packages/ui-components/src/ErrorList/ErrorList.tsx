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

const SEVERITY_RANK: Record<'error' | 'warning' | 'info', number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** All errors first (by position), then warnings (by position), then info. */
function bySeverityThenPosition(
  a: ErrorListProps['errors'][0],
  b: ErrorListProps['errors'][0]
): number {
  const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }
  const cellDelta = (a.cellIndex ?? 0) - (b.cellIndex ?? 0);
  if (cellDelta !== 0) {
    return cellDelta;
  }
  return (a.cellLine ?? a.line) - (b.cellLine ?? b.line);
}

export const ErrorList: React.FC<ErrorListProps> = ({
  errors,
  onErrorClick,
}) => {
  // EXACT LOGIC from displayErrors function in old-linter/src/ui/overlay.js
  if (errors.length === 0) {
    return <div className="kaggle-lint-success">✅ No issues found!</div>;
  }

  const sortedErrors = [...errors].sort(bySeverityThenPosition);

  return (
    <ul className="kaggle-lint-errors">
      {sortedErrors.map((error, idx) => (
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
