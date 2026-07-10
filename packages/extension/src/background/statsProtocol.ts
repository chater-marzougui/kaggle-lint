/**
 * Message the content script sends after every lint so the background
 * worker can reflect totals on the toolbar badge. Kept separate from
 * engine/protocol.ts: this is engine-agnostic (a total is a total
 * regardless of which engine produced it), and chrome.action (the badge
 * API) is only reachable from a background/extension-page context, never
 * a content script — hence routing through here at all.
 */

export const LINT_STATS = 'LINT_STATS' as const;

export interface LintStatsMessage {
  type: typeof LINT_STATS;
  errors: number;
  warnings: number;
}
