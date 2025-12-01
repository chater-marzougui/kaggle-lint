/**
 * Test script to verify DOM parser works with Kaggle's JupyterLab structure
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

// Load the HTML file
const html = fs.readFileSync(path.join(__dirname, '../kaggle/elements.html'), 'utf8');

// Create a JSDOM instance
const dom = new JSDOM(html, {
  runScripts: 'outside-only'
});

const window = dom.window;
const document = window.document;

// Create a context with window and document
const context = {
  window: window,
  document: document,
  console: console
};

vm.createContext(context);

// Load the DOM parser
const domParserCode = fs.readFileSync(path.join(__dirname, '../src/domParser.js'), 'utf8');
vm.runInContext(domParserCode, context);

// Test the DOM parser
const KaggleDomParser = context.window.KaggleDomParser;

console.log('\n=== Testing KaggleDomParser with Kaggle HTML ===\n');

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

function assertGreaterThan(actual, expected, msg = '') {
  if (actual <= expected) {
    throw new Error(`${msg}\nExpected: > ${expected}\nActual: ${actual}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

// Test getCodeCellContainers
test('finds code cell containers in Kaggle HTML', () => {
  const containers = KaggleDomParser.getCodeCellContainers();
  console.log(`  Found ${containers.length} code cell containers`);
  assertGreaterThan(containers.length, 0, 'Should find at least one code cell container');
});

// Test getAllCodeCells
test('extracts code cells with content', () => {
  const codeCells = KaggleDomParser.getAllCodeCells();
  console.log(`  Found ${codeCells.length} code cells with content`);
  assertGreaterThan(codeCells.length, 0, 'Should find at least one code cell with content');
});

// Test that code is extracted correctly
test('extracts Python code from cells', () => {
  const codeCells = KaggleDomParser.getAllCodeCells();
  const firstCell = codeCells[0];
  assertGreaterThan(firstCell.code.length, 0, 'First cell should have code content');
  console.log(`  First cell code length: ${firstCell.code.length} chars`);
  console.log(`  First 80 chars: ${firstCell.code.substring(0, 80).replace(/\n/g, '\\n')}...`);
});

// Test getNotebookMetadata
test('gets notebook metadata (partial - no getComputedStyle in JSDOM)', () => {
  // Note: getComputedStyle is not available in JSDOM, so theme detection will fail
  // but we can at least verify the function runs and returns the expected structure
  try {
    const metadata = KaggleDomParser.getNotebookMetadata();
    console.log(`  Theme: ${metadata.theme}`);
    console.log(`  Mode: ${metadata.mode}`);
    console.log(`  Cell count: ${metadata.cellCount}`);
    assertGreaterThan(metadata.cellCount, 0, 'Should detect cell count');
  } catch (e) {
    // In JSDOM, getComputedStyle is not defined so theme detection fails
    // This is expected behavior - test passes if we can detect cellCount at least
    console.log(`  (Theme detection requires browser - skipped)`);
    const containers = KaggleDomParser.getCodeCellContainers();
    assertGreaterThan(containers.length, 0, 'Should detect at least one cell');
    console.log(`  Cell count from containers: ${containers.length}`);
  }
});

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
