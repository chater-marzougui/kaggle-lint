# next_plans — Roadmap to a fully usable kaggle-lint

Milestones ordered by dependency. Each folder contains a `plan.md` written for an agentic worker (Sonnet-class model) to expand and execute task-by-task using the superpowers workflow (`superpowers:executing-plans` or `superpowers:subagent-driven-development`).

Every plan references finding IDs (F1–F34) from [../review-findings.md](../review-findings.md) — read that file and [../architecture.md](../architecture.md) before starting any milestone.

**History (updated 2026-07-10):** M1–M3 are **done and merged to main**, plus an unplanned "lint-engine-consolidation" project between M3 and M4 that deleted the handmade rule engine and added ruff (see the addendum in `../review-findings.md` and the status paragraphs in [DEVELOPER_PROMPTS.md](DEVELOPER_PROMPTS.md)). A post-consolidation re-review (2026-07-10, second addendum in review-findings) confirmed three live bugs (F32 duplicate overlay, F33 wrong-position scroll, F34 phantom deleted-cell errors) → **new Milestone 7**, and added a user-experience feature milestone → **new Milestone 8** (which absorbs M6's old Task 1, the overlay React rewrite). **Milestone 4 Tasks 4–5 and Milestone 5 Task 1 target files that no longer exist** — read their plan.md inline notes before expanding.

**For the human driving execution:** [DEVELOPER_PROMPTS.md](DEVELOPER_PROMPTS.md) is the session playbook — which model/effort per session type, when to `/clear`, per-milestone batch maps, and the paste-ready P1/P2/P3 prompts.

## Milestones

| #   | Folder                                                                                     | Goal                                                                                                             | Fixes                                     | Status / Depends on                                                                           |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | [milestone-1-stabilize-content-script](milestone-1-stabilize-content-script/plan.md)       | Stop the infinite lint loop, settings race, UI state sanity                                                      | F2, F6, F10, F11(close), F14, F26         | ✅ merged 2026-07-09                                                                          |
| 2   | [milestone-2-reliable-code-extraction](milestone-2-reliable-code-extraction/plan.md)       | MAIN-world extraction bridge, cell store, re-lint on edit                                                        | F3, F7, F8, F25                           | ✅ merged 2026-07-09                                                                          |
| 3   | [milestone-3-working-flake8](milestone-3-working-flake8/plan.md)                           | Pyodide in offscreen doc, bundled wheels, lint protocol                                                          | F1, F9, F13                               | ✅ merged 2026-07-09                                                                          |
| —   | lint-engine-consolidation (unplanned)                                                      | Delete handmade engine; real flake8 API; add ruff; ignore-codes UI                                               | F14/F16/F19/F20/F31 mooted or resolved    | ✅ merged 2026-07-10                                                                          |
| 7   | [milestone-7-single-frame-and-navigation](milestone-7-single-frame-and-navigation/plan.md) | One overlay in the right frame; exact-line click-to-scroll; deleted cells shed errors                            | F32, F33, F34                             | ✅ merged 2026-07-10                                                                          |
| 8   | [milestone-8-user-experience](milestone-8-user-experience/plan.md)                         | React-pure overlay (ex-M6 T1), ruff default, in-editor line markers, one-click ignore, badges, panel persistence | F11(full), F29 + features                 | ✅ merged 2026-07-10 (Task 7 manual gate passed — see notes.md for the live bugs found/fixed) |
| 4   | [milestone-4-config-and-build-hygiene](milestone-4-config-and-build-hygiene/plan.md)       | Manifest cleanup, cut old-linter dep, dedupe types, single-source version                                        | F15, F17, F18, F21–F23 (F16/F19/F20 moot) | ✅ merged 2026-07-10 (Task 5 skipped as moot — see plan/notes)                                |
| 5   | [milestone-5-tests-and-ci](milestone-5-tests-and-ci/plan.md)                               | Real lint job, extension test infra, honest coverage                                                             | F4, F5, part of F24 (Task 1 moot)         | **next** — M4's lint scripts landed, no blockers                                              |
| 6   | [milestone-6-ux-and-release](milestone-6-ux-and-release/plan.md)                           | Popup robustness, honest README, old-linter removal, release                                                     | F12, F24, F27–F30 (T1 moved to M8)        | M4, M5, M7, M8                                                                                |

## Execution order

```
[M1 ✅ ─► M2 ✅ ─► M3 ✅ ─► consolidation ✅ ─► M7 ✅ ─► M8 ✅ ─► M4 ✅] ─► M5 ─► M6 (release)
```

- **M7 first** — both remaining user-visible bugs (duplicate overlay, wrong-position scroll) live there, and M8's features need its uuid/scroll plumbing.
- **M8 before the hygiene train** — user-visible value first; its Task 1 (overlay rewrite) is the base the features build on, which is why it was moved out of M6.
- M4 and M5 are hygiene, order between them as originally planned (M5's CI task wants M4's lint scripts).
- M6 stays last: docs truth pass, old-linter deletion (needs M4 Task 2), release tag.
- M4 Task 1 (manifest) and M7 Task 1 both reason about `content_scripts` — M7's runtime gate is the F32 fix; M4's cleanup is orthogonal (CDN match, WAR, permissions). Whichever lands second re-verifies frame behavior.

## Rules for the executing agent

1. Read `docs/review-findings.md` (including both addenda) and `docs/architecture.md` before Task 1 of any milestone.
2. Work on a feature branch per milestone (`milestone-7-single-frame`, etc.); commit per task with conventional-commit messages.
3. Verification gate for every task: `npm run type-check && npm run build` from repo root must pass; `npm test` where tests exist. Milestone plans add task-specific checks on top.
4. Manual verification of the extension (load `packages/extension/dist/` unpacked at `chrome://extensions`, open a Kaggle notebook in edit mode) is required at the end of M7, M8, and M6. If you cannot drive a browser, stop and hand the user the checklist — do not claim the milestone done.
5. Where a plan and reality disagree (Kaggle DOM changed, Jupyter API shape differs from the plan's expected sketch), the finding's _intent_ wins; document the deviation in the milestone folder as `notes.md`. Live-probing `window.jupyterapp` shapes on a real notebook is the established method (M2 precedent).
6. The plans are milestone-level: expand each task with the superpowers:writing-plans conventions (failing test first where infra exists, minimal implementation, run, commit) before executing it.
7. Bridge protocol changes are additive-only; settings storage shape is frozen.
