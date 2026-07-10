/**
 * Overlay Component
 * Main overlay UI for displaying lint results. Minimize/expand state and
 * geometry are driven by React state + CSS classes (F11) — dragging is the
 * one place this component still writes to the DOM directly, and it does
 * so via a ref-held offset written to CSS custom properties, not React
 * state, so a drag doesn't re-render the panel on every mousemove.
 */

import React, { useState, useEffect, useRef } from 'react';
import { OverlayProps, ErrorStats, LintUIError } from '../types';
import { ErrorList } from '../ErrorList';
import './Overlay.css';

const SEVERITY_ICONS = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const chevronIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );

  const refreshIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );

  return (
    <div
      ref={overlayRef}
      id="kaggle-lint-overlay"
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme} ${
        isMinimized ? 'kaggle-lint-minimized' : ''
      } ${
        stats.bySeverity.error > 0
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
          <span className="kaggle-lint-title-text">Python Linter</span>
        </span>

        <div className="kaggle-lint-controls">
          <button
            className={`kaggle-lint-btn kaggle-lint-btn-icon ${
              isRefreshing || isLoading ? 'kaggle-lint-spinning' : ''
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
            ✕
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

        <div className="kaggle-lint-summary">
          <span className="kaggle-lint-stat kaggle-lint-error">
            {SEVERITY_ICONS.error} {stats.bySeverity.error || 0}
          </span>
          <span className="kaggle-lint-stat kaggle-lint-warning">
            {SEVERITY_ICONS.warning} {stats.bySeverity.warning || 0}
          </span>
          <span className="kaggle-lint-stat kaggle-lint-info">
            {SEVERITY_ICONS.info} {stats.bySeverity.info || 0}
          </span>
        </div>

        <ErrorList
          errors={errors}
          onErrorClick={handleErrorClick}
          onIgnoreCode={onIgnoreCode}
        />
      </div>
    </div>
  );
};
