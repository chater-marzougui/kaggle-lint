/**
 * Flake8 Linter Engine using Pyodide
 * Provides Python linting using Flake8 running in WebAssembly via Pyodide
 */

const Flake8Engine = (function () {
  "use strict";

  let pyodide = null;
  let isLoading = false;
  let isReady = false;
  let loadPromise = null;

  const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";

  /**
   * Load Pyodide and install Flake8
   * @returns {Promise<void>}
   */
  async function load() {
    if (isReady) {
      return;
    }

    if (isLoading && loadPromise) {
      return loadPromise;
    }

    isLoading = true;
    loadPromise = (async () => {
      try {
        console.log("[Flake8Engine] Loading Pyodide...");

        // Load Pyodide script dynamically
        if (typeof loadPyodide === "undefined") {
          await loadPyodideScript();
        }

        // Initialize Pyodide
        pyodide = await loadPyodide({
          indexURL: PYODIDE_CDN,
        });

        console.log("[Flake8Engine] Pyodide loaded, installing micropip...");

        // Load micropip for package installation
        await pyodide.loadPackage("micropip");

        console.log("[Flake8Engine] Installing Flake8...");

        // Install Flake8 using micropip
        await pyodide.runPythonAsync(`
import micropip
await micropip.install('flake8')
        `);

        // Set up the linting function in Python
        await pyodide.runPythonAsync(`
import sys
from io import StringIO
import flake8.api.legacy as flake8

def lint_code(code):
    """
    Lint Python code using Flake8 and return errors as a list of dicts.
    """
    import tempfile
    import os
    
    # Create a temporary file with the code
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(code)
        temp_path = f.name
    
    try:
        # Capture stdout/stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = StringIO()
        sys.stderr = StringIO()
        
        try:
            # Run Flake8 style guide
            style_guide = flake8.get_style_guide(
                max_line_length=120,
                ignore=['W503', 'E501'],  # Common ignores for notebooks
            )
            report = style_guide.check_files([temp_path])
            
            # Get results
            results = []
            if hasattr(report, '_application'):
                for checker in report._application.file_checker_manager.checkers:
                    for error in checker.results:
                        line_number, column, text, check = error
                        # Parse error code from text
                        parts = text.split(' ', 1)
                        code = parts[0] if parts else ''
                        msg = parts[1] if len(parts) > 1 else text
                        
                        # Determine severity based on error code
                        severity = 'error'
                        if code.startswith('W'):
                            severity = 'warning'
                        elif code.startswith('E1') or code.startswith('E2'):
                            severity = 'warning'
                        
                        results.append({
                            'line': line_number,
                            'column': column,
                            'code': code,
                            'msg': f"[{code}] {msg}",
                            'severity': severity
                        })
            
            return results
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr
    finally:
        # Clean up temp file
        try:
            os.unlink(temp_path)
        except:
            pass

def lint_code_simple(code):
    """
    Simple linting approach that doesn't rely on file-based checking.
    Uses pyflakes directly for AST-based analysis.
    """
    import ast
    results = []
    
    # Check for syntax errors first
    try:
        ast.parse(code)
    except SyntaxError as e:
        results.append({
            'line': e.lineno or 1,
            'column': e.offset or 0,
            'code': 'E999',
            'msg': f"[E999] SyntaxError: {e.msg}",
            'severity': 'error'
        })
        return results
    
    # Try pyflakes for undefined names, etc.
    try:
        from pyflakes import api as pyflakes_api
        from pyflakes import reporter as pyflakes_reporter
        
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
                    'msg': f"[E999] {msg}",
                    'severity': 'error'
                })
            
            def flake(self, message):
                # Get message code
                code = message.__class__.__name__
                severity = 'warning'
                if 'Undefined' in code or 'Import' in code:
                    severity = 'error'
                
                self.messages.append({
                    'line': message.lineno,
                    'column': getattr(message, 'col', 0),
                    'code': code,
                    'msg': f"[{code}] {str(message).split(':', 1)[-1].strip()}",
                    'severity': severity
                })
        
        reporter = CollectingReporter()
        pyflakes_api.check(code, '<input>', reporter)
        results.extend(reporter.messages)
    except ImportError:
        pass
    except Exception as e:
        pass
    
    return results
        `);

        isReady = true;
        isLoading = false;
        console.log("[Flake8Engine] Flake8 ready!");
      } catch (error) {
        isLoading = false;
        isReady = false;
        console.error("[Flake8Engine] Failed to load:", error);
        throw error;
      }
    })();

    return loadPromise;
  }

  /**
   * Load Pyodide script from CDN
   */
  async function loadPyodideScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PYODIDE_CDN + "pyodide.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load Pyodide"));
      document.head.appendChild(script);
    });
  }

  /**
   * Check if the engine is ready
   * @returns {boolean}
   */
  function getIsReady() {
    return isReady;
  }

  /**
   * Check if the engine is loading
   * @returns {boolean}
   */
  function getIsLoading() {
    return isLoading;
  }

  /**
   * Lint a single cell's code
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for global line numbers
   * @param {number} cellIndex - Cell index
   * @returns {Promise<{errors: Array, newContext: Set}>}
   */
  async function lintCell(code, cellOffset = 0, cellIndex = 0) {
    if (!isReady) {
      await load();
    }

    // Skip empty code
    if (!code || code.trim().length === 0) {
      return { errors: [], newContext: new Set() };
    }

    // Skip magic commands and shell commands
    if (code.trim().startsWith("%%") || code.trim().startsWith("!")) {
      return { errors: [], newContext: new Set() };
    }

    try {
      // Run Flake8 linting
      const results = await pyodide.runPythonAsync(`
import json
results = lint_code_simple(${JSON.stringify(code)})
json.dumps(results)
      `);

      const errors = JSON.parse(results);

      // Adjust line numbers with offset
      const adjustedErrors = errors.map((error) => ({
        ...error,
        line: error.line + cellOffset,
        rule: "flake8",
      }));

      return { errors: adjustedErrors, newContext: new Set() };
    } catch (error) {
      console.error("[Flake8Engine] Linting error:", error);
      return { errors: [], newContext: new Set() };
    }
  }

  /**
   * Lint multiple cells (notebook)
   * @param {Array<{code: string, element: Element, cellIndex: number}>} cells
   * @returns {Promise<Array>}
   */
  async function lintNotebook(cells) {
    if (!isReady) {
      await load();
    }

    const allErrors = [];
    let lineOffset = 0;

    for (const cell of cells) {
      const { errors } = await lintCell(cell.code, lineOffset, cell.cellIndex);

      errors.forEach((error) => {
        allErrors.push({
          ...error,
          cellIndex: cell.cellIndex,
          element: cell.element,
          cellLine: error.line - lineOffset,
        });
      });

      lineOffset += cell.code.split("\n").length;
    }

    return allErrors;
  }

  /**
   * Get error statistics
   * @param {Array} errors
   * @returns {Object}
   */
  function getStats(errors) {
    const stats = {
      total: errors.length,
      byRule: {},
      bySeverity: { error: 0, warning: 0, info: 0 },
    };

    errors.forEach((error) => {
      stats.bySeverity[error.severity] =
        (stats.bySeverity[error.severity] || 0) + 1;
      const rule = error.code || "flake8";
      stats.byRule[rule] = (stats.byRule[rule] || 0) + 1;
    });

    return stats;
  }

  return {
    load,
    getIsReady,
    getIsLoading,
    lintCell,
    lintNotebook,
    getStats,
  };
})();

if (typeof window !== "undefined") {
  window.Flake8Engine = Flake8Engine;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = Flake8Engine;
}
