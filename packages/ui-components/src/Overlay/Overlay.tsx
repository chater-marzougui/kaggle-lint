/**
 * Overlay Component
 * Main overlay UI for displaying lint results
 *
 * MIGRATION NOTE: Logic copied verbatim from old-linter/src/ui/overlay.js
 * Only converted to React component format with TypeScript
 * ALL DOM manipulation, dragging, and UI logic preserved exactly
 */

import React, { useState, useEffect, useRef } from 'react';
import { OverlayProps, ErrorStats } from '../types';
import { ErrorList } from '../ErrorList';
import './Overlay.css';

const SEVERITY_ICONS = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

/**
 * Calculate error statistics
 * EXACT LOGIC from old-linter displayErrors function
 */
function calculateStats(errors: OverlayProps['errors']): ErrorStats {
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

/**
 * Scrolls to the cell containing an error
 * EXACT COPY from old-linter/src/ui/overlay.js scrollToError function
 */
function scrollToError(error: OverlayProps['errors'][0]): void {
  if (error.element) {
    error.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightCell(error.element);
  }
}

/**
 * Temporarily highlights a cell
 * EXACT COPY from old-linter/src/ui/overlay.js highlightCell function
 */
function highlightCell(element: Element): void {
  element.classList.add('kaggle-lint-highlight');
  setTimeout(() => {
    element.classList.remove('kaggle-lint-highlight');
  }, 2000);
}

export const Overlay: React.FC<OverlayProps> = ({
  errors,
  onErrorClick,
  onRefresh,
  visible = true,
  theme = 'light',
  codeCells: _codeCells = [], // Prefixed with underscore to indicate intentionally unused
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const stats = calculateStats(errors);

  /**
   * Makes overlay draggable
   * EXACT LOGIC from old-linter/src/ui/overlay.js makeDraggable function
   */
  useEffect(() => {
    if (!overlayRef.current || !headerRef.current) return;

    const overlay = overlayRef.current;
    const header = headerRef.current;
    let isDragging = false;
    let startX: number, startY: number, startLeft: number, startTop: number;

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = overlay.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      overlay.style.left = startLeft + deltaX + 'px';
      overlay.style.top = startTop + deltaY + 'px';
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
    };

    const handleMouseUp = () => {
      isDragging = false;
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
   * Toggle minimize state
   * EXACT LOGIC from old-linter/src/ui/overlay.js toggleMinimize function
   */
  const handleToggleMinimize = () => {
    if (!overlayRef.current) return;

    const overlay = overlayRef.current;
    const titleText = overlay.querySelector(
      '.kaggle-lint-title-text'
    ) as HTMLElement;

    if (isMinimized) {
      // Expanding
      overlay.classList.remove('kaggle-lint-minimized');
      overlay.style.width = '450px';
      if (titleText) {
        titleText.style.opacity = '0';
        setTimeout(() => {
          titleText.style.display = 'inline';
          setTimeout(() => {
            titleText.style.opacity = '1';
          }, 10);
          overlay.style.bottom = '20px';
          overlay.style.right = '20px';
        }, 150);
      }
    } else {
      // Minimizing
      overlay.classList.add('kaggle-lint-minimized');
      if (titleText) {
        titleText.style.opacity = '0';
        // Move to bottom right
        overlay.style.right = '20px';
        overlay.style.bottom = '20px';
        overlay.style.left = 'auto';
        overlay.style.top = 'auto';
        overlay.style.width = '200px';
        setTimeout(() => {
          titleText.style.display = 'none';
        }, 200);
      }
    }

    setIsMinimized(!isMinimized);
  };

  /**
   * Handle refresh button click
   * EXACT LOGIC from old-linter/src/ui/overlay.js refreshBtn.onclick
   */
  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      await new Promise((resolve) => setTimeout(resolve, 200)); // Small delay for UX
      setIsRefreshing(false);
    }
  };

  /**
   * Handle error click
   * EXACT LOGIC from old-linter/src/ui/overlay.js error item click handling
   */
  const handleErrorClick = (error: OverlayProps['errors'][0]) => {
    scrollToError(error);
    if (onErrorClick) {
      onErrorClick(error);
    }
  };

  if (!visible) {
    return null;
  }

  // SVG icons (will be loaded from chrome extension in actual use)
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
      className={`kaggle-lint-overlay kaggle-lint-theme-${theme}`}
      style={{ display: visible ? 'block' : 'none' }}
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
              isRefreshing ? 'kaggle-lint-spinning' : ''
            }`}
            title="Refresh lint"
            id="kaggle-lint-refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {refreshIcon}
          </button>

          <button
            className="kaggle-lint-btn kaggle-lint-btn-icon"
            title={isMinimized ? 'Expand' : 'Minimize'}
            onClick={handleToggleMinimize}
            style={{
              transform: isMinimized ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease',
            }}
          >
            {chevronIcon}
          </button>

          <button
            className="kaggle-lint-btn kaggle-lint-btn-close"
            title="Close"
            onClick={() => {
              if (overlayRef.current) {
                overlayRef.current.style.display = 'none';
              }
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="kaggle-lint-content" id="kaggle-lint-content">
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

        <ErrorList errors={errors} onErrorClick={handleErrorClick} />
      </div>
    </div>
  );
};
