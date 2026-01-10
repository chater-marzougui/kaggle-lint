import { LintError, LintContext, LintRule } from '../types';

/**
 * Base class for all lint rules
 * Provides common functionality and enforces interface
 */
export abstract class BaseRule implements LintRule {
  abstract name: string;
  
  abstract run(
    code: string,
    cellOffset: number,
    context?: LintContext
  ): LintError[];

  /**
   * Helper method to create a lint error
   */
  protected createError(
    line: number,
    msg: string,
    severity: 'error' | 'warning' | 'info',
    column?: number
  ): LintError {
    return { 
      line, 
      msg, 
      severity, 
      rule: this.name,
      column 
    };
  }
}
