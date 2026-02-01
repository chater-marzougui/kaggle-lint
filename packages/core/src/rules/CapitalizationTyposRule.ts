/**
 * Capitalization Typos Rule
 * Detects potential typos from incorrect capitalization of known names
 */

import { BaseRule } from './BaseRule';
import { LintError, LintContext } from '../types';

export class CapitalizationTyposRule extends BaseRule {
  name = 'capitalizationTypos';

  // Names that should be excluded from capitalization checks
  // (e.g., typing module types that are intentionally capitalized)
  private readonly EXCLUDED_NAMES = new Set([
    'List',
    'Dict',
    'Set',
    'Tuple',
    'Optional',
    'Union',
    'Any',
    'Callable',
    'Sequence',
    'Iterable',
    'Mapping',
    'Type',
    'ClassVar',
    'Final',
    'Literal',
    'TypeVar',
    'Generic',
    'Protocol',
  ]);

  private readonly COMMON_NAMES: Record<string, string> = {
    true: 'True',
    false: 'False',
    none: 'None',
    self: 'self',
    cls: 'cls',
    numpy: 'numpy',
    pandas: 'pandas',
    matplotlib: 'matplotlib',
    tensorflow: 'tensorflow',
    pytorch: 'pytorch',
    sklearn: 'sklearn',
    scipy: 'scipy',
    seaborn: 'seaborn',
    print: 'print',
    len: 'len',
    range: 'range',
    list: 'list',
    dict: 'dict',
    set: 'set',
    tuple: 'tuple',
    str: 'str',
    int: 'int',
    float: 'float',
    bool: 'bool',
    type: 'type',
    isinstance: 'isinstance',
    hasattr: 'hasattr',
    getattr: 'getattr',
    setattr: 'setattr',
    enumerate: 'enumerate',
    zip: 'zip',
    map: 'map',
    filter: 'filter',
    sorted: 'sorted',
    reversed: 'reversed',
    sum: 'sum',
    min: 'min',
    max: 'max',
    abs: 'abs',
    round: 'round',
    open: 'open',
    read: 'read',
    write: 'write',
    close: 'close',
    append: 'append',
    extend: 'extend',
    insert: 'insert',
    remove: 'remove',
    pop: 'pop',
    index: 'index',
    count: 'count',
    sort: 'sort',
    reverse: 'reverse',
    copy: 'copy',
    clear: 'clear',
    keys: 'keys',
    values: 'values',
    items: 'items',
    get: 'get',
    update: 'update',
    dataframe: 'DataFrame',
    series: 'Series',
    array: 'array',
    ndarray: 'ndarray',
    valueerror: 'ValueError',
    typeerror: 'TypeError',
    keyerror: 'KeyError',
    indexerror: 'IndexError',
    attributeerror: 'AttributeError',
    importerror: 'ImportError',
    runtimeerror: 'RuntimeError',
    exception: 'Exception',
    filenotfounderror: 'FileNotFoundError',
    zerodivisionerror: 'ZeroDivisionError',
    assertionerror: 'AssertionError',
  };

  /**
   * Builds a lowercase lookup map from code-defined names
   * @param code - Python source code
   * @returns Map of lowercase to actual names
   */
  private buildDefinedNamesMap(code: string): Map<string, string> {
    const map = new Map<string, string>();
    const lines = code.split('\n');

    lines.forEach((line) => {
      let match = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (match) {
        map.set(match[1].toLowerCase(), match[1]);
      }

      match = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(line);
      if (match) {
        map.set(match[1].toLowerCase(), match[1]);
      }

      match = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/.exec(line);
      if (match && !/^\s*(if|while|for|with|except|elif)/.test(line)) {
        map.set(match[1].toLowerCase(), match[1]);
      }
    });

    return map;
  }

  /**
   * Runs the capitalization typos rule
   * @param code - Python source code
   * @param cellOffset - Line offset for cell
   * @param context - Lint context (unused in this rule)
   * @returns Array of lint errors
   */
  run(
    code: string,
    cellOffset: number = 0,
    _context?: LintContext
  ): LintError[] {
    const errors: LintError[] = [];
    const lines = code.split('\n');
    const definedNames = this.buildDefinedNamesMap(code);

    const allKnownNames = new Map<string, string>([
      ...Object.entries(this.COMMON_NAMES).map(
        ([k, v]) => [k.toLowerCase(), v] as [string, string]
      ),
      ...definedNames,
    ]);

    lines.forEach((line, lineIndex) => {
      if (/^\s*#/.test(line)) {
        return;
      }

      let processedLine = line.replace(/#.*$/, '');
      processedLine = processedLine.replace(
        /(["'])(?:(?!\1|\\).|\\.)*\1/g,
        '""'
      );

      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let match;

      while ((match = identifierPattern.exec(processedLine)) !== null) {
        const name = match[1];
        const lowerName = name.toLowerCase();
        const beforeChar = processedLine[match.index - 1];

        // Skip names after a dot (method/attribute names)
        if (beforeChar === '.') {
          continue;
        }

        // Skip excluded names (like typing module types)
        if (this.EXCLUDED_NAMES.has(name)) {
          continue;
        }

        if (allKnownNames.has(lowerName)) {
          const correctName = allKnownNames.get(lowerName);
          if (
            name !== correctName &&
            name.toLowerCase() === correctName!.toLowerCase()
          ) {
            errors.push({
              line: lineIndex + 1 + cellOffset,
              msg: `Possible capitalization typo: '${name}' should be '${correctName}'`,
              severity: 'warning',
              rule: this.name,
            });
          }
        }
      }
    });

    return errors;
  }
}
