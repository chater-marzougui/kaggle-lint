/**
 * Unit tests for Flake8 Engine
 * Run with: node test/flake8.test.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Create a mock window object and minimal browser environment
const context = {
  window: {},
  document: {
    createElement: () => ({
      onload: null,
      onerror: null,
      src: "",
    }),
    head: {
      appendChild: () => {},
    },
  },
  console: console,
  setTimeout: setTimeout,
  JSON: JSON,
};
vm.createContext(context);

// Load the Flake8 engine
function loadFlake8Engine() {
  const code = fs.readFileSync(
    path.join(__dirname, "../src/flake8Engine.js"),
    "utf8"
  );
  vm.runInContext(code, context);
}

loadFlake8Engine();

const Flake8Engine = context.window.Flake8Engine;

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

function assertTrue(condition, msg = "") {
  if (!condition) {
    throw new Error(msg || "Expected condition to be true");
  }
}

function assertFalse(condition, msg = "") {
  if (condition) {
    throw new Error(msg || "Expected condition to be false");
  }
}

// Tests for Flake8Engine module structure
console.log("\n=== Flake8 Engine Module Tests ===");

test("Flake8Engine is defined", () => {
  assertTrue(typeof Flake8Engine !== "undefined", "Flake8Engine should be defined");
});

test("Flake8Engine has load method", () => {
  assertTrue(
    typeof Flake8Engine.load === "function",
    "Flake8Engine.load should be a function"
  );
});

test("Flake8Engine has getIsReady method", () => {
  assertTrue(
    typeof Flake8Engine.getIsReady === "function",
    "Flake8Engine.getIsReady should be a function"
  );
});

test("Flake8Engine has getIsLoading method", () => {
  assertTrue(
    typeof Flake8Engine.getIsLoading === "function",
    "Flake8Engine.getIsLoading should be a function"
  );
});

test("Flake8Engine has lintCell method", () => {
  assertTrue(
    typeof Flake8Engine.lintCell === "function",
    "Flake8Engine.lintCell should be a function"
  );
});

test("Flake8Engine has lintNotebook method", () => {
  assertTrue(
    typeof Flake8Engine.lintNotebook === "function",
    "Flake8Engine.lintNotebook should be a function"
  );
});

test("Flake8Engine has getStats method", () => {
  assertTrue(
    typeof Flake8Engine.getStats === "function",
    "Flake8Engine.getStats should be a function"
  );
});

test("Flake8Engine starts not ready", () => {
  assertFalse(
    Flake8Engine.getIsReady(),
    "Flake8Engine should not be ready initially"
  );
});

test("Flake8Engine starts not loading", () => {
  assertFalse(
    Flake8Engine.getIsLoading(),
    "Flake8Engine should not be loading initially"
  );
});

// Tests for getStats function
console.log("\n=== Flake8 Engine getStats Tests ===");

test("getStats returns correct structure for empty errors", () => {
  const stats = Flake8Engine.getStats([]);
  assertEqual(stats.total, 0, "Total should be 0");
  assertEqual(stats.bySeverity.error, 0, "Error count should be 0");
  assertEqual(stats.bySeverity.warning, 0, "Warning count should be 0");
  assertEqual(stats.bySeverity.info, 0, "Info count should be 0");
});

test("getStats counts errors correctly", () => {
  const errors = [
    { line: 1, msg: "Error 1", severity: "error", code: "E001" },
    { line: 2, msg: "Error 2", severity: "error", code: "E002" },
    { line: 3, msg: "Warning 1", severity: "warning", code: "W001" },
  ];
  const stats = Flake8Engine.getStats(errors);
  assertEqual(stats.total, 3, "Total should be 3");
  assertEqual(stats.bySeverity.error, 2, "Error count should be 2");
  assertEqual(stats.bySeverity.warning, 1, "Warning count should be 1");
  assertEqual(stats.bySeverity.info, 0, "Info count should be 0");
});

test("getStats groups by rule/code", () => {
  const errors = [
    { line: 1, msg: "Error 1", severity: "error", code: "E001" },
    { line: 2, msg: "Error 2", severity: "error", code: "E001" },
    { line: 3, msg: "Warning 1", severity: "warning", code: "W001" },
  ];
  const stats = Flake8Engine.getStats(errors);
  assertEqual(stats.byRule["E001"], 2, "E001 count should be 2");
  assertEqual(stats.byRule["W001"], 1, "W001 count should be 1");
});

// Summary
console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
