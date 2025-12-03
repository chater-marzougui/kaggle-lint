/**
 * Tests for CodeMirror (local cell storage)
 * Run with: node test/codeMirror.test.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Create a mock window object
const context = { window: {} };
vm.createContext(context);

// Load the CodeMirror module
const codeMirrorCode = fs.readFileSync(
  path.join(__dirname, "../src/codeMirror.js"),
  "utf8"
);
vm.runInContext(codeMirrorCode, context);

const CodeMirror = context.window.CodeMirror;

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
  // For primitive types, use strict equality
  if (typeof actual !== "object" || actual === null) {
    if (actual !== expected) {
      throw new Error(
        `${msg}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`
      );
    }
    return;
  }
  // For objects/arrays, use JSON comparison (sufficient for this test case)
  const actualStr = JSON.stringify(actual, Object.keys(actual).sort());
  const expectedStr = JSON.stringify(expected, Object.keys(expected).sort());
  if (actualStr !== expectedStr) {
    throw new Error(
      `${msg}\nExpected: ${expectedStr}\nActual: ${actualStr}`
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

// Clean up before each test
function setup() {
  CodeMirror.clear();
}

console.log("\n=== CodeMirror Tests ===\n");

// Basic storage tests
test("stores and retrieves a cell", () => {
  setup();
  const code = "x = 1\nprint(x)";
  CodeMirror.updateCell(0, "uuid-123", code);
  const cell = CodeMirror.getCell(0, "uuid-123");
  assertEqual(cell.code, code, "Should store and retrieve code");
  assertEqual(cell.cellIndex, 0, "Should store cellIndex");
  assertEqual(cell.uuid, "uuid-123", "Should store uuid");
});

test("updates existing cell", () => {
  setup();
  CodeMirror.updateCell(0, "uuid-123", "x = 1");
  const updated = CodeMirror.updateCell(0, "uuid-123", "x = 2");
  assertEqual(updated, true, "Should return true when code changed");
  const cell = CodeMirror.getCell(0, "uuid-123");
  assertEqual(cell.code, "x = 2", "Should update code");
});

test("returns false when code unchanged", () => {
  setup();
  CodeMirror.updateCell(0, "uuid-123", "x = 1");
  const updated = CodeMirror.updateCell(0, "uuid-123", "x = 1");
  assertEqual(updated, false, "Should return false when code unchanged");
});

test("uses index as fallback when no uuid", () => {
  setup();
  CodeMirror.updateCell(0, null, "x = 1");
  const cell = CodeMirror.getCell(0, null);
  assertEqual(cell.code, "x = 1", "Should retrieve by index");
});

test("returns null for non-existent cell", () => {
  setup();
  const cell = CodeMirror.getCell(99, null);
  assertEqual(cell, null, "Should return null for non-existent cell");
});

// getAllCells tests
test("gets all cells in order", () => {
  setup();
  CodeMirror.updateCell(2, null, "cell 2");
  CodeMirror.updateCell(0, null, "cell 0");
  CodeMirror.updateCell(1, null, "cell 1");
  const cells = CodeMirror.getAllCells();
  assertLength(cells, 3, "Should have 3 cells");
  assertEqual(cells[0].code, "cell 0", "First cell should be index 0");
  assertEqual(cells[1].code, "cell 1", "Second cell should be index 1");
  assertEqual(cells[2].code, "cell 2", "Third cell should be index 2");
});

// syncCells tests
test("syncs cells and returns stats", () => {
  setup();
  const extractedCells = [
    { code: "x = 1", cellIndex: 0, uuid: null },
    { code: "y = 2", cellIndex: 1, uuid: null },
  ];
  const stats = CodeMirror.syncCells(extractedCells);
  assertEqual(stats.added, 2, "Should report 2 cells added");
  assertEqual(stats.total, 2, "Should have 2 total cells");
});

test("detects updated cells in sync", () => {
  setup();
  CodeMirror.updateCell(0, null, "x = 1");
  const extractedCells = [
    { code: "x = 2", cellIndex: 0, uuid: null }, // changed
    { code: "y = 2", cellIndex: 1, uuid: null }, // new
  ];
  const stats = CodeMirror.syncCells(extractedCells);
  assertEqual(stats.updated, 1, "Should report 1 cell updated");
  assertEqual(stats.added, 1, "Should report 1 cell added");
});

// getMergedCells tests
test("merges extracted cells with stored cells", () => {
  setup();
  // Store some cells
  CodeMirror.updateCell(0, null, "cell 0");
  CodeMirror.updateCell(1, null, "cell 1");
  CodeMirror.updateCell(2, null, "cell 2");

  // Simulate Kaggle unloading cell 1 - only extract cells 0 and 2
  const extractedCells = [
    { code: "cell 0 updated", cellIndex: 0, uuid: null },
    { code: "cell 2", cellIndex: 2, uuid: null },
  ];

  const merged = CodeMirror.getMergedCells(extractedCells);
  assertLength(merged, 3, "Should have all 3 cells");
  assertEqual(merged[0].code, "cell 0 updated", "Should use extracted version for cell 0");
  assertEqual(merged[1].code, "cell 1", "Should use stored version for unloaded cell 1");
  assertEqual(merged[2].code, "cell 2", "Should use extracted version for cell 2");
});

test("handles empty extraction with stored cells", () => {
  setup();
  CodeMirror.updateCell(0, null, "x = 1");
  CodeMirror.updateCell(1, null, "y = 2");

  // No cells extracted (page not ready)
  const merged = CodeMirror.getMergedCells([]);
  assertLength(merged, 2, "Should return stored cells when extraction is empty");
});

// hasCell and getCellCount tests
test("checks cell existence correctly", () => {
  setup();
  CodeMirror.updateCell(0, "uuid-123", "x = 1");
  assertEqual(CodeMirror.hasCell(0, "uuid-123"), true, "Should find existing cell");
  assertEqual(CodeMirror.hasCell(1, null), false, "Should not find non-existent cell");
});

test("counts cells correctly", () => {
  setup();
  assertEqual(CodeMirror.getCellCount(), 0, "Should start with 0 cells");
  CodeMirror.updateCell(0, null, "x = 1");
  assertEqual(CodeMirror.getCellCount(), 1, "Should have 1 cell");
  CodeMirror.updateCell(1, null, "y = 2");
  assertEqual(CodeMirror.getCellCount(), 2, "Should have 2 cells");
});

// removeCell tests
test("removes cell correctly", () => {
  setup();
  CodeMirror.updateCell(0, "uuid-123", "x = 1");
  CodeMirror.removeCell(0, "uuid-123");
  assertEqual(CodeMirror.getCell(0, "uuid-123"), null, "Cell should be removed");
  assertEqual(CodeMirror.getCellCount(), 0, "Should have 0 cells");
});

// clear tests
test("clears all cells", () => {
  setup();
  CodeMirror.updateCell(0, null, "x = 1");
  CodeMirror.updateCell(1, null, "y = 2");
  CodeMirror.clear();
  assertEqual(CodeMirror.getCellCount(), 0, "Should have 0 cells after clear");
});

// cleanupDeletedCells tests
test("cleans up deleted cells", () => {
  setup();
  // Store 5 cells
  for (let i = 0; i < 5; i++) {
    CodeMirror.updateCell(i, null, `cell ${i}`);
  }
  // Now only 3 cells exist in extracted data
  const extractedCells = [
    { code: "cell 0", cellIndex: 0, uuid: null },
    { code: "cell 1", cellIndex: 1, uuid: null },
    { code: "cell 2", cellIndex: 2, uuid: null },
  ];
  // Cleanup with expected count of 3
  const removed = CodeMirror.cleanupDeletedCells(extractedCells, 3);
  assertEqual(removed, 2, "Should remove 2 cells");
  assertEqual(CodeMirror.getCellCount(), 3, "Should have 3 cells remaining");
});

// getCellId tests
test("generates correct cell ID with uuid", () => {
  const id = CodeMirror.getCellId(0, "uuid-123");
  assertEqual(id, "uuid-123", "Should use uuid when available");
});

test("generates correct cell ID without uuid", () => {
  const id = CodeMirror.getCellId(5, null);
  assertEqual(id, "cell-5", "Should generate id from index");
});

// Summary
console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
