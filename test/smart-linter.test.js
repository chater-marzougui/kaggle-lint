/**
 * Tests for Smart Linter - Whole Notebook Analysis Mode
 * Run with: node test/smart-linter.test.js
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

// Load all rules first (SmartLinter depends on them)
loadRule("undefinedVariables.js");
loadRule("capitalizationTypos.js");
loadRule("duplicateFunctions.js");
loadRule("importIssues.js");
loadRule("indentationErrors.js");
loadRule("emptyCells.js");
loadRule("unclosedBrackets.js");
loadRule("redefinedVariables.js");
loadRule("missingReturn.js");

// Load the Smart Linter
const smartLinterCode = fs.readFileSync(
  path.join(__dirname, "../src/smartLinter.js"),
  "utf8"
);
vm.runInContext(smartLinterCode, context);

const SmartLinter = context.window.SmartLinter;

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

function assertNotContains(arr, predicate, msg = "") {
  if (arr.some(predicate)) {
    throw new Error(
      `${msg}\nUnexpected element found in: ${JSON.stringify(arr)}`
    );
  }
}

// Test combineNotebook function
console.log("\n=== combineNotebook Tests ===");

test("combines multiple cells into single code", () => {
  const cells = [
    { code: "import pandas as pd", cellIndex: 0 },
    { code: "df = pd.DataFrame()", cellIndex: 1 },
    { code: "print(df)", cellIndex: 2 },
  ];

  const { combinedCode, cellOffsets } = SmartLinter.combineNotebook(cells);

  // Check combined code
  assertEqual(
    combinedCode,
    "import pandas as pd\ndf = pd.DataFrame()\nprint(df)",
    "Combined code should join cells with newlines"
  );

  // Check cell offsets
  assertLength(cellOffsets, 3, "Should have 3 cell offsets");
  assertEqual(cellOffsets[0].startLine, 1, "First cell starts at line 1");
  assertEqual(cellOffsets[0].endLine, 1, "First cell ends at line 1");
  assertEqual(cellOffsets[1].startLine, 2, "Second cell starts at line 2");
  assertEqual(cellOffsets[2].startLine, 3, "Third cell starts at line 3");
});

test("handles multi-line cells correctly", () => {
  const cells = [
    { code: "def foo():\n    return 1", cellIndex: 0 },
    { code: "x = foo()", cellIndex: 1 },
  ];

  const { combinedCode, cellOffsets } = SmartLinter.combineNotebook(cells);

  assertEqual(
    combinedCode,
    "def foo():\n    return 1\nx = foo()",
    "Multi-line cells should be combined correctly"
  );

  assertEqual(cellOffsets[0].startLine, 1, "First cell starts at line 1");
  assertEqual(cellOffsets[0].endLine, 2, "First cell ends at line 2");
  assertEqual(cellOffsets[1].startLine, 3, "Second cell starts at line 3");
});

// Test mapLineToCell function
console.log("\n=== mapLineToCell Tests ===");

test("maps global line to correct cell", () => {
  const cellOffsets = [
    { cellIndex: 0, startLine: 1, endLine: 2 },
    { cellIndex: 1, startLine: 3, endLine: 5 },
    { cellIndex: 2, startLine: 6, endLine: 6 },
  ];

  assertEqual(
    SmartLinter.mapLineToCell(1, cellOffsets),
    { cellIndex: 0, cellLine: 1 },
    "Line 1 should map to cell 0, line 1"
  );

  assertEqual(
    SmartLinter.mapLineToCell(2, cellOffsets),
    { cellIndex: 0, cellLine: 2 },
    "Line 2 should map to cell 0, line 2"
  );

  assertEqual(
    SmartLinter.mapLineToCell(4, cellOffsets),
    { cellIndex: 1, cellLine: 2 },
    "Line 4 should map to cell 1, line 2"
  );

  assertEqual(
    SmartLinter.mapLineToCell(6, cellOffsets),
    { cellIndex: 2, cellLine: 1 },
    "Line 6 should map to cell 2, line 1"
  );
});

// Test cross-cell variable detection
console.log("\n=== Cross-Cell Variable Detection ===");

test("smart mode knows all definitions upfront (no order-dependent errors)", () => {
  // In smart mode, we preload ALL definitions from the entire notebook
  // This means variables defined in later cells are still visible
  // This is a key difference from standard mode
  const cells = [
    { code: "result = my_var + 1", cellIndex: 0 },
    { code: "my_var = 42", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  // Smart mode should NOT report this error because it preloads all definitions
  assertNotContains(
    errors,
    (e) => e.msg.includes("my_var") && e.rule === "undefinedVariables",
    "Smart mode preloads all definitions - my_var is visible even from later cell"
  );
});

test("allows variable defined in earlier cell", () => {
  const cells = [
    { code: "my_var = 42", cellIndex: 0 },
    { code: "result = my_var + 1", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  assertNotContains(
    errors,
    (e) => e.msg.includes("my_var") && e.rule === "undefinedVariables",
    "Should not report my_var as undefined when defined in earlier cell"
  );
});

test("tracks function definitions across cells", () => {
  const cells = [
    { code: "def calculate(x):\n    return x * 2", cellIndex: 0 },
    { code: "result = calculate(5)", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  assertNotContains(
    errors,
    (e) => e.msg.includes("calculate") && e.rule === "undefinedVariables",
    "Should not report calculate as undefined when defined in earlier cell"
  );
});

test("tracks import definitions across cells", () => {
  const cells = [
    { code: "import pandas as pd", cellIndex: 0 },
    { code: "df = pd.DataFrame()", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  assertNotContains(
    errors,
    (e) => e.msg.includes("pd") && e.rule === "undefinedVariables",
    "Should not report pd as undefined when imported in earlier cell"
  );
});

test("tracks from imports across cells", () => {
  const cells = [
    { code: "from math import sqrt, pi", cellIndex: 0 },
    { code: "result = sqrt(pi)", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  assertNotContains(
    errors,
    (e) => e.msg.includes("sqrt") && e.rule === "undefinedVariables",
    "Should not report sqrt as undefined when imported in earlier cell"
  );

  assertNotContains(
    errors,
    (e) => e.msg.includes("pi") && e.rule === "undefinedVariables",
    "Should not report pi as undefined when imported in earlier cell"
  );
});

// Test whole notebook duplicate detection
console.log("\n=== Duplicate Detection Across Cells ===");

test("detects duplicate function across cells", () => {
  const cells = [
    { code: "def process():\n    return 1", cellIndex: 0 },
    { code: "def process():\n    return 2", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  assertContains(
    errors,
    (e) => e.msg.includes("process") && e.rule === "duplicateFunctions",
    "Should detect duplicate function 'process' across cells"
  );
});

// Test isKnownIdentifier function
console.log("\n=== Known Identifier Detection ===");

test("recognizes common data science libraries", () => {
  assertEqual(
    SmartLinter.isKnownIdentifier("pd"),
    true,
    "pd should be recognized"
  );
  assertEqual(
    SmartLinter.isKnownIdentifier("np"),
    true,
    "np should be recognized"
  );
  assertEqual(
    SmartLinter.isKnownIdentifier("plt"),
    true,
    "plt should be recognized"
  );
  assertEqual(
    SmartLinter.isKnownIdentifier("sklearn"),
    true,
    "sklearn should be recognized"
  );
});

test("recognizes Python builtins", () => {
  assertEqual(
    SmartLinter.isKnownIdentifier("len"),
    true,
    "len should be recognized"
  );
  assertEqual(
    SmartLinter.isKnownIdentifier("print"),
    true,
    "print should be recognized"
  );
  assertEqual(
    SmartLinter.isKnownIdentifier("Exception"),
    true,
    "Exception should be recognized"
  );
});

test("does not recognize random names", () => {
  assertEqual(
    SmartLinter.isKnownIdentifier("my_random_var"),
    false,
    "my_random_var should not be recognized"
  );
  assertEqual(
    SmartLinter.isKnownIdentifier("foobar123"),
    false,
    "foobar123 should not be recognized"
  );
});

// Test complex notebook scenarios
console.log("\n=== Complex Notebook Scenarios ===");

test("handles typical data science notebook pattern", () => {
  const cells = [
    { code: "import pandas as pd\nimport numpy as np", cellIndex: 0 },
    { code: "data = pd.read_csv('data.csv')", cellIndex: 1 },
    { code: "processed = data.dropna()\nmean_val = np.mean(processed)", cellIndex: 2 },
    { code: "print(f'Mean: {mean_val}')", cellIndex: 3 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  // Filter to just undefined variable errors
  const undefinedErrors = errors.filter(e => e.rule === "undefinedVariables");

  // Should not have undefined variable errors for properly chained variables
  assertNotContains(
    undefinedErrors,
    (e) => e.msg.includes("'data'"),
    "data should be recognized from earlier cell"
  );

  assertNotContains(
    undefinedErrors,
    (e) => e.msg.includes("'processed'"),
    "processed should be recognized from earlier cell"
  );

  assertNotContains(
    undefinedErrors,
    (e) => e.msg.includes("'mean_val'"),
    "mean_val should be recognized from earlier cell"
  );
});

test("handles class definitions across cells", () => {
  const cells = [
    { code: "class MyModel:\n    def __init__(self):\n        self.value = 0", cellIndex: 0 },
    { code: "model = MyModel()", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);
  const undefinedErrors = errors.filter(e => e.rule === "undefinedVariables");

  assertNotContains(
    undefinedErrors,
    (e) => e.msg.includes("'MyModel'"),
    "MyModel should be recognized from earlier cell"
  );
});

test("handles for loop variables", () => {
  const cells = [
    { code: "for i in range(10):\n    print(i)", cellIndex: 0 },
    { code: "total = sum(range(10))", cellIndex: 1 },
  ];

  const errors = SmartLinter.lintNotebook(cells);
  const undefinedErrors = errors.filter(e => e.rule === "undefinedVariables");

  // Should not report 'i' as undefined within the loop
  assertNotContains(
    undefinedErrors,
    (e) => e.msg.includes("'i'"),
    "i should be recognized as loop variable"
  );
});

// Test error mapping back to cells
console.log("\n=== Error Mapping to Cells ===");

test("correctly maps errors back to original cell", () => {
  const cells = [
    { code: "x = 1", cellIndex: 0 },
    { code: "y = undefined_var", cellIndex: 1 },
    { code: "z = 3", cellIndex: 2 },
  ];

  const errors = SmartLinter.lintNotebook(cells);

  const undefinedError = errors.find(
    (e) => e.msg.includes("undefined_var")
  );

  if (undefinedError) {
    assertEqual(
      undefinedError.cellIndex,
      1,
      "Error should be mapped to cell index 1"
    );
    assertEqual(
      undefinedError.cellLine,
      1,
      "Error should be on line 1 of the cell"
    );
  }
});

// Summary
console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
