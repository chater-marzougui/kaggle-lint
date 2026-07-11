/**
 * UI Component Types
 * Re-export core types and add UI-specific types
 */

import type { Severity, LintError } from '@kaggle-lint/core';

export type { Severity, LintError };

/**
 * A LintError enriched with what the overlay needs to render and act on a
 * violation: its position within the cell (vs. the whole-notebook line the
 * bare `line` field carries), the live DOM element for click-to-scroll
 * (null once Kaggle virtualizes the cell out of the DOM), and the cell's
 * stable uuid (added in Milestone 7) for the MAIN-world scroll bridge.
 * This is the actual shape every UI component below receives — replacing
 * the untyped `any` that used to stand in for it (F29).
 */
export interface LintUIError extends LintError {
  cellLine?: number;
  element?: Element | null;
  uuid?: string | null;
}

export interface OverlayUiState {
  position: { x: number; y: number };
  isMinimized: boolean;
}

export interface OverlayProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onIgnoreCode?: (code: string) => void;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  visible?: boolean;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
  engineStatus?: 'unloaded' | 'loading' | 'ready' | 'failed';
  initialPosition?: { x: number; y: number };
  initialMinimized?: boolean;
  onStateChange?: (state: OverlayUiState) => void;
}

export interface ErrorStats {
  total: number;
  bySeverity: {
    error: number;
    warning: number;
    info: number;
  };
}

export interface ErrorListProps {
  errors: LintUIError[];
  onErrorClick?: (error: LintUIError) => void;
  onIgnoreCode?: (code: string) => void;
  /** Shown instead of the list when `errors` is empty. Defaults to a
   * generic message; the severity tabs in Overlay pass a per-tab one
   * (e.g. "No warnings") since ErrorList only ever sees one severity's
   * errors at a time now. */
  emptyMessage?: string;
}

export interface ErrorItemProps {
  error: LintUIError;
  index: number;
  onClick?: () => void;
  onIgnoreCode?: (code: string) => void;
}
