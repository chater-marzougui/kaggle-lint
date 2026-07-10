/**
 * Loads Pyodide + the flake8/pyflakes Python shim inside the offscreen
 * document (an extension page — WASM and 'wasm-unsafe-eval' are allowed
 * here, unlike in the content script's isolated world; see F1 in
 * docs/review-findings.md). Single instance, created once in
 * offscreen/index.ts.
 *
 * PYTHON_SHIM below is a temporary local copy of Flake8Engine.ts:107-291,
 * moved verbatim. Task 4 of the M3 plan cuts it out of this file and into
 * packages/core/src/engines/flake8Shim.ts so core owns the one copy.
 */

import type { Flake8CellInput, Flake8ResultError, Flake8Status } from '../flake8/protocol';

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
  }
}

interface PyodideInterface {
  loadPackage(name: string): Promise<void>;
  runPythonAsync(code: string): Promise<string>;
}

interface RawFlake8Error {
  line: number;
  column: number;
  code: string;
  msg: string;
  severity: 'error' | 'warning' | 'info';
}

const PYODIDE_INDEX_URL = chrome.runtime.getURL('pyodide/');

// Bundled flake8/pyflakes/pycodestyle/mccabe wheels (see scripts/fetch-wheels.md
// for provenance/hashes). Installed from these local chrome.runtime.getURL()
// paths only — never from PyPI at runtime (F9).
const WHEEL_FILENAMES = [
  'mccabe-0.7.0-py2.py3-none-any.whl',
  'pycodestyle-2.11.1-py2.py3-none-any.whl',
  'pyflakes-3.1.0-py2.py3-none-any.whl',
  'flake8-6.1.0-py2.py3-none-any.whl',
];

const PYTHON_SHIM = `
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
`;

export class PyodideRuntime {
  status: Flake8Status = 'unloaded';
  private pyodide: PyodideInterface | null = null;
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.status === 'ready') {
      return Promise.resolve();
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.status = 'loading';
    this.loadPromise = (async () => {
      try {
        if (!window.loadPyodide) {
          await this.loadPyodideScript();
        }
        this.pyodide = await window.loadPyodide!({ indexURL: PYODIDE_INDEX_URL });
        await this.pyodide!.loadPackage('micropip');

        const wheelUrls = WHEEL_FILENAMES.map((name) =>
          chrome.runtime.getURL(`pyodide/wheels/${name}`)
        );
        await this.pyodide!.runPythonAsync(
          `import micropip\nawait micropip.install(${JSON.stringify(wheelUrls)}, deps=False)`
        );

        await this.pyodide!.runPythonAsync(PYTHON_SHIM);
        this.status = 'ready';
      } catch (error) {
        this.status = 'failed';
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  private loadPyodideScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.loadPyodide) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = PYODIDE_INDEX_URL + 'pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide script'));
      document.head.appendChild(script);
    });
  }

  async lintNotebook(cells: Flake8CellInput[]): Promise<Flake8ResultError[]> {
    await this.load();
    await this.pyodide!.runPythonAsync('reset_notebook_context()');

    const allErrors: Flake8ResultError[] = [];
    let lineOffset = 0;

    for (const cell of cells) {
      const code = cell.code;
      const trimmed = code.trim();
      const shouldLint = trimmed.length > 0 && !trimmed.startsWith('%%') && !trimmed.startsWith('!');

      if (shouldLint) {
        const raw = await this.pyodide!.runPythonAsync(`
import json
results = lint_cell_with_notebook_context(${JSON.stringify(code)})
json.dumps(results)
        `);
        const rawResults = JSON.parse(raw) as RawFlake8Error[];

        rawResults.forEach((error) => {
          allErrors.push({
            ...error,
            line: error.line + lineOffset,
            rule: 'flake8',
            cellIndex: cell.cellIndex,
            cellLine: error.line,
          });
        });
      }

      lineOffset += code.split('\n').length;
    }

    return allErrors;
  }
}
