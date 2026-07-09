/**
 * Rule Registry
 * Single source of truth for rule metadata: id, display name, description,
 * default-enabled state, and the factory that builds a rule instance.
 */

import { LintRule } from '../types';
import { UndefinedVariablesRule } from './UndefinedVariablesRule';
import { CapitalizationTyposRule } from './CapitalizationTyposRule';
import { DuplicateFunctionsRule } from './DuplicateFunctionsRule';
import { ImportIssuesRule } from './ImportIssuesRule';
import { IndentationErrorsRule } from './IndentationErrorsRule';
import { EmptyCellsRule } from './EmptyCellsRule';
import { UnclosedBracketsRule } from './UnclosedBracketsRule';
import { RedefinedVariablesRule } from './RedefinedVariablesRule';
import { MissingReturnRule } from './MissingReturnRule';

export interface RuleInfo {
  id: string;
  displayName: string;
  description: string;
  defaultEnabled: boolean;
  create: () => LintRule;
}

export const RULE_REGISTRY: RuleInfo[] = [
  {
    id: 'undefinedVariables',
    displayName: 'Undefined Variables',
    description: 'Detect usage of undefined variables',
    defaultEnabled: true,
    create: () => new UndefinedVariablesRule(),
  },
  {
    id: 'capitalizationTypos',
    displayName: 'Capitalization Typos',
    description: 'Detect true/false/none instead of True/False/None',
    defaultEnabled: true,
    create: () => new CapitalizationTyposRule(),
  },
  {
    id: 'duplicateFunctions',
    displayName: 'Duplicate Functions',
    description: 'Detect duplicate function definitions',
    defaultEnabled: true,
    create: () => new DuplicateFunctionsRule(),
  },
  {
    id: 'importIssues',
    displayName: 'Import Issues',
    description: 'Detect wildcard and duplicate imports',
    defaultEnabled: true,
    create: () => new ImportIssuesRule(),
  },
  {
    id: 'indentationErrors',
    displayName: 'Indentation Errors',
    description: 'Detect missing indentation after colons',
    defaultEnabled: true,
    create: () => new IndentationErrorsRule(),
  },
  {
    id: 'emptyCells',
    displayName: 'Empty Cells',
    description: 'Detect empty or comment-only cells',
    defaultEnabled: true,
    create: () => new EmptyCellsRule(),
  },
  {
    id: 'unclosedBrackets',
    displayName: 'Unclosed Brackets',
    description: 'Detect unclosed parentheses, brackets, braces',
    defaultEnabled: true,
    create: () => new UnclosedBracketsRule(),
  },
  {
    id: 'redefinedVariables',
    displayName: 'Redefined Built-ins',
    description: 'Detect shadowing of built-in names',
    defaultEnabled: true,
    create: () => new RedefinedVariablesRule(),
  },
  {
    id: 'missingReturn',
    displayName: 'Missing Return',
    description: 'Detect functions that might need a return statement',
    defaultEnabled: true,
    create: () => new MissingReturnRule(),
  },
];

export function defaultRuleToggles(): Record<string, boolean> {
  return Object.fromEntries(RULE_REGISTRY.map((info) => [info.id, info.defaultEnabled]));
}

export function createEnabledRules(toggles: Record<string, boolean>): LintRule[] {
  return RULE_REGISTRY.filter((info) => toggles[info.id] === true).map((info) => info.create());
}
