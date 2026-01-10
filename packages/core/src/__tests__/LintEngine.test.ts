/**
 * Basic tests for LintEngine
 */

import { LintEngine } from '../engines/LintEngine';
import { UndefinedVariablesRule } from '../rules/UndefinedVariablesRule';
import { CapitalizationTyposRule } from '../rules/CapitalizationTyposRule';

describe('LintEngine', () => {
  let engine: LintEngine;

  beforeEach(() => {
    engine = new LintEngine();
  });

  test('creates engine with default rules', () => {
    const rules = engine.getRules();
    expect(rules.length).toBeGreaterThan(0);
  });

  test('can register custom rules', () => {
    const customEngine = new LintEngine([]);
    customEngine.registerRule(new UndefinedVariablesRule());
    
    const rules = customEngine.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('undefinedVariables');
  });

  test('lints code with multiple rules', () => {
    const code = 'x = y + 1';
    const errors = engine.lintCode(code, 0);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].msg).toContain('y');
  });

  test('handles cell offset correctly', () => {
    const code = 'x = y + 1';
    const errors = engine.lintCode(code, 10);
    
    expect(errors[0].line).toBeGreaterThanOrEqual(10);
  });

  test('filters errors by severity', () => {
    const code = 'x = y + 1';
    const allErrors = engine.lintCode(code, 0);
    const errorOnly = engine.filterBySeverity(allErrors, 'error');
    
    expect(errorOnly.length).toBeLessThanOrEqual(allErrors.length);
  });

  test('groups errors by rule', () => {
    const code = 'x = y + 1\ntrue = True';
    const errors = engine.lintCode(code, 0);
    const grouped = engine.groupByRule(errors);
    
    expect(grouped.size).toBeGreaterThan(0);
  });

  test('gets error statistics', () => {
    const code = 'x = y + 1';
    const errors = engine.lintCode(code, 0);
    const stats = engine.getStats(errors);
    
    expect(stats.total).toBe(errors.length);
    expect(stats.bySeverity).toBeDefined();
    expect(stats.byRule).toBeDefined();
  });

  test('handles empty code', () => {
    const code = '';
    const errors = engine.lintCode(code, 0);
    
    // Empty code might trigger emptyCells rule
    expect(Array.isArray(errors)).toBe(true);
  });

  test('lints notebook with multiple cells', () => {
    const cells = [
      { code: 'x = 1', element: null, cellIndex: 0 },
      { code: 'y = x + 1', element: null, cellIndex: 1 },
      { code: 'z = w + 1', element: null, cellIndex: 2 }
    ];
    
    const errors = engine.lintNotebook(cells);
    
    // Should have error for undefined 'w' in cell 2
    expect(errors.length).toBeGreaterThan(0);
    const undefinedError = errors.find(e => e.msg.includes('w'));
    expect(undefinedError).toBeDefined();
  });
});
