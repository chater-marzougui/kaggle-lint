# Notes — Milestone 3 (Working Flake8)

Per `docs/next_plans/README.md` rule 5: documenting deviations caught during
execution rather than reopening the milestone plan itself.

## Background↔offscreen message design corrected (post-Task-1 review)

The milestone plan's Task 1 sketch had the background service worker forward
client messages to the offscreen document via a raw `chrome.runtime.sendMessage(message)`
re-broadcast. This doesn't work as written: `chrome.runtime.sendMessage()`
broadcasts to *every* registered `chrome.runtime.onMessage` listener in the
extension, not just the intended recipient — so once the offscreen document
existed, a content script's original `FLAKE8_LINT_NOTEBOOK`/`FLAKE8_STATUS`
message reached the offscreen listener directly *and* reached background,
which then re-broadcast the same message, reaching offscreen a second time.
Each of Task 2's future `PyodideRuntime.lintNotebook()` calls would have run
twice per logical request, racing on shared Python interpreter state
(`_notebook_context`).

Fix (in `packages/extension/src/flake8/protocol.ts`, `background/index.ts`,
`offscreen/index.ts`): background and offscreen now listen on disjoint
message-type namespaces. Background still receives the client-facing
`FLAKE8_LINT_NOTEBOOK`/`FLAKE8_STATUS` types (gated by `sender.tab`), but
forwards them wrapped in a `FLAKE8_OFFSCREEN_REQUEST` envelope
(`{ type: 'FLAKE8_OFFSCREEN_REQUEST', payload: <original message> }`) that
only the offscreen document acts on. The raw client broadcast still reaches
offscreen's listener directly too, but its type-check makes that a no-op, so
each logical request is answered exactly once.

A second, related bug in the same sketch: `ensureOffscreen()`'s
`hasDocument()` → `createDocument()` sequence had no in-flight lock, so two
near-simultaneous lint requests (plausible given the content script's
`all_frames: true` registration) could both observe `hasDocument() === false`
and both call `createDocument()`, which throws on the second call ("Only a
single offscreen document may be created"). Fixed with a module-level
in-flight `creatingOffscreen` promise, matching Chrome's own documented
offscreen-document sample pattern.

Both fixes were caught by Task 1's own task-scoped review (not by live
testing — this milestone's manual USER-GATE, Task 6, has not run yet as of
this note), confirmed resolved by re-review, and the corrected shape was
carried forward into the plan document itself (Task 2's Step 2) so later
tasks were built against the corrected design rather than the original
sketch.

## docs/architecture.md deferred, not updated

The final whole-branch review flagged `docs/architecture.md` as describing
pre-M3 state (old `Flake8Engine.ts`, no background service worker, stale
manifest permissions). This is accurate, but the document was already stale
before M3 started — it still describes bugs Milestone 1 and Milestone 2 both
already fixed (the F2 infinite re-lint loop, the dead `CodeMirrorManager`,
the MAIN-world extraction gap), and no milestone has refreshed it so far.
Rewriting it fully is disproportionate to a single milestone's fix round and
risks re-litigating content well outside M3's own diff. Deferred to a
dedicated documentation pass (candidate: fold into Milestone 6's README/docs
truth pass, which already owns F24).

`README.md`'s Flake8 usage example (`Flake8Engine` class, deleted by this
milestone) *was* fixed in this milestone's own final-review fix round — that
one is a direct regression this milestone caused (a user-facing code sample
that now throws an import error), not pre-existing drift, so it didn't wait
for a later milestone.
