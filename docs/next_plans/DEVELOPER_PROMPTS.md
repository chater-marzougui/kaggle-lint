# DEVELOPER_PROMPTS — Session Playbook (model, effort, /clear, paste-ready prompts)

**For the user driving the milestone execution (remaining: M7 → M8 → M4 → M5 → M6).** Companion to [README.md](README.md) (roadmap + execution order) and [../review-findings.md](../review-findings.md) (the F1–F34 evidence base every session should read first). Each section tells you: which model, how much thinking effort, when to `/clear`, and the exact prompt to paste. Written 2026-07-09; roadmap rebased 2026-07-10 after M1–M3 + consolidation landed.

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
| Gnarly single task (M7 T3 bridge scroll, M8 T1 overlay rewrite, M8 T3 line markers) | Sonnet **high** — escalate to Opus only if stuck twice | **high** | Escalate on the second failed attempt, not preemptively |
| Whole-branch final review (milestone gate, P3) | Opus high, or Sonnet **max** as budget reviewer for M4/M5 | **high/max** | The one place model strength demonstrably pays; M3 (WASM/CSP/messaging) and M2 (world-boundary code) deserve the stronger model |
| Docs refresh / README sweep | Sonnet or Haiku | **low** | Mechanical |
| Bug triage from a failed manual gate | Sonnet | **high** | Invoke `superpowers:systematic-debugging` |

**Standing instructions to include in every execution prompt:** the executor must NOT re-litigate decisions already made in the milestone plan or review findings; if reality contradicts a plan (Kaggle DOM changed, wheel version moved), it follows the plan's *intent*, records the deviation in that milestone's `notes.md`, and asks you only if the intent itself is impossible.

**The manual gates are yours.** This repo has no e2e scripts — M7 T5, M8 T7, and M6's release gate require a real Chrome + a logged-in Kaggle notebook. The model must **stop and hand you the checklist**, never claim the gate passed. (Playwright MCP is available for parts of it, but Kaggle login + extension loading makes the human path the default.) Budget ~10 minutes per gate.

## 2. The three paste-ready prompts

Current milestone plan: docs/next_plans/milestone-7-single-frame-and-navigation/plan.md
Current branch: (not created yet — milestone-7-single-frame)
Current N: 7
Current X–Y: —

**M1 status: merged to main (2026-07-09).** Commit `02405e0`. All 6 tasks complete (F2, F6, F10, F11-partial, F14, F26 resolved); manual gate (T6) passed — verified no re-lint loop after 5min idle, Ctrl+Shift+L and rule-toggle each fire exactly one lint, engine cache (F26) confirmed reused on Ctrl+Shift+L. Plan: `docs/superpowers/plans/2026-07-09-m1-stabilize-content-script.md`. Two out-of-scope issues surfaced during the manual gate, already tracked: content script double-injects into two frames (F17, manifest `all_frames`+multi-pattern match — Milestone 4) and DOM-scrape cell extraction is flaky/lossy (F3 — Milestone 2, i.e. next).

**M2 status: merged to main (2026-07-09).** Commit `3bd5b0f` (fast-forward, `f20d7af..3bd5b0f`, 12 commits). All 4 tasks implemented and individually reviewed (Approved), then a whole-branch review (Opus) found 1 Critical + 2 Important cross-task bugs, fixed in `09c1304` and confirmed resolved by re-review. The user then ran Task 5's manual gate directly against a real, large (13-15 cell, 200+ lines/cell) Kaggle notebook and found the fix still incomplete in practice: live DevTools diagnostics showed the `cmView` expando the MAIN-world bridge's CM6-API path depended on **does not exist** on Kaggle's actual CodeMirror 6 build, so extraction was silently falling back to `.cm-line` DOM scraping the whole time — which only captures whatever's scrolled into view (confirmed: same cell's rendered line count varied 1-86 depending on scroll position), truncating long cells and making lint results fluctuate with scroll. Root-caused live (not guessed) to `window.jupyterapp`, a real JupyterLab `Application` instance present in the notebook iframe; `pageExtractor.ts` was rewritten (`d5f4358`) to read cell source directly from `jupyterapp.shell.currentWidget.content.widgets[i].model.sharedModel.getSource()` — full text, immune to scroll/rendering state — falling back to the old DOM path only where `jupyterapp` isn't reachable. Also fixed in the same pass: the auto-relint focus guard was checking "focus anywhere in any `.cm-content`" instead of "focus in the specific cell that mutated," causing spurious relints while scrolling with focus lingering in a previously-edited cell. A follow-up commit (`85a8a2b`) added a one-time catch-up lint for a suspected async-content-load race that turned out to be a misdiagnosis (see below) but is kept as low-risk. Re-verification after the Jupyter-model fix: error count held stable (356, later corrected to 178 — see below) across many repeated relints and scroll positions, confirming the scroll-truncation bug is fixed. **One anomaly noted but not resolved:** a single observed 2x error-count duplication (178→356, confirmed a literal duplicate of one specific error, not new content) did not reproduce across 5 follow-up attempts; documented as unconfirmed in `docs/next_plans/milestone-2-reliable-code-extraction/notes.md` rather than "fixed" without root cause, per systematic-debugging discipline — user's call to move on rather than keep chasing a non-reproducing symptom. **Important for M3:** the extraction stack M3 will consume (`KaggleDomParser.extractCells()`, the MAIN-world bridge, `CodeMirrorManager`) now has a Jupyter-notebook-model-based primary path discovered via live testing, not documented in the original M3 milestone plan text (written 2026-07-09 before this discovery) — M3's Pyodide/Flake8 work should read `packages/extension/src/page/pageExtractor.ts` and this file's M2 paragraph before assuming the extraction interfaces the milestone plan describes are unchanged from the pre-M2 snapshot.

**M3 status: merged to main (2026-07-09).** Commit `5e1bb3a` (fast-forward, `617c3f7..5e1bb3a`, 9 commits). All 5 code tasks implemented and individually reviewed (Approved). Task 1's own review caught 2 Important cross-cutting bugs in the background↔offscreen messaging sketch before Task 2 could build on it: `chrome.runtime.sendMessage()` broadcasts to every listener (not just the intended recipient), so the offscreen document was receiving every client message both directly and via background's re-forward once it existed, and `ensureOffscreen()` had no lock against concurrent `createDocument()` calls. Fixed with a `FLAKE8_OFFSCREEN_REQUEST` envelope (disjoint message-type namespaces) and an in-flight promise lock, both re-reviewed and confirmed resolved; the TDD plan document itself was corrected in place so Tasks 2 onward were built against the fixed design, not the original sketch. Final whole-branch review (Opus): ready to merge, F1/F9/F13 all independently re-verified fixed at the code level (dist contents and manifest inspected directly, full 5-file message path traced by hand); one direct regression found (README documented the now-deleted `Flake8Engine` class) and fixed same-session; `docs/architecture.md`'s broader staleness (predates M3 — never refreshed since M1/M2 either) deliberately deferred, not fixed, documented in `docs/next_plans/milestone-3-working-flake8/notes.md`. **The user's own manual gate (Task 6) then found a real, previously-undiscovered bug the review process couldn't catch by inspection alone:** an undefined-variable test case wasn't flagged. Root-caused via `superpowers:systematic-debugging` — not guessed — by extracting the actual shipped Python shim and running it standalone against Python 3.12 + pyflakes 3.1.0 (the bundled version): `ContextAwareChecker.__init__` assigned `self.known_context` *after* calling `super().__init__(tree, filename)`, but pyflakes' `Checker.__init__` runs its full AST analysis synchronously and calls the overridden `report()` (which reads `self.known_context`) *during* that super call — so any cell containing an undefined name crashed with `AttributeError`, silently discarding that cell's entire result set (caught by a broad `except Exception`). Confirmed via an isolated single-cell repro with zero cross-cell context involved, ruling out a context-suppression explanation. This bug predates M3 entirely (moved verbatim from the old `Flake8Engine.ts`, verified byte-identical by two independent task reviewers) and was never exercised end-to-end before M3 fixed F1 — Flake8 couldn't run in a browser at all until this milestone. Fixed by swapping the two lines, validated three ways before touching production code, added as a TDD regression test (string-inspection of the `PYTHON_SHIM` constant's `__init__` ordering, since this repo has no Python execution test infra), independently re-verified by a fix reviewer who re-ran it against real pyflakes. Also added in the same pass: a per-lint duration timer in `runLinter` (user-requested, confirmed real lint time is <2s once Pyodide is warm, vs. the ~30s one-time load message). Plan: `docs/superpowers/plans/2026-07-09-m3-working-flake8.md`. **Important for later milestones:** M5 (tests-and-ci) should know this repo now has exactly one Python-adjacent test (`packages/core/src/__tests__/flake8Shim.test.ts`, string-inspection only, no real Python execution in CI) — if M5 wants stronger guarantees on the Python shim, it needs to decide whether to add actual Python+pyflakes execution to CI or keep relying on string-inspection regression tests for known failure patterns.

**Lint-engine-consolidation status: merged to main (2026-07-10), NOT part of the M1-M6 roadmap.** An unplanned project, requested by the user "before M4," deleted the entire handmade rule engine (`packages/core/src/rules/`, `LintEngine.ts`, and their types) and rewrote the flake8 engine to concatenate the whole notebook into one source string and call flake8's real `Application`/`StyleGuide` API in a single pass (replacing the old per-cell `ContextAwareChecker` hand-rolled cross-cell tracking), then added ruff as a second engine via `@astral-sh/ruff-wasm-web` sharing the same offscreen-document/background-relay architecture Milestone 3 built. Settings shape changed (`{linterEngine:'handmade'|'flake8', rules:{...}}` → `{linterEngine:'flake8'|'ruff', flake8IgnoreCodes, ruffIgnoreCodes}`, no migration). Popup UI rewritten (engine radio Flake8/Ruff, ignore-codes input, no rule toggles). Full spec/plan: `docs/superpowers/specs/2026-07-09-lint-engine-consolidation-design.md`, `docs/superpowers/plans/2026-07-09-lint-engine-consolidation.md`. Three live bugs were found and fixed during its own manual gate (all via `superpowers:systematic-debugging` with real local repros, not guessed): a synchronous-WASM-compile-on-main-thread crash for ruff (Chrome refuses `new WebAssembly.Module()` for >8MB on a document's main thread), a magic/shell-line-blanking false positive that turned real code continuations into syntax errors, and — per explicit user direction ("it shouldn't block, people can make a cell and not run it") — a new `lintNotebookWithSyntaxIsolation` feature so one cell's syntax error no longer suppresses the whole notebook's lint results. **`docs/architecture.md` and `docs/review-findings.md` were both updated 2026-07-10 to reflect this** (architecture.md rewritten in place; review-findings.md got an addendum section, original findings left untouched per the M3 precedent for smaller drift). **Milestone 4 Tasks 4 and 5, and Milestone 5 Task 1, target files/subsystems this project deleted — read the inline notes added to those plan.md files 2026-07-10 before expanding them; do not execute them as originally written.**

**Roadmap rebase (2026-07-10, post-consolidation re-review):** a fresh review of current `main` confirmed the two bugs the user reported from live use plus one from inspection — **F32** (content script mounts an overlay in *every* matching frame: the outer kaggle.com shell gets a dead duplicate next to the working iframe one), **F33** (click-to-scroll uses cell-level smooth `scrollIntoView`, which both misses the line in long cells and drifts under Kaggle's virtualization; also scrolls *twice* per click — Overlay and ContentApp each scroll), **F34** (the merge-only cell store keeps deleted cells' errors forever, even though the Jupyter-model extraction path is actually authoritative and could clear them). Second addendum in `docs/review-findings.md`. Two new milestones: **M7 single-frame-and-navigation** (fixes all three; bridge gains `SCROLL_TO_CELL_LINE` and a `source: 'model'|'dom'` field — additive protocol only) and **M8 user-experience** (ruff as default engine, in-editor line markers, one-click ignore-code, minimized-pill + toolbar badges, overlay position persistence; absorbs M6's old Task 1 overlay rewrite as its Task 1 so features build on the React-pure overlay — M6 T1 now has a skip-note). Execution order is now **M7 → M8 → M4 → M5 → M6**; M6's depends-on line and M4 Task 1 got matching notes.

**P1 — Plan expansion (once per milestone):**
> Read docs/review-findings.md, docs/architecture.md, docs/next_plans/README.md, and docs/next_plans/milestone-〈N〉-〈slug〉/plan.md. The milestone plan's decisions are pre-made — do not re-open them, do not brainstorm. Use superpowers:writing-plans to expand it into a full TDD implementation plan at docs/superpowers/plans/〈date〉-m〈N〉-〈slug〉.md, verifying every file path, line reference, and signature the milestone plan names against real current source (the plans were written 2026-07-09; earlier milestones may have moved things — the F-finding intent wins, note deviations). Keep the milestone plan's manual verification gate as the final task, marked USER-GATE. Then stop for my review — do not start implementing. If the file will be large, write it by appending sections.

Current: Read docs/review-findings.md (both addenda), docs/architecture.md, docs/next_plans/README.md, and docs/next_plans/milestone-7-single-frame-and-navigation/plan.md. The milestone plan's decisions are pre-made — do not re-open them, do not brainstorm. Use superpowers:writing-plans to expand it into a full TDD implementation plan at docs/superpowers/plans/〈date〉-m7-single-frame-and-navigation.md, verifying every file path and signature the milestone plan names against real current source. Two things the expansion must respect: (1) the Jupyter API calls in Task 3 (`scrollToItem`, `revealPosition`, etc.) are an *expected shape* to live-probe on a real notebook, not verified fact — the plan says so; keep them as probe-first steps with the DOM-scroll fallback, don't present them as certain; (2) bridge protocol changes are additive-only and the settings storage shape is frozen. Keep the plan's Task 5 manual verification gate as the final task, marked USER-GATE. Then stop for my review — do not start implementing.

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

**M7 — single-frame-and-navigation (5 tasks):**
- B1 = T1–2 (mount gate + uuid plumbing: small, warm; T1 is behavior-critical but mechanically simple)
- B2 = T3–4 (bridge scroll + store reconciliation: both extend `bridgeProtocol.ts`/`pageExtractor.ts`, definitely warm; **high effort** — world-boundary code, and T3's Jupyter API shape needs live probing like M2 did)
- GATE = T5 (yours: needs the 200+ line cell notebook; test scroll from far away and the delete-a-cell case specifically)

**M8 — user-experience (7 tasks):**
- B1 = T1 (overlay React rewrite, ex-M6-T1 — solo, **high effort**, drag/animation subtlety)
- B2 = T2 (ruff default: tiny, could piggyback on B1's session end)
- B3 = T3 (in-editor line markers — solo, **high effort**; the line→element mapping under virtualization is this milestone's hard problem, expect live probing and possibly a bridge extension)
- B4 = T4–6 (ignore-button + badges + persistence: independent small features, one warm session)
- GATE = T7 (yours: fresh-profile install, full checklist)

**M4 — config-and-build-hygiene (6 tasks, all independently revertible):**
- B1 = T1–3 (manifest + popup.css move + version single-sourcing: all config, one warm session)
- B2 = T4–5 **RESCOPED 2026-07-10** — T4 is now just "delete ui-components' duplicated LintError/Severity, import from core" (F16's target files, LintEngine.ts/Flake8Engine.ts, are deleted — that half of T4 is moot); T5 is fully moot (LintEngine.ts deleted) — skip it or replace with a note in the milestone's notes.md. Re-plan this batch against the plan.md's inline notes before expanding, don't execute the original task text.
- B3 = T6 (toolchain: npm install churn + the ui-components packaging decision — solo so the decision gets its own review)
- No manual gate; P3 + a 2-minute unpacked-load sanity check suffices.

**M5 — tests-and-ci (4 tasks):**
- B1 = T1 **MOOT 2026-07-10** — the 8 rules this task tests were deleted along with the rest of the handmade engine. Skip; the lint-engine-consolidation project already added its own thorough Jest coverage for the replacement logic (`buildNotebookSource.test.ts`, `severityMapping.test.ts`, `lintWithSyntaxIsolation.test.ts`, `flake8Shim.test.ts`) — verify that coverage is adequate rather than writing new rule suites.
- B2 = T2–3 **T2 needs rescoping** (targets deleted `LintEngine.test.ts`; the cross-cell-context/error-isolation behaviors it wanted to test now live in `lintWithSyntaxIsolation.ts`, already tested) — verify existing coverage before adding more. T3 (extension jsdom infra) is unaffected, still valid.
- B3 = T4 (CI repair — needs branch pushes to verify; keep the deliberate-red-then-green check)
- No manual gate.

**M6 — ux-and-release (6 tasks; T1 moved to M8 B1 2026-07-10 — skip it here):**
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

**Repo-specific routing:** DeepSeek-eligible batches are the mechanical ones — M7 B1, M8 B2/B4, M4 B1/B2, M5 B1/B2, M6 B2/B3. **Claude-only:** M7 B2 (world-boundary bridge + live Jupyter-API probing), M8 B1 (overlay rewrite) and B3 (line markers — the virtualization mapping problem), and every USER-GATE-adjacent batch's review. (Historical: M2 B1 / M3 B1/B3 were Claude-only and are done.) Two extra cautions here versus a repo with e2e scripts:

1. **This repo's automated verification is thin** (build + type-check + growing-but-partial tests, no e2e). DeepSeek's weak spot is confident false claims (~10× Claude's rate), and there is no script to catch "I verified the overlay works." Anything a DeepSeek session *claims* about runtime behavior is unverified until your manual gate — treat its gates-less claims as untested, always.
2. Append to P2: "After EVERY task run `npm run type-check && npm run build && npm test` and additionally list the files changed in `packages/extension/dist/` (`git status` won't show dist — use the build log or `ls -lt`). If the same task fails twice, STOP and report the exact failure; do not improvise around the plan."

Pilot rule applies: first DeepSeek batch (suggest M4 B1) gets a Sonnet spot-review before adopting it for the rest.

## 6. Quick reference card

- Stuck twice on the same failure → stop, `superpowers:systematic-debugging`; still stuck → `/clear` + escalate model. Prompt: "Task 〈n〉 of 〈plan〉 fails: 〈exact error〉. Read the task, docs/review-findings.md 〈relevant F-ids〉, and the failing code; debug systematically — no fixes before a confirmed root cause."
- Windows reminders the executor will forget: run npm scripts from **Git Bash** (package `clean` scripts use `rm -rf`; core's build uses `copyfiles` which is fine anywhere); PowerShell 5.1 has no `&&` — another reason for Git Bash; loading the unpacked extension always points at `packages/extension/dist/`, never the repo root.
- Extension-specific traps: a green webpack build does **not** mean dist is complete (CopyPlugin patterns fail silent-ish — check `dist/` contents after manifest/webpack changes); `chrome.storage.sync` persists across reloads — test settings changes with a fresh profile or after clearing storage when behavior looks sticky; content-script changes need an extension **reload** at `chrome://extensions` *and* a page refresh.
- Before merging anything: `superpowers:verification-before-completion` — evidence, not claims; for this repo that includes your own manual gate sign-off.
- Keep this file honest: when a batch grouping or task numbering proves wrong in practice, edit this file in the same session.
