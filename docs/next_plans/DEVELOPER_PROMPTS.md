# DEVELOPER_PROMPTS — Session Playbook (model, effort, /clear, paste-ready prompts)

**For the user driving the M1–M6 execution.** Companion to [README.md](README.md) (roadmap + execution order) and [../review-findings.md](../review-findings.md) (the F1–F31 evidence base every session should read first). Each section tells you: which model, how much thinking effort, when to `/clear`, and the exact prompt to paste. Written 2026-07-09.

---

## 1. Ground rules

**When to `/clear` (or start a fresh session):**
- **Always** between milestones, and always before a whole-branch final review — a reviewer that watched the code being written is a biased reviewer.
- **Always** when switching session *type* (plan expansion → executing → reviewing), even inside one milestone.
- **Never** mid-task, and usually **not** between two tasks that share files (see the batch tables in §4 — M1's Tasks 1–2 both rewrite `ContentApp.tsx` effects; a warm session beats two cold reads of the same hook soup).
- If a session drifts (failed approach discarded, long debugging detour), `/clear` and restart from the checkpoint prompt — bad context is worse than no context.
- Trust auto-compaction for long execution sessions; manually `/clear` only at the boundaries above.

**Model + effort defaults:**

| Session type | Model | Thinking effort | Why |
|---|---|---|---|
| Milestone plan → full TDD plan expansion (P1) | Sonnet | **high** | The milestone plans pre-make the decisions; effort goes to verifying every file path/signature against real source |
| Task execution (subagent-driven) | Sonnet | **medium** | TDD + per-task review gates carry the quality |
| Gnarly single task (M2 T1 MAIN-world extractor, M3 T2 Pyodide runtime, M6 T1 overlay rewrite) | Sonnet **high** — escalate to Opus only if stuck twice | **high** | Escalate on the second failed attempt, not preemptively |
| Whole-branch final review (milestone gate, P3) | Opus high, or Sonnet **max** as budget reviewer for M4/M5 | **high/max** | The one place model strength demonstrably pays; M3 (WASM/CSP/messaging) and M2 (world-boundary code) deserve the stronger model |
| Docs refresh / README sweep | Sonnet or Haiku | **low** | Mechanical |
| Bug triage from a failed manual gate | Sonnet | **high** | Invoke `superpowers:systematic-debugging` |

**Standing instructions to include in every execution prompt:** the executor must NOT re-litigate decisions already made in the milestone plan or review findings; if reality contradicts a plan (Kaggle DOM changed, wheel version moved), it follows the plan's *intent*, records the deviation in that milestone's `notes.md`, and asks you only if the intent itself is impossible.

**The manual gates are yours.** This repo has no e2e scripts — M1 T6, M2 T5, M3 T6, and M6's release gate require a real Chrome + a logged-in Kaggle notebook. The model must **stop and hand you the checklist**, never claim the gate passed. (Playwright MCP is available for parts of it, but Kaggle login + extension loading makes the human path the default.) Budget ~10 minutes per gate.

## 2. The three paste-ready prompts

Current milestone plan: docs/next_plans/milestone-2-reliable-code-extraction/plan.md
Current branch: (not created yet — milestone-2-reliable-code-extraction)
Current N: 2
Current X–Y: —

**M1 status: merged to main (2026-07-09).** Commit `02405e0`. All 6 tasks complete (F2, F6, F10, F11-partial, F14, F26 resolved); manual gate (T6) passed — verified no re-lint loop after 5min idle, Ctrl+Shift+L and rule-toggle each fire exactly one lint, engine cache (F26) confirmed reused on Ctrl+Shift+L. Plan: `docs/superpowers/plans/2026-07-09-m1-stabilize-content-script.md`. Two out-of-scope issues surfaced during the manual gate, already tracked: content script double-injects into two frames (F17, manifest `all_frames`+multi-pattern match — Milestone 4) and DOM-scrape cell extraction is flaky/lossy (F3 — Milestone 2, i.e. next).

**P1 — Plan expansion (once per milestone):**
> Read docs/review-findings.md, docs/architecture.md, docs/next_plans/README.md, and docs/next_plans/milestone-〈N〉-〈slug〉/plan.md. The milestone plan's decisions are pre-made — do not re-open them, do not brainstorm. Use superpowers:writing-plans to expand it into a full TDD implementation plan at docs/superpowers/plans/〈date〉-m〈N〉-〈slug〉.md, verifying every file path, line reference, and signature the milestone plan names against real current source (the plans were written 2026-07-09; earlier milestones may have moved things — the F-finding intent wins, note deviations). Keep the milestone plan's manual verification gate as the final task, marked USER-GATE. Then stop for my review — do not start implementing. If the file will be large, write it by appending sections.

Current: Read docs/review-findings.md, docs/architecture.md, docs/next_plans/README.md, and docs/next_plans/milestone-2-reliable-code-extraction/plan.md. The milestone plan's decisions are pre-made — do not re-open them, do not brainstorm. Use superpowers:writing-plans to expand it into a full TDD implementation plan at docs/superpowers/plans/〈date〉-m2-reliable-code-extraction.md, verifying every file path, line reference, and signature the milestone plan names against real current source (the plans were written 2026-07-09; M1 already landed and touched ContentApp.tsx/PopupApp.tsx/Overlay.tsx/ui-components types — the F-finding intent wins, note deviations against the post-M1 source, not the pre-M1 snapshot review-findings.md describes). Keep the milestone plan's manual verification gate as the final task, marked USER-GATE. Then stop for my review — do not start implementing. If the file will be large, write it by appending sections.

**P2 — Execution (per batch; same session as P1 for the first batch is fine):**
> Execute Tasks 〈X–Y〉 of docs/superpowers/plans/〈plan file〉.md using superpowers:subagent-driven-development, on branch milestone-〈N〉-〈slug〉. Repo disciplines: never change the chrome.storage settings shape; rule metadata lives only in core's registry; no effect may list runLinter (or any changing callback) in its deps — use the runLinterRef pattern; content-script vs MAIN-world boundary is sacred (no DOM elements or page expandos across postMessage/runtime messaging); after every task run `npm run type-check && npm run build` plus `npm test` where suites exist, from repo root in Git Bash. Commit per task. Stop after Task 〈Y〉 with a status summary. When doing a review, tell the review agent to fix focused one-liner issues itself and report back; if the next task is a USER-GATE manual checklist, print the checklist and stop — do not claim it passed.

**P3 — Final review (fresh session, always cleared):**
> Fresh review, no prior context: branch milestone-〈N〉-〈slug〉 implements docs/next_plans/milestone-〈N〉-〈slug〉/plan.md. Read that plan, docs/review-findings.md, and docs/architecture.md, then do a whole-branch adversarial review (superpowers:requesting-code-review): run `npm ci && npm run lint && npm run type-check && npm run build && npm test` from a clean state, and hunt this repo's recurring bug classes — effect-dependency loops reintroduced (the F2 class), isolated-world violations (page expandos, script-tag loading, DOM elements serialized across messaging), rule-metadata or type duplication creeping back (F14/F15 class), settings-shape drift, manifest/webpack copy-config breakage (build passes but dist is missing a file — check dist contents, not just exit codes), and stale README/docs claims (F24 class). Verify each finding the milestone claims to fix is actually fixed at its file:line. Report findings ranked; fix Criticals; update docs/architecture.md and the review-findings summary table ("resolved in M〈N〉"); end with the manual-gate checklist for me.

## 3. Milestone flow (repeat per milestone)

1. Fresh session → **P1** (Sonnet, high). Skim the produced plan yourself (10 min: task count sane? USER-GATE final task present? line refs verified?).
2. Same session, no clear → **P2** for batch 1 (drop effort to medium).
3. `/clear` between batches when the next batch changes subsystem (tables in §4); stay warm otherwise.
4. Last code batch done → run the **manual gate yourself** from the checklist the executor printed. Failures → fresh Sonnet-high session with the §6 debug prompt.
5. Gate green → `/clear` → **P3** on the stronger model.
6. Merge per superpowers:finishing-a-development-branch. Update the "Current" lines in §2 of this file.

## 4. Per-milestone batch & clear map

Task numbers are the milestone plans' own (they may shift after P1 expansion — update this file in the same session if they do).

**M1 — stabilize-content-script (6 tasks):**
- B1 = T1–2 (lint-loop fix + settings race: same `ContentApp.tsx` effects, definitely warm)
- B2 = T3 (rule registry — core + both React apps; solo, it's the cross-package one)
- B3 = T4–5 (overlay close + flake8 status: both small ui-components changes, warm)
- GATE = T6 (yours: console shows exactly one lint, no repeat over 60 s)

**M2 — reliable-code-extraction (5 tasks):**
- B1 = T1–2 (MAIN-world extractor + bridge client: two halves of one protocol, definitely warm; **high effort** — this is world-boundary code)
- B2 = T3–4 (cell-store merge + MutationObserver: both ContentApp, warm)
- GATE = T5 (yours: needs a >30-cell notebook; test the scroll-away case specifically)

**M3 — working-flake8 (6 tasks):**
- B1 = T1–2 (background/offscreen scaffolding + Pyodide runtime; **high effort**, the CSP/offscreen part is where models guess wrong — make it read Chrome's offscreen docs via context7 if unsure)
- B2 = T3 (wheels: downloads + micropip URLs; verify dist contents, not just build exit)
- B3 = T4–5 (core shim extraction + content-script client — **must land together**, T4 breaks the build until T5's import swap; never clear between them)
- GATE = T6 (yours: watch the offscreen document's Network tab — zero PyPI/CDN requests is the acceptance)

**M4 — config-and-build-hygiene (6 tasks, all independently revertible):**
- B1 = T1–3 (manifest + popup.css move + version single-sourcing: all config, one warm session)
- B2 = T4–5 (type dedup + LintEngine typed hooks: both core-types territory, warm)
- B3 = T6 (toolchain: npm install churn + the ui-components packaging decision — solo so the decision gets its own review)
- No manual gate; P3 + a 2-minute unpacked-load sanity check suffices.

**M5 — tests-and-ci (4 tasks):**
- B1 = T1 (8 rule suites — big mechanical batch; **expect it to find real rule bugs**, the plan says fix them in-task; medium effort is fine, the tests are the reviewer)
- B2 = T2–3 (engine coverage + extension jsdom infra)
- B3 = T4 (CI repair — needs branch pushes to verify; keep the deliberate-red-then-green check)
- No manual gate.

**M6 — ux-and-release (6 tasks):**
- B1 = T1 (overlay React rewrite — solo, **high effort**, it's the one with drag/animation subtlety)
- B2 = T2–3 (debug gate + popup ping: small, warm)
- B3 = T4–5 (docs truth pass + old-linter deletion — deletion preconditions are greps, cheap to verify)
- B4 = T6 (release: version bump, tag, workflow) — **stops for you twice**: the condensed full-E2E manual gate, and explicit permission before pushing the tag (outward-facing).

**Parallel-branch note:** M2 and M4 can run as parallel branches (roadmap graph), but both touch `manifest.json` and `ContentApp.tsx` — whichever lands second rebases and re-runs its verification before P3.

## 5. Cheap-executor option (DeepSeek inside Claude Code)

Same mechanism as other repos: Anthropic-compatible endpoint, harness intact. Use ONLY for the execution middle; **P1 and P3 stay on real Claude, always.**

```powershell
$env:ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN = "sk-<deepseek-key>"
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
$env:ANTHROPIC_MODEL = "deepseek-v4-pro"
$env:CLAUDE_CODE_SUBAGENT_MODEL = "deepseek-v4-pro"
$env:MAX_THINKING_TOKENS = "32000"
claude
```

**Repo-specific routing:** DeepSeek-eligible batches are the mechanical ones — M1 B3, M4 B1/B2, M5 B1/B2, M6 B2/B3. **Claude-only:** M2 B1 (world-boundary), M3 B1/B3 (offscreen/CSP + the coupled-refactor pair), M6 B1 (overlay), and every USER-GATE-adjacent batch's review. Two extra cautions here versus a repo with e2e scripts:

1. **This repo's automated verification is thin** (build + type-check + growing-but-partial tests, no e2e). DeepSeek's weak spot is confident false claims (~10× Claude's rate), and there is no script to catch "I verified the overlay works." Anything a DeepSeek session *claims* about runtime behavior is unverified until your manual gate — treat its gates-less claims as untested, always.
2. Append to P2: "After EVERY task run `npm run type-check && npm run build && npm test` and additionally list the files changed in `packages/extension/dist/` (`git status` won't show dist — use the build log or `ls -lt`). If the same task fails twice, STOP and report the exact failure; do not improvise around the plan."

Pilot rule applies: first DeepSeek batch (suggest M4 B1) gets a Sonnet spot-review before adopting it for the rest.

## 6. Quick reference card

- Stuck twice on the same failure → stop, `superpowers:systematic-debugging`; still stuck → `/clear` + escalate model. Prompt: "Task 〈n〉 of 〈plan〉 fails: 〈exact error〉. Read the task, docs/review-findings.md 〈relevant F-ids〉, and the failing code; debug systematically — no fixes before a confirmed root cause."
- Windows reminders the executor will forget: run npm scripts from **Git Bash** (package `clean` scripts use `rm -rf`; core's build uses `copyfiles` which is fine anywhere); PowerShell 5.1 has no `&&` — another reason for Git Bash; loading the unpacked extension always points at `packages/extension/dist/`, never the repo root.
- Extension-specific traps: a green webpack build does **not** mean dist is complete (CopyPlugin patterns fail silent-ish — check `dist/` contents after manifest/webpack changes); `chrome.storage.sync` persists across reloads — test settings changes with a fresh profile or after clearing storage when behavior looks sticky; content-script changes need an extension **reload** at `chrome://extensions` *and* a page refresh.
- Before merging anything: `superpowers:verification-before-completion` — evidence, not claims; for this repo that includes your own manual gate sign-off.
- Keep this file honest: when a batch grouping or task numbering proves wrong in practice, edit this file in the same session.
