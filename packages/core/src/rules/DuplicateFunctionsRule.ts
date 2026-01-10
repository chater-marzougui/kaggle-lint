/**
 * Duplicate Function Names Rule
 * Detects functions with the same name defined multiple times
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

interface Definition {
  name: string;
  line: number;
  type: string;
}

export class DuplicateFunctionsRule extends BaseRule {
  name = 'duplicateFunctions';

  /**
   * Extracts function and class definitions with their line numbers
   * @param code - Python source code
   * @returns Array of definitions
   */
  private extractDefinitions(code: string): Definition[] {
    const definitions: Definition[] = [];
    const lines = code.split('\n');

    lines.forEach((line, lineIndex) => {
      let match = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (match) {
        definitions.push({
          name: match[1],
          line: lineIndex + 1,
          type: 'function',
        });
      }

      match = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(:]/.exec(line);
      if (match) {
        definitions.push({
          name: match[1],
          line: lineIndex + 1,
          type: 'class',
        });
      }

      match = /^\s*async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (match) {
        definitions.push({
          name: match[1],
          line: lineIndex + 1,
          type: 'async function',
        });
      }
    });

    return definitions;
  }

  /**
   * Runs the duplicate functions rule
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Lint context (unused in this rule)
   * @returns Array of lint errors
   */
  run(code: string, cellOffset: number = 0, context?: LintContext): LintError[] {
    const errors: LintError[] = [];
    const definitions = this.extractDefinitions(code);

    const nameMap = new Map<string, Definition[]>();

    definitions.forEach((def) => {
      if (!nameMap.has(def.name)) {
        nameMap.set(def.name, []);
      }
      nameMap.get(def.name)!.push(def);
    });

    nameMap.forEach((defs, name) => {
      if (defs.length > 1) {
        defs.slice(1).forEach((def) => {
          const firstDef = defs[0];
          errors.push({
            line: def.line + cellOffset,
            msg: `Duplicate ${def.type} name '${name}' (first defined at line ${
              firstDef.line + cellOffset
            })`,
            severity: 'warning',
            rule: this.name,
          });
        });
      }
    });

    return errors;
  }
}
