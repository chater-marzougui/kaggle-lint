/**
 * UI Component Types
 * Re-export core types and add UI-specific types
 */

// Note: These types are duplicated from core to avoid circular dependency during build
export type Severity = 'error' | 'warning' | 'info';

export interface LintError {
  line: number;
  column?: number;
  msg: string;
  severity: Severity;
  rule?: string;
  cellIndex?: number;
}

export interface OverlayProps {
  errors: Array<{
    line: number;
    column?: number;
    msg: string;
    severity: 'error' | 'warning' | 'info';
    rule?: string;
    cellIndex?: number;
    cellLine?: number;
    element?: Element | null;
  }>;
  onErrorClick?: (error: any) => void;
  onRefresh?: () => Promise<void>;
  visible?: boolean;
  theme?: 'light' | 'dark';
  codeCells?: Array<{ element: Element | null; cellIndex: number }>;
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
  errors: OverlayProps['errors'];
  onErrorClick?: (error: any) => void;
}

export interface ErrorItemProps {
  error: OverlayProps['errors'][0];
  index: number;
  onClick?: () => void;
}
