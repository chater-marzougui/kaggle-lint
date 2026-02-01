/**
 * Flake8 Linter Engine using Pyodide
 * Provides Python linting using Flake8 running in WebAssembly via Pyodide
 * WITH NOTEBOOK CONTEXT TRACKING
 * 
 * Migrated from old-linter/src/flake8Engine.js to TypeScript
 */

import { LintError } from '../types';

// Type declaration for Pyodide
declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
  }
}

interface PyodideInterface {
  loadPackage(name: string): Promise<void>;
  runPythonAsync(code: string): Promise<string>;
}

interface NotebookCell {
  code: string;
  element?: any;
  cellIndex: number;
}

interface NotebookError extends LintError {
  cellIndex: number;
  element?: any;
  cellLine: number;
}

interface ErrorStats {
  total: number;
  byRule: Record<string, number>;
  bySeverity: { error: number; warning: number; info: number };
}

export class Flake8Engine {
  private pyodide: PyodideInterface | null = null;
  private isLoading = false;
  private _isReady = false;
  private loadPromise: Promise<void> | null = null;
  private readonly pyodidePath = 'pyodide/';

  /**
   * Load Pyodide and install Flake8
   */
  async load(): Promise<void> {
    if (this._isReady) {
      return;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        console.log('[Flake8Engine] Loading Pyodide...');

        // Get the correct extension URL for pyodide files
        let pyodideIndexURL: string;
        if (
          typeof chrome !== 'undefined' &&
          chrome.runtime &&
          chrome.runtime.getURL
        ) {
          pyodideIndexURL = chrome.runtime.getURL(this.pyodidePath);
          console.log(
            '[Flake8Engine] Using local Pyodide from:',
            pyodideIndexURL
          );
        } else {
          pyodideIndexURL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';
          console.log('[Flake8Engine] Using CDN Pyodide:', pyodideIndexURL);
        }

        // Load Pyodide script
        if (!window.loadPyodide) {
          await this.loadPyodideScript(pyodideIndexURL);
        }

        // Initialize Pyodide
        this.pyodide = await window.loadPyodide!({
          indexURL: pyodideIndexURL,
        });

        console.log('[Flake8Engine] Pyodide loaded, installing micropip...');
        await this.pyodide!.loadPackage('micropip');

        console.log('[Flake8Engine] Installing Flake8...');
        await this.pyodide!.runPythonAsync(`
import micropip
await micropip.install('flake8')
        `);

        // Set up the notebook-aware linting function
        await this.pyodide!.runPythonAsync(`
import sys
import ast
from io import StringIO

def extract_imports_and_names(code):
    """
    Extract all imported names and defined names from code.
    Returns: (imports_set, defined_names_set)
    """
    imports = set()
    defined = set()
    
    try:
        tree = ast.parse(code)
        
        for node in ast.walk(tree):
            # Track imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname if alias.asname else alias.name
                    imports.add(name.split('.')[0])
            
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    if alias.name == '*':
                        # Can't track * imports precisely
                        continue
                    name = alias.asname if alias.asname else alias.name
                    imports.add(name)
            
            # Track assignments
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined.add(target.id)
                    elif isinstance(target, ast.Tuple) or isinstance(target, ast.List):
                        for elt in target.elts:
                            if isinstance(elt, ast.Name):
                                defined.add(elt.id)
            
            elif isinstance(node, ast.AnnAssign):
                if isinstance(node.target, ast.Name):
                    defined.add(node.target.id)
            
            # Track function definitions
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                defined.add(node.name)
            
            # Track class definitions
            elif isinstance(node, ast.ClassDef):
                defined.add(node.name)
                
    except SyntaxError:
        pass
    
    return imports, defined

def lint_code_with_context(code, known_names=None):
    """
    Lint Python code with awareness of previously defined names.
    known_names: set of variable/function/class names defined in previous cells
    """
    import ast
    results = []
    
    if known_names is None:
        known_names = set()
    
    # Check for syntax errors first
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        results.append({
            'line': e.lineno or 1,
            'column': e.offset or 0,
            'code': 'E999',
            'msg': f"SyntaxError: {e.msg}",
            'severity': 'error'
        })
        return results, set()
    
    # Extract what this cell defines
    imports, defined = extract_imports_and_names(code)
    new_names = imports | defined
    
    # Use pyflakes for undefined name checking
    try:
        from pyflakes import api as pyflakes_api
        from pyflakes import checker
        
        class ContextAwareChecker(checker.Checker):
            """Custom checker that knows about notebook context."""
            
            def __init__(self, tree, filename='<input>', known_context=None):
                super().__init__(tree, filename)
                self.known_context = known_context or set()
            
            def report(self, messageClass, *args, **kwargs):
                # Filter out undefined name errors for known context
                if messageClass.__name__ == 'UndefinedName':
                    if args and args[1] in self.known_context:
                        return  # Skip this error
                super().report(messageClass, *args, **kwargs)
        
        class CollectingReporter:
            def __init__(self):
                self.messages = []
            
            def unexpectedError(self, filename, msg):
                pass
            
            def syntaxError(self, filename, msg, lineno, offset, text):
                self.messages.append({
                    'line': lineno or 1,
                    'column': offset or 0,
                    'code': 'E999',
                    'msg': msg,
                    'severity': 'error'
                })
            
            def flake(self, message):
                code = message.__class__.__name__
                
                # Skip undefined name errors for known context
                if code == 'UndefinedName':
                    # Extract the undefined name
                    msg_str = str(message)
                    if "'" in msg_str:
                        name = msg_str.split("'")[1]
                        if name in known_names:
                            return  # Skip - it's defined in a previous cell
                
                severity = 'warning'
                if 'Undefined' in code or 'Import' in code:
                    severity = 'error'
                
                msg_text = str(message).split(':', 1)[-1].strip()
                
                self.messages.append({
                    'line': message.lineno,
                    'column': getattr(message, 'col', 0),
                    'code': code,
                    'msg': msg_text,
                    'severity': severity
                })
        
        reporter = CollectingReporter()
        
        # Create a context-aware checker
        w = ContextAwareChecker(tree, '<input>', known_names)
        
        # Collect messages
        for message in w.messages:
            reporter.flake(message)
        
        results.extend(reporter.messages)
        
    except ImportError:
        pass
    except Exception as e:
        print(f"Linting error: {e}")
    
    return results, new_names

# Store for global context
_notebook_context = set()

def reset_notebook_context():
    """Reset the global notebook context."""
    global _notebook_context
    _notebook_context = set()

def get_notebook_context():
    """Get current notebook context."""
    return _notebook_context.copy()

def update_notebook_context(new_names):
    """Update notebook context with new names."""
    global _notebook_context
    _notebook_context.update(new_names)

def lint_cell_with_notebook_context(code):
    """
    Lint a single cell with full notebook context.
    Automatically updates context with names defined in this cell.
    """
    results, new_names = lint_code_with_context(code, _notebook_context)
    update_notebook_context(new_names)
    return results
        `);

        this._isReady = true;
        this.isLoading = false;
        console.log(
          '[Flake8Engine] Flake8 ready with notebook context support!'
        );
      } catch (error) {
        this.isLoading = false;
        this._isReady = false;
        console.error('[Flake8Engine] Failed to load:', error);
        throw error;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Load the Pyodide script dynamically
   */
  private loadPyodideScript(indexURL: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.loadPyodide) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = indexURL + 'pyodide.js';
      script.onload = () => {
        console.log('[Flake8Engine] Pyodide script loaded');
        resolve();
      };
      script.onerror = (error) => {
        console.error('[Flake8Engine] Failed to load Pyodide script:', error);
        reject(new Error('Failed to load Pyodide script'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Checks if the engine is ready
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Checks if the engine is loading
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Initializes the Flake8 engine (loads Pyodide)
   */
  async initialize(): Promise<void> {
    return this.load();
  }

  /**
   * Lint a single cell's code
   */
  async lintCell(
    code: string,
    cellOffset: number = 0,
    _cellIndex: number = 0
  ): Promise<LintError[]> {
    if (!this._isReady) {
      await this.load();
    }

    if (!code || code.trim().length === 0) {
      return [];
    }

    if (code.trim().startsWith('%%') || code.trim().startsWith('!')) {
      return [];
    }

    try {
      const results = await this.pyodide!.runPythonAsync(`
import json
results = lint_cell_with_notebook_context(${JSON.stringify(code)})
json.dumps(results)
      `);

      const errors = JSON.parse(results);

      const adjustedErrors: LintError[] = errors.map((error: any) => ({
        ...error,
        line: error.line + cellOffset,
        rule: 'flake8',
      }));

      return adjustedErrors;
    } catch (error) {
      console.error('[Flake8Engine] Linting error:', error);
      return [];
    }
  }

  /**
   * Runs Flake8 linting on Python code (single cell)
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @returns Array of lint errors
   */
  async lint(code: string, cellOffset: number = 0): Promise<LintError[]> {
    return this.lintCell(code, cellOffset, 0);
  }

  /**
   * Lint multiple cells (notebook) with full context tracking
   */
  async lintNotebook(cells: NotebookCell[]): Promise<NotebookError[]> {
    if (!this._isReady) {
      await this.load();
    }

    // Reset context before linting entire notebook
    await this.pyodide!.runPythonAsync(`reset_notebook_context()`);

    const allErrors: NotebookError[] = [];
    let lineOffset = 0;

    for (const cell of cells) {
      const errors = await this.lintCell(cell.code, lineOffset, cell.cellIndex);

      errors.forEach((error) => {
        allErrors.push({
          ...error,
          cellIndex: cell.cellIndex,
          element: cell.element,
          cellLine: error.line - lineOffset,
        });
      });

      lineOffset += cell.code.split('\n').length;
    }

    return allErrors;
  }

  /**
   * Get error statistics
   */
  getStats(errors: LintError[]): ErrorStats {
    const stats: ErrorStats = {
      total: errors.length,
      byRule: {},
      bySeverity: { error: 0, warning: 0, info: 0 },
    };

    errors.forEach((error) => {
      stats.bySeverity[error.severity] =
        (stats.bySeverity[error.severity] || 0) + 1;
      const rule = error.code || 'flake8';
      stats.byRule[rule] = (stats.byRule[rule] || 0) + 1;
    });

    return stats;
  }
}
