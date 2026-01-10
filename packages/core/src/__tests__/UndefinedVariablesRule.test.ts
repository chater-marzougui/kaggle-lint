/**
 * Basic tests for UndefinedVariablesRule
 * Tests migrated from old-linter/test/rules.test.js
 */

import { UndefinedVariablesRule } from '../rules/UndefinedVariablesRule';
import { LintError } from '../types';

describe('UndefinedVariablesRule', () => {
  let rule: UndefinedVariablesRule;

  beforeEach(() => {
    rule = new UndefinedVariablesRule();
  });

  test('detects undefined variable', () => {
    const code = 'x = y + 1';
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain('y');
    expect(errors[0].severity).toBe('error');
  });

  test('does not flag defined variables', () => {
    const code = 'x = 1\ny = x + 1';
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('recognizes Python builtins', () => {
    const code = 'result = len([1, 2, 3])';
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('handles function definitions', () => {
    const code = `def foo(x):
    return x + 1
result = foo(5)`;
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('detects undefined variables in function', () => {
    const code = `def foo():
    return x + 1`;
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain('x');
  });

  test('handles import statements', () => {
    const code = `import numpy as np
arr = np.array([1, 2, 3])`;
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('handles from import statements', () => {
    const code = `from pandas import DataFrame
df = DataFrame()`;
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('handles class definitions', () => {
    const code = `class MyClass:
    def __init__(self):
        self.value = 0`;
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('skips magic commands', () => {
    const code = '%%capture\nprint("test")';
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(0);
  });

  test('handles strings with variables', () => {
    const code = 'msg = "value of x is " + str(x)';
    const errors = rule.run(code, 0);
    
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain('x');
  });

  test('multiple undefined variables', () => {
    const code = 'result = a + b + c';
    const errors = rule.run(code, 0);
    
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  test('handles context from previous cells', () => {
    const code = 'y = x + 1';
    const context = { definedNames: new Set(['x']) };
    const errors = rule.run(code, 0, context);
    
    expect(errors).toHaveLength(0);
  });
});
