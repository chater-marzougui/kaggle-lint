/**
 * Missing Return Rule
 * Detects functions that appear to be non-void but don't have a return statement
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  body: string;
  hasReturn?: boolean;
  params: string;
  indent: number;
  bodyIndent: number | null;
  decorators: string[];
}

export class MissingReturnRule extends BaseRule {
  name = 'missingReturn';

  /**
   * Checks if a line contains a decorator
   * @param line - Line of code
   * @returns Decorator name or null
   */
  private extractDecorator(line: string): string | null {
    const decoratorMatch = /^(\s*)@([a-zA-Z_][a-zA-Z0-9_.]*)\s*/.exec(line);
    return decoratorMatch ? decoratorMatch[2] : null;
  }

  /**
   * Extracts function definitions with their bodies
   * @param code - Python source code
   * @returns Array of function information
   */
  private extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');
    let currentFunc: FunctionInfo | null = null;
    let pendingDecorators: string[] = [];

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      // Check for decorators
      const decorator = this.extractDecorator(line);
      if (decorator && !currentFunc) {
        pendingDecorators.push(decorator);
        return;
      }

      const funcMatch =
        /^(\s*)def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/.exec(line);
      if (funcMatch) {
        if (currentFunc !== null) {
          currentFunc.endLine = lineNum - 1;
          currentFunc.hasReturn = this.checkHasReturn(currentFunc.body);
          functions.push(currentFunc);
        }

        currentFunc = {
          name: funcMatch[2],
          startLine: lineNum,
          endLine: lineNum,
          body: '',
          params: funcMatch[3],
          indent: funcMatch[1].length,
          bodyIndent: null,
          decorators: [...pendingDecorators],
        };
        pendingDecorators = [];
        return;
      }

      if (currentFunc) {
        const lineIndentMatch = line.match(/^(\s*)/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[1].length : 0;
        const trimmed = line.trim();

        if (trimmed === '') {
          currentFunc.body += line + '\n';
          return;
        }

        if (
          currentFunc.bodyIndent === null &&
          lineIndent > currentFunc.indent
        ) {
          currentFunc.bodyIndent = lineIndent;
        }

        if (
          currentFunc.bodyIndent !== null &&
          lineIndent >= currentFunc.bodyIndent
        ) {
          currentFunc.body += line + '\n';
          currentFunc.endLine = lineNum;
        } else if (lineIndent <= currentFunc.indent && trimmed !== '') {
          currentFunc.hasReturn = this.checkHasReturn(currentFunc.body);
          functions.push(currentFunc);
          currentFunc = null;
          // Don't reset pendingDecorators here - they might be for the next function
          // Check if this line is a decorator for the next function
          const nextDecorator = this.extractDecorator(line);
          if (nextDecorator) {
            pendingDecorators.push(nextDecorator);
          }
        }
      }
    });

    if (currentFunc !== null) {
      const func = currentFunc as FunctionInfo;
      func.hasReturn = this.checkHasReturn(func.body);
      functions.push(func);
    }

    return functions;
  }

  /**
   * Checks if function body has a return statement
   * @param body - Function body
   * @returns boolean
   */
  private checkHasReturn(body: string): boolean {
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        continue;
      }
      if (/^\s*return\s/.test(line) || /^\s*return$/.test(line)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if function appears to compute a value (non-void intent)
   * @param func - Function object
   * @returns boolean
   */
  private looksNonVoid(func: FunctionInfo): boolean {
    const body = func.body;

    const computationPatterns = [
      /result\s*=/,
      /total\s*=/,
      /sum\s*=/,
      /count\s*=/,
      /output\s*=/,
      /value\s*=/,
      /answer\s*=/,
      /res\s*=/,
      /ret\s*=/,
      /data\s*=/,
      /\+=|\-=|\*=|\/=/,
    ];

    for (const pattern of computationPatterns) {
      if (pattern.test(body)) {
        return true;
      }
    }

    const funcNamePatterns = [
      /^get_/,
      /^calculate_/,
      /^compute_/,
      /^find_/,
      /^create_/,
      /^build_/,
      /^make_/,
      /^generate_/,
      /^parse_/,
      /^convert_/,
      /^transform_/,
      /^extract_/,
      /^fetch_/,
      /^load_/,
      /^read_/,
    ];

    for (const pattern of funcNamePatterns) {
      if (pattern.test(func.name)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if function is a property setter (has @*.setter decorator)
   * Property setters in Python are in the form @property_name.setter
   * @param decorators - Function decorators
   * @returns boolean
   */
  private isPropertySetter(decorators: string[]): boolean {
    if (!decorators || decorators.length === 0) {
      return false;
    }
    // Only match decorators that end with .setter (e.g., @value.setter)
    return decorators.some((dec) => dec.endsWith('.setter'));
  }

  /**
   * Checks if function is a special method that doesn't need return
   * @param name - Function name
   * @param decorators - Function decorators
   * @returns boolean
   */
  private isSpecialMethod(name: string, decorators: string[] = []): boolean {
    const specialMethods = new Set([
      '__init__',
      '__del__',
      '__setattr__',
      '__delattr__',
      '__setitem__',
      '__delitem__',
      '__enter__',
      '__exit__',
      'setUp',
      'tearDown',
      'setUpClass',
      'tearDownClass',
      'setup',
      'teardown',
      'main',
    ]);
    return specialMethods.has(name) || this.isPropertySetter(decorators);
  }

  /**
   * Runs the missing return rule
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
    const functions = this.extractFunctions(code);

    functions.forEach((func) => {
      if (this.isSpecialMethod(func.name, func.decorators)) {
        return;
      }

      if (!func.hasReturn && this.looksNonVoid(func)) {
        errors.push({
          line: func.startLine + cellOffset,
          msg: `Function '${func.name}' appears to compute a value but has no return statement`,
          severity: 'warning',
          rule: this.name,
        });
      }
    });

    return errors;
  }
}
