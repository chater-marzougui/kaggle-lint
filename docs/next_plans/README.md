# next_plans — Roadmap to a fully usable kaggle-lint

Six milestones, ordered by dependency. Each folder contains a `plan.md` written for an agentic worker (Sonnet-class model) to expand and execute task-by-task using the superpowers workflow (`superpowers:executing-plans` or `superpowers:subagent-driven-development`).

Every plan references finding IDs (F1–F31) from [../review-findings.md](../review-findings.md) — read that file and [../architecture.md](../architecture.md) before starting any milestone. **Both were updated 2026-07-10** after an unplanned "lint-engine-consolidation" project (not part of this roadmap) landed between M3 and M4, deleting the handmade rule engine entirely and rewriting the flake8 engine — see the note at the end of `../architecture.md` and the addendum in `../review-findings.md`. **Milestone 4 Tasks 4–5 and Milestone 5 Task 1 target files/subsystems that no longer exist** — read their plan.md files' inline notes before expanding them with `superpowers:writing-plans`, don't execute them as originally written.

**For the human driving execution:** [DEVELOPER_PROMPTS.md](DEVELOPER_PROMPTS.md) is the session playbook — which model/effort per session type, when to `/clear`, per-milestone batch maps, and the paste-ready P1/P2/P3 prompts.

## Milestones

| # | Folder | Goal | Fixes | Depends on |
|---|--------|------|-------|------------|
| 1 | [milestone-1-stabilize-content-script](milestone-1-stabilize-content-script/plan.md) | Stop the infinite lint loop, fix settings race, single-source rule metadata, basic UI state sanity | F2, F6, F10, F11(close), F14, F26 | — |
| 2 | [milestone-2-reliable-code-extraction](milestone-2-reliable-code-extraction/plan.md) | MAIN-world extraction bridge, virtualized-cell store, auto re-lint on edit | F3, F7, F8, F25 | M1 |
| 3 | [milestone-3-working-flake8](milestone-3-working-flake8/plan.md) | Run Pyodide in an offscreen document, bundle flake8 wheels, message-based lint protocol | F1, F9, F13 | M1 (M2 recommended) |
| 4 | [milestone-4-config-and-build-hygiene](milestone-4-config-and-build-hygiene/plan.md) | Manifest cleanup, cut old-linter build dependency, dedupe types, single-source version | F15, F17–F23 (F16/F19/F20 now moot, see plan.md) | M1 |
| 5 | [milestone-5-tests-and-ci](milestone-5-tests-and-ci/plan.md) | Real lint job, extension test infra, working coverage | F4, F5, part of F24 (Task 1's 8 rule suites now moot, see plan.md) | M1 (M4 for lint scripts) |
| 6 | [milestone-6-ux-and-release](milestone-6-ux-and-release/plan.md) | React-pure overlay, popup robustness, honest README, old-linter removal, release | F11(full), F12, F24, F27–F31 | M1–M5 |

## Execution order

```
M1 ──► M2 ──► M3 ──► M6
  └──► M4 ──► M5 ──┘
```

- **M1 first, always.** Everything else builds on a content script that doesn't lint in a loop.
- M2 and M4 are independent of each other and can run in parallel (different files, minor overlap flagged in the plans).
- M3 needs M1; doing M2 first is recommended so Flake8 lints correctly-extracted code.
- M5 needs M4's per-package lint scripts for its CI task, but its test-writing tasks only need M1.
- M6 is last: it deletes `old-linter/` (allowed only after M4 cuts the webpack dependency) and prepares release.

## Rules for the executing agent

1. Read `docs/review-findings.md` and `docs/architecture.md` before Task 1 of any milestone.
2. Work on a feature branch per milestone (`milestone-1-stabilize`, etc.); commit per task with conventional-commit messages.
3. Verification gate for every task: `npm run type-check && npm run build` from repo root must pass; `npm test` where tests exist. Milestone plans add task-specific checks on top.
4. Manual verification of the extension (load `packages/extension/dist/` unpacked at `chrome://extensions`, open a Kaggle notebook in edit mode) is required at the end of M1, M2, M3, and M6. If you cannot drive a browser, stop and ask the user to verify — do not claim the milestone done.
5. Where a plan and reality disagree (Kaggle DOM changed, dependency versions moved), the review findings' *intent* wins; document the deviation in the milestone folder as `notes.md`.
6. The plans are milestone-level: expand each task with the superpowers:writing-plans conventions (failing test first where infra exists, minimal implementation, run, commit) before executing it.
