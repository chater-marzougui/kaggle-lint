/**
 * Basic tests for lint rules
 * Run with: node test/rules.test.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Create a mock window object
const context = { window: {} };
vm.createContext(context);

function loadRule(filename) {
  const code = fs.readFileSync(
    path.join(__dirname, "../src/rules", filename),
    "utf8"
  );
  vm.runInContext(code, context);
}

// Load all rules
loadRule("undefinedVariables.js");
loadRule("capitalizationTypos.js");
loadRule("duplicateFunctions.js");
loadRule("importIssues.js");
loadRule("indentationErrors.js");
loadRule("emptyCells.js");
loadRule("unclosedBrackets.js");
loadRule("redefinedVariables.js");
loadRule("missingReturn.js");

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

function assertEqual(actual, expected, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(
        actual
      )}`
    );
  }
}

function assertLength(arr, length, msg = "") {
  if (arr.length !== length) {
    throw new Error(
      `${msg}\nExpected length: ${length}\nActual length: ${
        arr.length
      }\nContent: ${JSON.stringify(arr)}`
    );
  }
}

function assertContains(arr, predicate, msg = "") {
  if (!arr.some(predicate)) {
    throw new Error(
      `${msg}\nNo matching element found in: ${JSON.stringify(arr)}`
    );
  }
}

// Undefined Variables Tests
console.log("\n=== Undefined Variables Rule ===");

// Helper function to extract errors from undefinedVariables rule result
function getUndefinedVarErrors(result) {
  // Handle both old format (array) and new format (object with errors)
  if (Array.isArray(result)) {
    return result;
  }
  return result.errors || [];
}

test("detects undefined variable", () => {
  const code = "x = y + 1";
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  assertContains(
    errors,
    (e) => e.msg.includes("'y'"),
    "Should detect undefined y"
  );
});

test("allows defined variable", () => {
  const code = "x = 1\ny = x + 1";
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  assertLength(errors, 0, "Should not report any errors");
});

test("allows Python builtins", () => {
  const code = "x = len([1, 2, 3])\nprint(x)";
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  assertLength(errors, 0, "Should not report errors for builtins");
});

test("allows common libraries", () => {
  const code = "df = pd.DataFrame()\narr = np.array([1])";
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  assertLength(errors, 0, "Should not report errors for pd/np");
});

test("ignores shell commands (! prefix)", () => {
  const code = "!pip install numpy\n!pip install pandas";
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  assertLength(errors, 0, "Should not report errors for shell commands");
});

test("ignores magic commands (%%capture)", () => {
  const code = "%%capture\nimport os\n!pip install torch";
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  assertLength(errors, 0, "Should skip cells with %%capture");
});

test("ignores f-string and r-string prefixes", () => {
  const code = 'x = f"hello"\ny = r"\\n"\nz = fr"test"';
  const result = UndefinedVariablesRule.run(code);
  const errors = getUndefinedVarErrors(result);
  // f, r, fr prefixes should not be reported as undefined
  assertLength(errors, 0, "Should not report f/r/fr prefixes as undefined");
});

test("supports cross-cell context", () => {
  const code1 = "my_var = 42\nmy_func = lambda x: x + 1";
  const code2 = "result = my_var + 1\nresult2 = my_func(10)";
  
  // First cell defines variables
  const result1 = UndefinedVariablesRule.run(code1, 0, {});
  const defined1 = result1.definedNames;
  
  // Second cell uses context from first cell
  const result2 = UndefinedVariablesRule.run(code2, 0, { previousContext: defined1 });
  const errors2 = getUndefinedVarErrors(result2);
  
  assertLength(errors2, 0, "Should not report errors when context is shared");
});

test("extracts defined names from imports", () => {
  const code = "from math import sqrt, pi\nimport json";
  const result = UndefinedVariablesRule.run(code);
  const definedNames = result.definedNames;
  
  assertEqual(definedNames.has("sqrt"), true, "Should extract sqrt from import");
  assertEqual(definedNames.has("pi"), true, "Should extract pi from import");
  assertEqual(definedNames.has("json"), true, "Should extract json from import");
});

// Capitalization Typos Tests
console.log("\n=== Capitalization Typos Rule ===");

test("detects true instead of True", () => {
  const code = "x = true";
  const errors = CapitalizationTyposRule.run(code);
  assertContains(
    errors,
    (e) => e.msg.includes("true") && e.msg.includes("True")
  );
});

test("detects false instead of False", () => {
  const code = "x = false";
  const errors = CapitalizationTyposRule.run(code);
  assertContains(
    errors,
    (e) => e.msg.includes("false") && e.msg.includes("False")
  );
});

test("allows correct capitalization", () => {
  const code = "x = True\ny = False\nz = None";
  const errors = CapitalizationTyposRule.run(code);
  assertLength(errors, 0);
});

// Duplicate Functions Tests
console.log("\n=== Duplicate Functions Rule ===");

test("detects duplicate function names", () => {
  const code = "def foo():\n    pass\n\ndef foo():\n    pass";
  const errors = DuplicateFunctionsRule.run(code);
  assertContains(
    errors,
    (e) => e.msg.includes("foo") && e.msg.includes("Duplicate")
  );
});

test("allows different function names", () => {
  const code = "def foo():\n    pass\n\ndef bar():\n    pass";
  const errors = DuplicateFunctionsRule.run(code);
  assertLength(errors, 0);
});

// Import Issues Tests
console.log("\n=== Import Issues Rule ===");

test("detects wildcard imports", () => {
  const code = "from os import *";
  const errors = ImportIssuesRule.run(code);
  assertContains(errors, (e) => e.msg.includes("Wildcard"));
});

test("detects duplicate imports", () => {
  const code = "import os\nimport os";
  const errors = ImportIssuesRule.run(code);
  assertContains(errors, (e) => e.msg.includes("Duplicate import"));
});

// Indentation Errors Tests
console.log("\n=== Indentation Errors Rule ===");

test("detects missing indent after colon", () => {
  const code = "if True:\nx = 1";
  const errors = IndentationErrorsRule.run(code);
  assertContains(errors, (e) => e.msg.includes("indent"));
});

test("allows proper indentation", () => {
  const code = "if True:\n    x = 1";
  const errors = IndentationErrorsRule.run(code);
  assertLength(errors, 0);
});

test("allows multi-line function calls", () => {
  const code = "result = SFTConfig(\n    output_dir='./output',\n    batch_size=16,\n)";
  const errors = IndentationErrorsRule.run(code);
  assertLength(errors, 0, "Should not report errors for multi-line function calls");
});

test("ignores shell commands", () => {
  const code = "!pip install torch\n!pip install transformers";
  const errors = IndentationErrorsRule.run(code);
  assertLength(errors, 0, "Should not report errors for shell commands");
});

test("ignores magic commands", () => {
  const code = "%%capture\nimport os\n!pip install numpy";
  const errors = IndentationErrorsRule.run(code);
  assertLength(errors, 0, "Should not report errors for magic commands");
});

// Empty Cells Tests
console.log("\n=== Empty Cells Rule ===");

test("detects empty cell", () => {
  const code = "";
  const errors = EmptyCellsRule.run(code, 0, 0);
  assertContains(errors, (e) => e.msg.includes("empty"));
});

test("detects comment-only cell", () => {
  const code = "# This is just a comment";
  const errors = EmptyCellsRule.run(code, 0, 0);
  assertContains(errors, (e) => e.msg.includes("comments"));
});

// Unclosed Brackets Tests
console.log("\n=== Unclosed Brackets Rule ===");

test("detects unclosed parenthesis", () => {
  const code = "x = (1 + 2";
  const errors = UnclosedBracketsRule.run(code);
  assertContains(errors, (e) => e.msg.includes("'('"));
});

test("detects unclosed bracket", () => {
  const code = "x = [1, 2, 3";
  const errors = UnclosedBracketsRule.run(code);
  assertContains(errors, (e) => e.msg.includes("'['"));
});

test("detects mismatched brackets", () => {
  const code = "x = (1, 2]";
  const errors = UnclosedBracketsRule.run(code);
  assertContains(
    errors,
    (e) => e.msg.includes("Mismatched") || e.msg.includes("Unmatched")
  );
});

test("allows balanced brackets", () => {
  const code = 'x = (1 + 2)\ny = [1, 2, 3]\nz = {"a": 1}';
  const errors = UnclosedBracketsRule.run(code);
  assertLength(errors, 0);
});

test("ignores brackets in strings", () => {
  const code = 'x = "hello (world"';
  const errors = UnclosedBracketsRule.run(code);
  assertLength(errors, 0);
});

// Redefined Variables Tests
console.log("\n=== Redefined Variables Rule ===");

test("detects shadowing built-in", () => {
  const code = "list = [1, 2, 3]";
  const errors = RedefinedVariablesRule.run(code);
  assertContains(
    errors,
    (e) => e.msg.includes("list") && e.msg.includes("built-in")
  );
});

test("allows normal variable names", () => {
  const code = "my_list = [1, 2, 3]";
  const errors = RedefinedVariablesRule.run(code);
  assertLength(errors, 0);
});

// Missing Return Tests
console.log("\n=== Missing Return Rule ===");

test("detects missing return in get_ function", () => {
  const code = "def get_value():\n    result = 42";
  const errors = MissingReturnRule.run(code);
  assertContains(
    errors,
    (e) => e.msg.includes("get_value") && e.msg.includes("return")
  );
});

test("allows function with return", () => {
  const code = "def get_value():\n    result = 42\n    return result";
  const errors = MissingReturnRule.run(code);
  assertLength(errors, 0);
});

test("allows __init__ without return", () => {
  const code = "def __init__(self):\n    self.value = 42";
  const errors = MissingReturnRule.run(code);
  assertLength(errors, 0);
});

// Summary
console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
