/**
 * Undefined Variables Rule
 * Detects usage of variables that haven't been defined
 * Supports cross-cell context sharing for Jupyter notebooks
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

export class UndefinedVariablesRule extends BaseRule {
  name = 'undefinedVariables';

  // Accumulated context from previous cells (for cross-cell variable tracking)
  private accumulatedContext = new Set<string>();

  private readonly PYTHON_BUILTINS = new Set([
    'abs',
    'all',
    'any',
    'ascii',
    'bin',
    'bool',
    'bytearray',
    'bytes',
    'callable',
    'chr',
    'classmethod',
    'compile',
    'complex',
    'delattr',
    'dict',
    'dir',
    'divmod',
    'enumerate',
    'eval',
    'exec',
    'filter',
    'float',
    'format',
    'frozenset',
    'getattr',
    'globals',
    'hasattr',
    'hash',
    'help',
    'hex',
    'id',
    'input',
    'int',
    'isinstance',
    'issubclass',
    'iter',
    'len',
    'list',
    'locals',
    'map',
    'max',
    'memoryview',
    'min',
    'next',
    'object',
    'oct',
    'open',
    'ord',
    'pow',
    'print',
    'property',
    'range',
    'repr',
    'reversed',
    'round',
    'set',
    'setattr',
    'slice',
    'sorted',
    'staticmethod',
    'str',
    'sum',
    'super',
    'tuple',
    'type',
    'vars',
    'zip',
    '__import__',
    '__name__',
    '__doc__',
    '__package__',
    '__loader__',
    '__spec__',
    '__annotations__',
    '__builtins__',
    '__file__',
    '__cached__',
    'True',
    'False',
    'None',
    'Ellipsis',
    'NotImplemented',
    'Exception',
    'BaseException',
    'ValueError',
    'TypeError',
    'KeyError',
    'IndexError',
    'AttributeError',
    'ImportError',
    'RuntimeError',
    'StopIteration',
    'GeneratorExit',
    'AssertionError',
    'ArithmeticError',
    'OverflowError',
    'ZeroDivisionError',
    'FloatingPointError',
    'OSError',
    'IOError',
    'FileNotFoundError',
    'PermissionError',
    'ConnectionError',
    'TimeoutError',
    'NameError',
    'UnboundLocalError',
    'SyntaxError',
    'IndentationError',
    'TabError',
    'SystemError',
    'RecursionError',
    'MemoryError',
    'Warning',
    'UserWarning',
    'DeprecationWarning',
    'PendingDeprecationWarning',
    'RuntimeWarning',
    'SyntaxWarning',
    'ResourceWarning',
    'FutureWarning',
    'ImportWarning',
    'UnicodeWarning',
    'BytesWarning',
    'EncodingWarning',
  ]);

  private readonly COMMON_LIBRARIES = new Set([
    'pd',
    'np',
    'plt',
    'sns',
    'tf',
    'torch',
    'sklearn',
    'scipy',
    'cv2',
    'PIL',
    'os',
    'sys',
    're',
    'json',
    'csv',
    'math',
    'random',
    'datetime',
    'time',
    'collections',
    'itertools',
    'functools',
    'pathlib',
    'glob',
    'shutil',
    'pickle',
    'warnings',
    'logging',
    'tqdm',
    'requests',
    'bs4',
    'selenium',
    'keras',
    'xgboost',
    'lightgbm',
    'catboost',
    'gc',
    'copy',
    'io',
    'struct',
    'typing',
    'subprocess',
    'threading',
    'multiprocessing',
    'queue',
    'asyncio',
  ]);

  /**
   * Checks if a cell should be skipped entirely (magic commands like %%capture)
   * @param code - Python source code
   * @returns boolean
   */
  private shouldSkipCell(code: string): boolean {
    const lines = code.split('\n');
    // Check if the first non-empty line is a Jupyter magic command
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      // Skip cells starting with %%capture or other cell magic commands
      if (trimmed.startsWith('%%')) {
        return true;
      }
      break;
    }
    return false;
  }

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
   * Removes all string literals from code while preserving line structure
   * This handles multi-line strings (triple quotes) and f-strings properly
   * @param code - Python source code
   * @returns Code with strings replaced by placeholders
   */
  private removeAllStrings(code: string): string {
    let result = code;

    // Remove triple-quoted strings (multi-line) first - both """ and '''
    // Match optional f/r/b prefix (can be combined like fr, rf, br), triple quotes, content, triple quotes
    result = result.replace(/[fFrRbBuU]{0,2}"""[\s\S]*?"""/g, (match) => {
      // Replace with empty string but preserve newlines for line numbers
      const newlines = (match.match(/\n/g) || []).length;
      return '""' + '\n'.repeat(newlines);
    });

    result = result.replace(/[fFrRbBuU]{0,2}'''[\s\S]*?'''/g, (match) => {
      const newlines = (match.match(/\n/g) || []).length;
      return "''" + '\n'.repeat(newlines);
    });

    // Remove single-line strings (both single and double quotes)
    // This handles f-strings, r-strings, and combinations (fr, rf, br, etc.)
    result = result.replace(
      /[fFrRbBuU]{0,2}(["'])(?:\\.|(?!\1)[^\\\n])*\1/g,
      '""'
    );

    return result;
  }

  /**
   * Extracts all defined names from Python code
   * @param code - Python source code
   * @returns Set of defined names
   */
  private extractDefinedNames(code: string): Set<string> {
    const defined = new Set<string>();

    // Remove strings first to avoid false positives
    const cleanedCode = this.removeAllStrings(code);
    const lines = cleanedCode.split('\n');

    lines.forEach((line) => {
      // Skip shell commands and magic commands
      if (this.isShellCommand(line) || this.isMagicCommand(line)) {
        return;
      }

      let match;

      match = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/.exec(line);
      if (match) {
        defined.add(match[1]);
        const params = match[2].split(',');
        params.forEach((param) => {
          const paramName = param.split('=')[0].split(':')[0].trim();
          if (paramName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
            if (paramName !== 'self' && paramName !== 'cls') {
              defined.add(paramName);
            }
          }
        });
      }

      match = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(line);
      if (match) {
        defined.add(match[1]);
      }

      match =
        /^\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s*=(?!=)/.exec(
          line
        );
      if (match && !/^\s*(if|while|for|with|except|elif)/.test(line)) {
        const names = match[1].split(',').map((n) => n.trim());
        names.forEach((name) => {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            defined.add(name);
          }
        });
      }

      match =
        /^\s*for\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s+in\s+/.exec(
          line
        );
      if (match) {
        const names = match[1].split(',').map((n) => n.trim());
        names.forEach((name) => {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            defined.add(name);
          }
        });
      }

      match = /^\s*with\s+.+\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(line);
      if (match) {
        defined.add(match[1]);
      }

      match = /^\s*except\s+\w+\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(line);
      if (match) {
        defined.add(match[1]);
      }

      match =
        /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?/.exec(
          line
        );
      if (match) {
        defined.add(match[2] || match[1].split('.')[0]);
      }

      match = /^\s*from\s+\S+\s+import\s+(.+)/.exec(line);
      if (match) {
        const imports = match[1].split(',');
        imports.forEach((imp) => {
          const asMatch = /(\S+)\s+as\s+(\S+)/.exec(imp.trim());
          if (asMatch) {
            defined.add(asMatch[2]);
          } else {
            const name = imp.trim().split(' ')[0];
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name !== '*') {
              defined.add(name);
            }
          }
        });
      }

      const lambdaMatch = /lambda\s+([^:]+):/.exec(line);
      if (lambdaMatch) {
        const params = lambdaMatch[1].split(',');
        params.forEach((param) => {
          const paramName = param.split('=')[0].trim();
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
            defined.add(paramName);
          }
        });
      }

      const listCompMatch =
        /\[.+\s+for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+/.exec(line);
      if (listCompMatch) {
        defined.add(listCompMatch[1]);
      }
    });

    return defined;
  }

  /**
   * Extracts used variable names from Python code
   * @param code - Python source code
   * @returns Array of used names with line numbers
   */
  private extractUsedNames(
    code: string
  ): Array<{ name: string; line: number }> {
    const used: Array<{ name: string; line: number }> = [];

    // Remove all strings first (including multi-line strings and f-strings)
    const cleanedCode = this.removeAllStrings(code);
    const lines = cleanedCode.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip comments
      if (/^\s*#/.test(line)) {
        return;
      }

      // Skip shell commands (!)
      if (this.isShellCommand(line)) {
        return;
      }

      // Skip magic commands (% or %%)
      if (this.isMagicCommand(line)) {
        return;
      }

      // Skip import statements entirely (they don't use variables, they define them)
      if (/^\s*(import|from)\s+/.test(line)) {
        return;
      }

      // Remove comments from the line
      let processedLine = line.replace(/#.*$/, '');

      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let match;

      while ((match = identifierPattern.exec(processedLine)) !== null) {
        const name = match[1];
        const beforeChar = processedLine[match.index - 1];

        // Skip attributes (preceded by '.')
        if (beforeChar === '.') {
          continue;
        }

        // Skip keyword arguments (name followed by '=' without '==' in function call context)
        const afterMatch = processedLine.substring(match.index + name.length);
        if (/^\s*=(?!=)/.test(afterMatch)) {
          // Check if we're in a function call context (has open paren before)
          const beforePart = processedLine.substring(0, match.index);
          const openParens = (beforePart.match(/\(/g) || []).length;
          const closeParens = (beforePart.match(/\)/g) || []).length;
          if (openParens > closeParens) {
            // We're inside parentheses, this is likely a keyword argument
            continue;
          }
        }

        const keywords = new Set([
          'and',
          'as',
          'assert',
          'async',
          'await',
          'break',
          'class',
          'continue',
          'def',
          'del',
          'elif',
          'else',
          'except',
          'finally',
          'for',
          'from',
          'global',
          'if',
          'import',
          'in',
          'is',
          'lambda',
          'nonlocal',
          'not',
          'or',
          'pass',
          'raise',
          'return',
          'try',
          'while',
          'with',
          'yield',
        ]);

        if (!keywords.has(name)) {
          used.push({ name, line: lineIndex + 1 });
        }
      }
    });

    return used;
  }

  /**
   * Runs the undefined variables rule
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Additional context from previous cells
   * @returns Array of lint errors
   */
  run(
    code: string,
    cellOffset: number = 0,
    context?: LintContext
  ): LintError[] {
    const errors: LintError[] = [];

    // Skip cells that start with magic commands like %%capture
    if (this.shouldSkipCell(code)) {
      // Still extract defined names to pass to next cells
      // Note: In the new architecture, context should be managed by LintEngine
      // This is just preserving the logic structure
      return [];
    }

    const defined = this.extractDefinedNames(code);
    const used = this.extractUsedNames(code);

    // Get context from previous cells if available
    const previousContext = context?.definedNames || new Set<string>();

    // Add implicit names that are always available in class methods
    const implicitNames = new Set(['self', 'cls']);

    const allKnown = new Set([
      ...this.PYTHON_BUILTINS,
      ...this.COMMON_LIBRARIES,
      ...defined,
      ...previousContext,
      ...implicitNames,
    ]);

    const reported = new Set<string>();

    used.forEach(({ name, line }) => {
      const key = `${name}:${line}`;
      if (!allKnown.has(name) && !reported.has(key)) {
        errors.push({
          line: line + cellOffset,
          msg: `Undefined variable '${name}'`,
          severity: 'error',
          rule: this.name,
        });
        reported.add(key);
      }
    });

    return errors;
  }

  /**
   * Reset accumulated context (call at start of notebook linting)
   */
  resetContext(): void {
    this.accumulatedContext = new Set();
  }

  /**
   * Get current accumulated context
   * @returns Set of defined names
   */
  getAccumulatedContext(): Set<string> {
    return new Set(this.accumulatedContext);
  }

  /**
   * Add names to accumulated context
   * @param names - Names to add
   */
  addToContext(names: Set<string>): void {
    names.forEach((name) => this.accumulatedContext.add(name));
  }

  // Expose helper methods for testing
  public extractDefinedNamesPublic(code: string): Set<string> {
    return this.extractDefinedNames(code);
  }

  public extractUsedNamesPublic(
    code: string
  ): Array<{ name: string; line: number }> {
    return this.extractUsedNames(code);
  }

  public shouldSkipCellPublic(code: string): boolean {
    return this.shouldSkipCell(code);
  }

  public removeAllStringsPublic(code: string): string {
    return this.removeAllStrings(code);
  }
}
