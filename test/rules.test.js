/**
 * Basic tests for lint rules
 * Run with: node test/rules.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Create a mock window object
const context = { window: {} };
vm.createContext(context);

function loadRule(filename) {
  const code = fs.readFileSync(path.join(__dirname, '../src/rules', filename), 'utf8');
  vm.runInContext(code, context);
}

// Load all rules
loadRule('undefinedVariables.js');
loadRule('capitalizationTypos.js');
loadRule('duplicateFunctions.js');
loadRule('importIssues.js');
loadRule('indentationErrors.js');
loadRule('emptyCells.js');
loadRule('unclosedBrackets.js');
loadRule('redefinedVariables.js');
loadRule('missingReturn.js');

// Get rules from context
const UndefinedVariablesRule = context.window.UndefinedVariablesRule;
const CapitalizationTyposRule = context.window.CapitalizationTyposRule;
const DuplicateFunctionsRule = context.window.DuplicateFunctionsRule;
const ImportIssuesRule = context.window.ImportIssuesRule;
const IndentationErrorsRule = context.window.IndentationErrorsRule;
const EmptyCellsRule = context.window.EmptyCellsRule;
const UnclosedBracketsRule = context.window.UnclosedBracketsRule;
const RedefinedVariablesRule = context.window.RedefinedVariablesRule;
const MissingReturnRule = context.window.MissingReturnRule;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertLength(arr, length, msg = '') {
  if (arr.length !== length) {
    throw new Error(`${msg}\nExpected length: ${length}\nActual length: ${arr.length}\nContent: ${JSON.stringify(arr)}`);
  }
}

function assertContains(arr, predicate, msg = '') {
  if (!arr.some(predicate)) {
    throw new Error(`${msg}\nNo matching element found in: ${JSON.stringify(arr)}`);
  }
}

// Undefined Variables Tests
console.log('\n=== Undefined Variables Rule ===');

test('detects undefined variable', () => {
  const code = 'x = y + 1';
  const errors = UndefinedVariablesRule.run(code);
  assertContains(errors, e => e.msg.includes("'y'"), 'Should detect undefined y');
});

test('allows defined variable', () => {
  const code = 'x = 1\ny = x + 1';
  const errors = UndefinedVariablesRule.run(code);
  assertLength(errors, 0, 'Should not report any errors');
});

test('allows Python builtins', () => {
  const code = 'x = len([1, 2, 3])\nprint(x)';
  const errors = UndefinedVariablesRule.run(code);
  assertLength(errors, 0, 'Should not report errors for builtins');
});

test('allows common libraries', () => {
  const code = 'df = pd.DataFrame()\narr = np.array([1])';
  const errors = UndefinedVariablesRule.run(code);
  assertLength(errors, 0, 'Should not report errors for pd/np');
});

// Capitalization Typos Tests
console.log('\n=== Capitalization Typos Rule ===');

test('detects true instead of True', () => {
  const code = 'x = true';
  const errors = CapitalizationTyposRule.run(code);
  assertContains(errors, e => e.msg.includes('true') && e.msg.includes('True'));
});

test('detects false instead of False', () => {
  const code = 'x = false';
  const errors = CapitalizationTyposRule.run(code);
  assertContains(errors, e => e.msg.includes('false') && e.msg.includes('False'));
});

test('allows correct capitalization', () => {
  const code = 'x = True\ny = False\nz = None';
  const errors = CapitalizationTyposRule.run(code);
  assertLength(errors, 0);
});

// Duplicate Functions Tests
console.log('\n=== Duplicate Functions Rule ===');

test('detects duplicate function names', () => {
  const code = 'def foo():\n    pass\n\ndef foo():\n    pass';
  const errors = DuplicateFunctionsRule.run(code);
  assertContains(errors, e => e.msg.includes('foo') && e.msg.includes('Duplicate'));
});

test('allows different function names', () => {
  const code = 'def foo():\n    pass\n\ndef bar():\n    pass';
  const errors = DuplicateFunctionsRule.run(code);
  assertLength(errors, 0);
});

// Import Issues Tests
console.log('\n=== Import Issues Rule ===');

test('detects wildcard imports', () => {
  const code = 'from os import *';
  const errors = ImportIssuesRule.run(code);
  assertContains(errors, e => e.msg.includes('Wildcard'));
});

test('detects duplicate imports', () => {
  const code = 'import os\nimport os';
  const errors = ImportIssuesRule.run(code);
  assertContains(errors, e => e.msg.includes('Duplicate import'));
});

// Indentation Errors Tests
console.log('\n=== Indentation Errors Rule ===');

test('detects missing indent after colon', () => {
  const code = 'if True:\nx = 1';
  const errors = IndentationErrorsRule.run(code);
  assertContains(errors, e => e.msg.includes('indent'));
});

test('allows proper indentation', () => {
  const code = 'if True:\n    x = 1';
  const errors = IndentationErrorsRule.run(code);
  assertLength(errors, 0);
});

// Empty Cells Tests
console.log('\n=== Empty Cells Rule ===');

test('detects empty cell', () => {
  const code = '';
  const errors = EmptyCellsRule.run(code, 0, 0);
  assertContains(errors, e => e.msg.includes('empty'));
});

test('detects comment-only cell', () => {
  const code = '# This is just a comment';
  const errors = EmptyCellsRule.run(code, 0, 0);
  assertContains(errors, e => e.msg.includes('comments'));
});

// Unclosed Brackets Tests
console.log('\n=== Unclosed Brackets Rule ===');

test('detects unclosed parenthesis', () => {
  const code = 'x = (1 + 2';
  const errors = UnclosedBracketsRule.run(code);
  assertContains(errors, e => e.msg.includes("'('"));
});

test('detects unclosed bracket', () => {
  const code = 'x = [1, 2, 3';
  const errors = UnclosedBracketsRule.run(code);
  assertContains(errors, e => e.msg.includes("'['"));
});

test('detects mismatched brackets', () => {
  const code = 'x = (1, 2]';
  const errors = UnclosedBracketsRule.run(code);
  assertContains(errors, e => e.msg.includes('Mismatched') || e.msg.includes('Unmatched'));
});

test('allows balanced brackets', () => {
  const code = 'x = (1 + 2)\ny = [1, 2, 3]\nz = {"a": 1}';
  const errors = UnclosedBracketsRule.run(code);
  assertLength(errors, 0);
});

test('ignores brackets in strings', () => {
  const code = 'x = "hello (world"';
  const errors = UnclosedBracketsRule.run(code);
  assertLength(errors, 0);
});

// Redefined Variables Tests
console.log('\n=== Redefined Variables Rule ===');

test('detects shadowing built-in', () => {
  const code = 'list = [1, 2, 3]';
  const errors = RedefinedVariablesRule.run(code);
  assertContains(errors, e => e.msg.includes('list') && e.msg.includes('built-in'));
});

test('allows normal variable names', () => {
  const code = 'my_list = [1, 2, 3]';
  const errors = RedefinedVariablesRule.run(code);
  assertLength(errors, 0);
});

// Missing Return Tests
console.log('\n=== Missing Return Rule ===');

test('detects missing return in get_ function', () => {
  const code = 'def get_value():\n    result = 42';
  const errors = MissingReturnRule.run(code);
  assertContains(errors, e => e.msg.includes('get_value') && e.msg.includes('return'));
});

test('allows function with return', () => {
  const code = 'def get_value():\n    result = 42\n    return result';
  const errors = MissingReturnRule.run(code);
  assertLength(errors, 0);
});

test('allows __init__ without return', () => {
  const code = 'def __init__(self):\n    self.value = 42';
  const errors = MissingReturnRule.run(code);
  assertLength(errors, 0);
});

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
