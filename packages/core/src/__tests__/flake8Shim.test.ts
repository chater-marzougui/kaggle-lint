import { PYTHON_SHIM } from '../engines/flake8Shim';

describe('PYTHON_SHIM lint_source formatter wiring', () => {
  it('assigns application.formatter before calling make_guide(), so the collecting formatter actually receives live violations', () => {
    // flake8.api.legacy.get_style_guide()'s convenience wrapper cannot
    // capture structured results this way — confirmed by direct repro,
    // see this plan's header. Regression test for that ordering
    // requirement: reassigning application.formatter AFTER make_guide()/
    // make_file_checker_manager() silently produces empty results.
    const formatterAssignIdx = PYTHON_SHIM.indexOf(
      'application.formatter = CollectingFormatter'
    );
    const makeGuideIdx = PYTHON_SHIM.indexOf('application.make_guide()');

    expect(formatterAssignIdx).toBeGreaterThan(-1);
    expect(makeGuideIdx).toBeGreaterThan(-1);
    expect(formatterAssignIdx).toBeLessThan(makeGuideIdx);
  });

  it('suppresses printing by returning None from format()', () => {
    expect(PYTHON_SHIM).toMatch(
      /def format\(self, error\):\s*\n\s*return None/
    );
  });

  it("routes ignore_codes into flake8's own native config, not a client-side filter", () => {
    expect(PYTHON_SHIM).toContain('application.options.ignore = ignore_codes');
  });
});
