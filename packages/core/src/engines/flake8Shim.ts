/**
 * Python shim run once inside the Pyodide runtime: wraps pyflakes with
 * notebook-wide "known names from earlier cells" context tracking, so
 * `x = y` doesn't flag `y` as undefined if an earlier cell already
 * defined it. Moved verbatim from the old Flake8Engine.ts (pre-M3, when
 * the engine ran directly in the content script).
 */

export const PYTHON_SHIM = `
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
