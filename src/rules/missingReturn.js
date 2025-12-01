/**
 * Missing Return Rule
 * Detects functions that appear to be non-void but don't have a return statement
 */

const MissingReturnRule = (function () {
  'use strict';

  /**
   * Extracts function definitions with their bodies
   * @param {string} code - Python source code
   * @returns {Array<{name: string, startLine: number, endLine: number, body: string, hasReturn: boolean}>}
   */
  function extractFunctions(code) {
    const functions = [];
    const lines = code.split('\n');
    let currentFunc = null;
    let funcIndent = 0;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      const funcMatch = /^(\s*)def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/.exec(line);
      if (funcMatch) {
        if (currentFunc) {
          currentFunc.endLine = lineNum - 1;
          currentFunc.hasReturn = checkHasReturn(currentFunc.body);
          functions.push(currentFunc);
        }

        currentFunc = {
          name: funcMatch[2],
          startLine: lineNum,
          endLine: lineNum,
          body: '',
          params: funcMatch[3],
          indent: funcMatch[1].length,
          bodyIndent: null
        };
        funcIndent = funcMatch[1].length;
        return;
      }

      if (currentFunc) {
        const lineIndentMatch = line.match(/^(\s*)/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[1].length : 0;
        const trimmed = line.trim();

        if (trimmed === '') {
          currentFunc.body += line + '\n';
          return;
        }

        if (currentFunc.bodyIndent === null && lineIndent > currentFunc.indent) {
          currentFunc.bodyIndent = lineIndent;
        }

        if (currentFunc.bodyIndent !== null && lineIndent >= currentFunc.bodyIndent) {
          currentFunc.body += line + '\n';
          currentFunc.endLine = lineNum;
        } else if (lineIndent <= currentFunc.indent && trimmed !== '') {
          currentFunc.hasReturn = checkHasReturn(currentFunc.body);
          functions.push(currentFunc);
          currentFunc = null;
        }
      }
    });

    if (currentFunc) {
      currentFunc.hasReturn = checkHasReturn(currentFunc.body);
      functions.push(currentFunc);
    }

    return functions;
  }

  /**
   * Checks if function body has a return statement
   * @param {string} body - Function body
   * @returns {boolean}
   */
  function checkHasReturn(body) {
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        continue;
      }
      if (/^\s*return\s/.test(line) || /^\s*return$/.test(line)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if function appears to compute a value (non-void intent)
   * @param {Object} func - Function object
   * @returns {boolean}
   */
  function looksNonVoid(func) {
    const body = func.body;

    const computationPatterns = [
      /result\s*=/,
      /total\s*=/,
      /sum\s*=/,
      /count\s*=/,
      /output\s*=/,
      /value\s*=/,
      /answer\s*=/,
      /res\s*=/,
      /ret\s*=/,
      /data\s*=/,
      /\+=|\-=|\*=|\/=/
    ];

    for (const pattern of computationPatterns) {
      if (pattern.test(body)) {
        return true;
      }
    }

    const funcNamePatterns = [
      /^get_/,
      /^calculate_/,
      /^compute_/,
      /^find_/,
      /^create_/,
      /^build_/,
      /^make_/,
      /^generate_/,
      /^parse_/,
      /^convert_/,
      /^transform_/,
      /^extract_/,
      /^fetch_/,
      /^load_/,
      /^read_/
    ];

    for (const pattern of funcNamePatterns) {
      if (pattern.test(func.name)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if function is a special method that doesn't need return
   * @param {string} name - Function name
   * @returns {boolean}
   */
  function isSpecialMethod(name) {
    const specialMethods = new Set([
      '__init__', '__del__', '__setattr__', '__delattr__',
      '__setitem__', '__delitem__', '__enter__', '__exit__',
      'setUp', 'tearDown', 'setUpClass', 'tearDownClass',
      'setup', 'teardown', 'main'
    ]);
    return specialMethods.has(name);
  }

  /**
   * Runs the missing return rule
   * @param {string} code - Python source code
   * @param {number} cellOffset - Line offset for cell
   * @returns {Array<{line: number, msg: string, severity: string}>}
   */
  function run(code, cellOffset = 0) {
    const errors = [];
    const functions = extractFunctions(code);

    functions.forEach(func => {
      if (isSpecialMethod(func.name)) {
        return;
      }

      if (!func.hasReturn && looksNonVoid(func)) {
        errors.push({
          line: func.startLine + cellOffset,
          msg: `Function '${func.name}' appears to compute a value but has no return statement`,
          severity: 'warning'
        });
      }
    });

    return errors;
  }

  return { run };
})();

if (typeof window !== 'undefined') {
  window.MissingReturnRule = MissingReturnRule;
}
