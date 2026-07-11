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

## Further post-plan work (same session, after the three deviations above)

All applied directly to `main`, each independently pipeline-verified and pushed:

- Popup redesign (segmented engine-pill selector, overlay-visibility toggle switch replacing Re-lint Now/Toggle Overlay, rounded card) — dispatched to a subagent, reviewed, merged.
- Overlay severity tabs (replacing the passive summary bar) with real Lucide-derived icons replacing the emoji set; error-list cards restyled to a two-line layout with an inset-box-shadow severity accent (not a full-card tint, and separately not the in-editor `.cm-line` markers — two different asks the user corrected me on when I initially touched the wrong one).
- Lint-result cache in `EngineClient` (in-memory, whole-notebook-keyed — dispatched to a subagent per explicit user request; not per-cell, since this project deliberately lints the whole notebook as one concatenated source for cross-cell scoping, so per-cell caching would risk stale results).
- Theme detection fix (F-day-1 bug): live DOM probing (user-provided) showed the old `theme--dark`/`data-theme` class checks were dead — real signal is `document.body`'s computed background color, now read with a simple average-brightness threshold plus a delayed catch-up check for a mount-timing race, plus a debug-gated raw-value log for future diagnosis.
- Default ignore-codes shipped for both engines: flake8 gets `E221, E501, E241, W293, E302, E402`, ruff gets `E402` — all common, mostly-intentional notebook patterns that were drowning out real findings (fresh-install defaults only, `chrome.storage.sync` always wins once a user has saved settings).
- Ruff crash fix: a typo'd ignore-code ("debu") reached ruff's `Workspace` config unvalidated and threw "Unknown rule selector," breaking the whole lint (flake8 silently no-ops on the same input instead). `parseIgnoreCodes` now filters to the universal letters-then-digits code shape before either engine sees the list, and logs what it dropped.

## Still outstanding

- **README screenshots/GIFs + expanded documentation**: requested by the user, not yet started — genuinely blocked on the user's input (real product screenshots can't be fabricated; asked how they want to source them before starting).

## Task 6 Step 5 (manual E2E gate): user-confirmed complete

User tested live against a real Kaggle notebook and confirmed working. Proceeding to Step 6 (STOP for explicit tag/push confirmation) and Steps 7–8 (tag, push, verify the release workflow, smoke-test the published artifact) per the plan.
