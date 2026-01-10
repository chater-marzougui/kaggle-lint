/**
 * Rule Registry
 * Exports all lint rules and provides default rule set
 */

export * from './BaseRule';
export * from './UndefinedVariablesRule';
export * from './CapitalizationTyposRule';
export * from './DuplicateFunctionsRule';
export * from './EmptyCellsRule';
export * from './ImportIssuesRule';
export * from './IndentationErrorsRule';
export * from './MissingReturnRule';
export * from './RedefinedVariablesRule';
export * from './UnclosedBracketsRule';

import { BaseRule } from './BaseRule';
import { UndefinedVariablesRule } from './UndefinedVariablesRule';
import { CapitalizationTyposRule } from './CapitalizationTyposRule';
import { DuplicateFunctionsRule } from './DuplicateFunctionsRule';
import { EmptyCellsRule } from './EmptyCellsRule';
import { ImportIssuesRule } from './ImportIssuesRule';
import { IndentationErrorsRule } from './IndentationErrorsRule';
import { MissingReturnRule } from './MissingReturnRule';
import { RedefinedVariablesRule } from './RedefinedVariablesRule';
import { UnclosedBracketsRule } from './UnclosedBracketsRule';

/**
 * Default set of lint rules
 */
export const DEFAULT_RULES: BaseRule[] = [
  new UndefinedVariablesRule(),
  new CapitalizationTyposRule(),
  new DuplicateFunctionsRule(),
  new EmptyCellsRule(),
  new ImportIssuesRule(),
  new IndentationErrorsRule(),
  new MissingReturnRule(),
  new RedefinedVariablesRule(),
  new UnclosedBracketsRule(),
];
