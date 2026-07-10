/**
 * Python shim run once inside the Pyodide runtime: calls flake8's real
 * Application/StyleGuide API against one whole-notebook source string
 * (built by packages/core/src/notebook/buildNotebookSource.ts) instead of
 * per-cell pyflakes calls with hand-rolled cross-cell context tracking —
 * a single real Python "file" gives correct cross-cell scoping natively.
 *
 * flake8.api.legacy.get_style_guide()'s convenience wrapper cannot
 * capture structured violations (confirmed by direct repro: reassigning
 * application.formatter after calling it has no effect, since
 * make_file_checker_manager() already wired the checking machinery to
 * the original formatter). This shim instead constructs Application()
 * directly and assigns a custom formatter BEFORE make_guide()/
 * make_file_checker_manager() run — the order matters.
 */

export const PYTHON_SHIM = `
from flake8.main.application import Application
from flake8.api.legacy import parse_args, StyleGuide
from flake8.formatting.base import BaseFormatter


class CollectingFormatter(BaseFormatter):
    """Collects structured violations instead of printing them."""

    def after_init(self):
        self.collected = []

    def handle(self, error):
        self.collected.append({
            'line': error.line_number,
            'column': error.column_number,
            'code': error.code,
            'message': error.text,
        })

    def format(self, error):
        return None


def lint_source(source, ignore_codes):
    """
    Lint one whole-notebook source string with flake8's real API.
    ignore_codes is routed straight into flake8's own ignore config —
    codes it covers are never reported at all, not filtered afterward.
    """
    with open('/notebook_source.py', 'w') as f:
        f.write(source)

    application = Application()
    application.plugins, application.options = parse_args([])
    application.options.ignore = ignore_codes
    application.formatter = CollectingFormatter(application.options)
    application.make_guide()
    application.make_file_checker_manager([])
    guide = StyleGuide(application)
    guide.check_files(['/notebook_source.py'])
    return application.formatter.collected
`;
