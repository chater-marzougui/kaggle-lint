/**
 * Overlay Component
 * Main overlay UI for displaying lint results. Minimize/expand state and
 * geometry are driven by React state + CSS classes (F11) — dragging is the
 * one place this component still writes to the DOM directly, and it does
 * so via a ref-held offset written to CSS custom properties, not React
 * state, so a drag doesn't re-render the panel on every mousemove.
 */

import React, { useState, useEffect, useRef } from 'react';
import { OverlayProps, ErrorStats, LintUIError, Severity } from '../types';
import { ErrorList } from '../ErrorList';
import {
  ErrorIcon,
  WarningIcon,
  InfoIcon,
  SuccessIcon,
  XIcon,
  chevronIcon,
  refreshIcon,
  type IconProps,
} from '../icons';
import './Overlay.css';

interface SeverityTab {
  key: Severity;
  label: string;
  Icon: React.FC<IconProps>;
}

const SEVERITY_TABS: SeverityTab[] = [
  { key: 'error', label: 'Errors', Icon: ErrorIcon },
  { key: 'warning', label: 'Warnings', Icon: WarningIcon },
  { key: 'info', label: 'Info', Icon: InfoIcon },
];

function calculateStats(errors: LintUIError[]): ErrorStats {
  const stats: ErrorStats = {
    total: errors.length,
    bySeverity: {
      error: 0,
      warning: 0,
      info: 0,
    },
  };

  errors.forEach((error) => {
    stats.bySeverity[error.severity]++;
  });

  return stats;
}

export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onIgnoreCode,
  onRefresh,
  onClose,
  visible = true,
  isLoading = false,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
  engineStatus,
  initialPosition,
  initialMinimized = false,
  onStateChange,
}) => {
  const [isMinimized, setIsMinimized] = useState(initialMinimized);
  const isMinimizedRef = useRef(initialMinimized);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Which severity's errors are rendered below the tabs — only this one
  // severity's errors are ever mounted at a time (not held offscreen),
  // so a notebook with hundreds of errors doesn't pay for rendering all
  // three lists just because one is active.
  const [activeSeverity, setActiveSeverity] = useState<Severity>('error');
  const overlayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({
    x: initialPosition?.x ?? 0,
    y: initialPosition?.y ?? 0,
  });

  // Read the latest isMinimized inside the long-lived drag listeners below
  // without adding it to their effect's deps (same pattern this repo
  // already uses for runLinterRef/isLintingRef in ContentApp.tsx).
  useEffect(() => {
    isMinimizedRef.current = isMinimized;
  }, [isMinimized]);

  // Apply the restored drag offset once, on mount only — a later prop
  // change must not fight the user's live drag position.
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.style.setProperty(
      '--kaggle-lint-drag-x',
      `${dragOffsetRef.current.x}px`
    );
    overlayRef.current.style.setProperty(
      '--kaggle-lint-drag-y',
      `${dragOffsetRef.current.y}px`
    );
  }, []);

  const stats = calculateStats(errors);

  /**
   * Dragging: ref-based, no re-render per mousemove. Writes the offset
   * straight to `--kaggle-lint-drag-x`/`-y`, consumed by the root's
   * `transform: translate(...)` in Overlay.css.
   */
  useEffect(() => {
    if (!overlayRef.current || !headerRef.current) return;

    const overlay = overlayRef.current;
    const header = headerRef.current;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      baseX = dragOffsetRef.current.x;
      baseY = dragOffsetRef.current.y;
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const x = baseX + (e.clientX - startX);
      const y = baseY + (e.clientY - startY);
      dragOffsetRef.current = { x, y };
      overlay.style.setProperty('--kaggle-lint-drag-x', `${x}px`);
      overlay.style.setProperty('--kaggle-lint-drag-y', `${y}px`);
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      onStateChange?.({
        position: dragOffsetRef.current,
        isMinimized: isMinimizedRef.current,
      });
    };

    header.style.cursor = 'move';
    header.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      header.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  /**
   * Toggle minimize state. All geometry/opacity/transition for the
   * minimized "pill" shape lives in Overlay.css, driven by the
   * `kaggle-lint-minimized` class — no direct style writes here beyond
   * resetting the drag offset so the pill docks bottom-right, matching the
   * pre-rewrite UX.
   */
  const handleToggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      if (next && overlayRef.current) {
        dragOffsetRef.current = { x: 0, y: 0 };
        overlayRef.current.style.setProperty('--kaggle-lint-drag-x', '0px');
        overlayRef.current.style.setProperty('--kaggle-lint-drag-y', '0px');
      }
      onStateChange?.({ position: dragOffsetRef.current, isMinimized: next });
      return next;
    });
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      await new Promise((resolve) => setTimeout(resolve, 200)); // Small delay for UX
      setIsRefreshing(false);
    }
  };

  /**
   * Handle error click. Scrolling is the app's responsibility (F33,
   * Milestone 7) — ContentApp's onErrorClick drives the MAIN-world bridge
   * scroll with its own DOM fallback; Overlay never scrolls on its own.
   */
  const handleErrorClick = (error: LintUIError) => {
    onErrorClick?.(error);
  };

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme} ${isMinimized ? 'kaggle-lint-minimized' : ''
        } ${stats.bySeverity.error > 0
          ? 'kaggle-lint-worst-error'
          : stats.bySeverity.warning > 0
            ? 'kaggle-lint-worst-warning'
            : ''
        }`}
    >
      <div ref={headerRef} className="kaggle-lint-header">
        <span className="kaggle-lint-title">
          <img
            src={chrome?.runtime?.getURL?.('icons/icon48.png') || ''}
            alt="Kaggle Linter"
            className="kaggle-lint-title-icon"
            onError={(e) => {
              // Hide image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="kaggle-lint-title-text">Kaggle Linter</span>
        </span>

        <div className="kaggle-lint-controls">
          <button
            className={`kaggle-lint-btn kaggle-lint-btn-icon ${isRefreshing || isLoading ? 'kaggle-lint-spinning' : ''
              }`}
            title="Refresh lint"
            id="kaggle-lint-refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            {refreshIcon}
          </button>

          <button
            className="kaggle-lint-btn kaggle-lint-btn-icon kaggle-lint-btn-toggle"
            title={isMinimized ? 'Expand' : 'Minimize'}
            onClick={handleToggleMinimize}
          >
            {chevronIcon}
          </button>

          <button
            className="kaggle-lint-btn kaggle-lint-btn-close"
            title="Close"
            onClick={onClose}
          >
            {XIcon}
          </button>
        </div>
      </div>

      <div className="kaggle-lint-content" id="kaggle-lint-content">
        {engineStatus === 'loading' && (
          <div className="kaggle-lint-engine-status">
            Loading linter engine… first load can take up to 30 s
          </div>
        )}
        {engineStatus === 'failed' && (
          <div className="kaggle-lint-engine-status">
            Linter engine failed to load — check the offscreen document's
            console (chrome://extensions → this extension → inspect the "service
            worker" / "offscreen document" links) or try re-linting.
          </div>
        )}

        {stats.total === 0 ? (
          <div className="kaggle-lint-success">
            <SuccessIcon />
            No issues found!
          </div>
        ) : (
          <>
            <div className="kaggle-lint-tabs">
              {SEVERITY_TABS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  className={`kaggle-lint-tab kaggle-lint-tab-${key} ${activeSeverity === key ? 'kaggle-lint-tab-active' : ''
                    }`}
                  onClick={() => setActiveSeverity(key)}
                >
                  <Icon className="kaggle-lint-tab-icon" />
                  <span className="kaggle-lint-tab-count">
                    {stats.bySeverity[key]}
                  </span>
                </button>
              ))}
            </div>

            <ErrorList
              errors={errors.filter(
                (error) => error.severity === activeSeverity
              )}
              onErrorClick={handleErrorClick}
              onIgnoreCode={onIgnoreCode}
              emptyMessage={`No ${activeSeverity === 'info' ? 'info' : `${activeSeverity}s`
                }`}
            />
          </>
        )}
      </div>
    </div>
  );
};
