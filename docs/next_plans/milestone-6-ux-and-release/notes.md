# Milestone 6 notes

## Tasks 2–6 (steps 1–4) execution

Expanded into `docs/superpowers/plans/2026-07-10-m6-ux-and-release.md` and executed via `superpowers:subagent-driven-development`, Tasks 2/3/4/5 in parallel git worktrees (disjoint files, user-requested parallelization), Task 6 sequentially afterward. All five task-level reviews and the final whole-branch review passed; see the plan file and `.superpowers/sdd/progress.md`'s git history for the full ledger. No deviations from the plan's own text during that pass beyond what the plan itself already flagged as expected (parallel-branch test-count mismatches during individual task execution, resolved once all branches merged).

## Post-plan deviations (user request, after the plan's Tasks 2–6 steps 1–4 landed)

Three changes requested directly by the user, outside the formal plan's task list, applied straight to `main` (no new worktree — small, well-specified, non-conflicting with anything still open):

1. **Runtime debug-logging toggle** (extends F27/Task 2): typing `debug` into the popup's per-engine ignore-codes field now flips on debug logging at runtime (`logger.ts`'s `setDebugEnabled`, an override on top of the build-time `DEBUG` flag) without a rebuild — the token is stripped before the code list reaches the linter engine. New pure module `packages/extension/src/content/parseIgnoreCodes.ts` (kept separate from `ContentApp.tsx` deliberately, same reason `contentScriptBridge.ts` was split out in Task 3 — importing the React component file pulls in `@kaggle-lint/ui-components`'s ESM `dist`, which Jest can't transform).
2. **Rename**: "Kaggle Python Linter" → "Kaggle Linter" everywhere user-facing (manifest name/title, popup title, overlay header text, package descriptions, README/docs titles). Historical plan/review docs under `docs/next_plans/` and `docs/superpowers/` were deliberately left untouched — they're the historical record, not living docs.
3. **Version: v1.0.0, not v2.1.0** — this is the extension's first-ever published release, so the user chose to start the public version line at `1.0.0` rather than continue the pre-publication `2.x` internal history the migration/consolidation work had been using (no version had actually shipped before now). Re-bumped all four `package.json`s + `package-lock.json` + `docs/architecture.md`'s two version markers from the already-applied `2.1.0` down to `1.0.0` — the milestone plan's own text (and `docs/next_plans/milestone-6-ux-and-release/plan.md`'s Task 6 checklist) still says `2.1.0`; left as-is per the established convention of not editing a milestone's original prescriptive text, deviation recorded here instead.

Full pipeline (`lint && type-check && build && test`) re-verified green after each of the three changes; extension suite grew from 16/4 to 22/5 (added `logger.test.ts` cases for the runtime override, plus `parseIgnoreCodes.test.ts`). README's test-count claim updated to match.

One incidental cleanup found and fixed during this pass, unrelated to any of the three requests: `old-linter/`'s git-tracked content was already removed in Task 5, but a leftover `node_modules`/`dist` (gitignored build artifacts from before the deletion, never git-tracked, so `git merge` never touched them when Task 5's branch was merged to `main`) was still sitting on disk. Removed with a plain `rm -rf old-linter` after confirming `git status --porcelain` showed the whole directory as untracked cruft with zero tracked content inside it.

## Still outstanding

- **Task 6 steps 5–8**: manual browser E2E gate, then `git tag v1.0.0` / push / release-workflow confirmation / artifact smoke-test. Requires the user directly, not delegatable — this is the plan's own designated USER-GATE.
- **README screenshots/GIFs + expanded documentation**: requested by the user, not yet started — genuinely blocked on the user's input (real product screenshots can't be fabricated; asked how they want to source them before starting).
