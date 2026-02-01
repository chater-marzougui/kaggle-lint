/**
 * Import Issues Rule
 * Detects problematic import patterns
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

export class ImportIssuesRule extends BaseRule {
  name = 'importIssues';

  /**
   * Checks if a line is a shell command (starts with !)
   * @param line - Line of code
   * @returns boolean
   */
  private isShellCommand(line: string): boolean {
    return /^\s*!/.test(line);
  }

  /**
   * Checks if a line is a Jupyter magic command (starts with % or %%)
   * @param line - Line of code
   * @returns boolean
   */
  private isMagicCommand(line: string): boolean {
    return /^\s*%%?[a-zA-Z]/.test(line);
  }

  /**
   * Runs the import issues rule
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Lint context (unused in this rule)
   * @returns Array of lint errors
   */
  run(
    code: string,
    cellOffset: number = 0,
    _context?: LintContext
  ): LintError[] {
    const errors: LintError[] = [];
    const lines = code.split('\n');
    const imports: Array<{ line: number; content: string }> = [];
    let firstNonImportLine = -1;
    let lastImportLine = -1;

    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();

      // Skip empty lines, comments, shell commands, and magic commands
      if (trimmedLine === '' || trimmedLine.startsWith('#')) {
        return;
      }
      if (this.isShellCommand(line) || this.isMagicCommand(line)) {
        return;
      }

      const isImport = /^(import\s+|from\s+\S+\s+import\s+)/.test(trimmedLine);

      if (isImport) {
        imports.push({ line: lineIndex + 1, content: trimmedLine });
        lastImportLine = lineIndex + 1;
      } else if (firstNonImportLine === -1 && !isImport) {
        firstNonImportLine = lineIndex + 1;
      }
    });

    if (firstNonImportLine !== -1 && lastImportLine > firstNonImportLine) {
      imports.forEach((imp) => {
        if (imp.line > firstNonImportLine) {
          errors.push({
            line: imp.line + cellOffset,
            msg: 'Import statement should be at the top of the file/cell',
            severity: 'info',
            rule: this.name,
          });
        }
      });
    }

    lines.forEach((line, lineIndex) => {
      // Skip shell commands and magic commands
      if (this.isShellCommand(line) || this.isMagicCommand(line)) {
        return;
      }
      if (/^\s*from\s+\S+\s+import\s+\*/.test(line)) {
        errors.push({
          line: lineIndex + 1 + cellOffset,
          msg: "Wildcard import 'from X import *' is discouraged",
          severity: 'warning',
          rule: this.name,
        });
      }
    });

    const importedNames = new Map<string, number>();

    lines.forEach((line, lineIndex) => {
      // Skip shell commands and magic commands
      if (this.isShellCommand(line) || this.isMagicCommand(line)) {
        return;
      }

      let match;

      match =
        /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?/.exec(
          line
        );
      if (match) {
        // Use alias if provided (match[2]), otherwise use the base module name from dotted import (match[1])
        // Examples: "import matplotlib.pyplot as plt" -> "plt", "import numpy" -> "numpy"
        const name = match[2] || match[1].split('.')[0];
        if (importedNames.has(name)) {
          errors.push({
            line: lineIndex + 1 + cellOffset,
            msg: `Duplicate import of '${name}' (first imported at line ${
              importedNames.get(name)! + cellOffset
            })`,
            severity: 'warning',
            rule: this.name,
          });
        } else {
          importedNames.set(name, lineIndex + 1);
        }
      }

      match = /^\s*from\s+\S+\s+import\s+(.+)/.exec(line);
      if (match && !match[1].trim().startsWith('*')) {
        const importList = match[1].replace(/\(|\)/g, '').split(',');
        importList.forEach((imp) => {
          const asMatch = /(\S+)\s+as\s+(\S+)/.exec(imp.trim());
          const name = asMatch ? asMatch[2] : imp.trim().split(' ')[0];

          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            if (importedNames.has(name)) {
              errors.push({
                line: lineIndex + 1 + cellOffset,
                msg: `Duplicate import of '${name}' (first imported at line ${
                  importedNames.get(name)! + cellOffset
                })`,
                severity: 'warning',
                rule: this.name,
              });
            } else {
              importedNames.set(name, lineIndex + 1);
            }
          }
        });
      }
    });

    const usedNames = new Set<string>();
    lines.forEach((line) => {
      // Skip shell commands and magic commands for usage detection
      if (this.isShellCommand(line) || this.isMagicCommand(line)) {
        return;
      }
      if (/^\s*(import|from)\s+/.test(line)) {
        return;
      }

      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let identMatch;
      while ((identMatch = identifierPattern.exec(line)) !== null) {
        usedNames.add(identMatch[1]);
      }
    });

    importedNames.forEach((line, name) => {
      if (!usedNames.has(name)) {
        errors.push({
          line: line + cellOffset,
          msg: `Imported '${name}' is unused`,
          severity: 'info',
          rule: this.name,
        });
      }
    });

    return errors;
  }
}
