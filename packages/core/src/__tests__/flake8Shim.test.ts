import { PYTHON_SHIM } from '../engines/flake8Shim';

describe('PYTHON_SHIM ContextAwareChecker init ordering', () => {
  it('sets self.known_context before calling super().__init__, so the overridden report() can read it', () => {
    // pyflakes.checker.Checker.__init__ synchronously calls the overridden
    // report() (which reads self.known_context) during super().__init__()
    // itself. If known_context is assigned AFTER the super call, any
    // UndefinedName violation crashes with AttributeError, silently
    // discarding that cell's entire result set. Regression test for a bug
    // found during Milestone 3's manual verification gate.
    // Bounded by the next sibling method at the same indentation (not just
    // the next blank line), so this captures exactly __init__'s body and
    // nothing from report()/CollectingReporter that happens to follow it.
    const classMatch = PYTHON_SHIM.match(
      /class ContextAwareChecker\(checker\.Checker\):[\s\S]*?\n( {12})def __init__\(self, tree, filename='<input>', known_context=None\):\n([\s\S]*?)\n\1def /
    );
    expect(classMatch).not.toBeNull();

    const initBody = classMatch![2];
    const superIdx = initBody.indexOf('super().__init__(tree, filename)');
    const contextIdx = initBody.indexOf('self.known_context = known_context or set()');

    expect(superIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeLessThan(superIdx);
  });
});
