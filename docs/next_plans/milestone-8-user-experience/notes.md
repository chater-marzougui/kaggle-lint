# Notes — Milestone 8 (User-Experience Features)

## Task 3: line-marker mapping — live-probe result

**Not performed.** This task was implemented by an agent with no browser
access (no DevTools, no ability to open a real Kaggle notebook), so Step
1's live probe of

```js
document.querySelector('.jp-CodeCell .cm-gutters .cm-lineNumbers')
```

and the gutter/`.cm-line` count-parity check was never run against a real
Kaggle page. `lineMarkers.ts` was implemented exactly as specified in the
task brief — reading `.cm-gutters .cm-lineNumbers .cm-gutterElement` text
as the source of truth for "which document line is this rendered
`.cm-line`" — on the basis that this is CodeMirror 6's own standard
package structure (a line-number gutter has to stay correct as you scroll
by construction), not a Kaggle-specific guess. It is untested against the
live DOM.

**This is the first thing to check during Task 7's manual USER-GATE.**
Concretely, whoever runs that gate should:

1. Open a real Kaggle notebook in edit mode, select any code cell, and run
   the two probe snippets from Step 1 of the Task 3 brief in DevTools —
   confirm the gutter element exists, and confirm gutter-element count
   equals `.cm-line` count with the *first visible* gutter element's text
   not equal to `"1"` after scrolling a 200+ line cell partway down.
2. If both checks pass, `lineMarkers.ts` needs no change — markers should
   already track the correct line at any scroll position.
3. If the selectors don't match what Kaggle renders (different class
   names, a different gutter structure, or line/gutter counts that don't
   line up 1:1), adapt `buildLineElementMap` in
   `packages/extension/src/content/lineMarkers.ts` to match what's
   actually there — the two exported function signatures
   (`applyLineMarkers`, `clearAllLineMarkers`) should stay unchanged so
   `ContentApp.tsx`'s wiring doesn't need to change.
4. Only if no reliable isolated-world DOM signal exists at all (i.e. no
   gutter, and no other way to map document line -> rendered element from
   content-script-accessible DOM) should the bridge protocol
   (`packages/extension/src/page/bridgeProtocol.ts`) be extended with a
   new `LINE_GEOMETRY`-style request/response pair, following the exact
   pattern already established for `SCROLL_TO_CELL_LINE_REQUEST` /
   `_RESPONSE` in Milestone 7. That is a bigger design decision than this
   task's scope and was intentionally not attempted here.

## Task 7 live-gate result: gutter-mapping probe confirmed correct

Run against a real Kaggle notebook during Task 7's manual gate (2026-07-10).
The gutter/`.cm-line` count-parity assumption above holds on the live page:
markers land on the correct line at any scroll position, with no shift.

One behavior surfaced that is NOT a bug, just the documented tradeoff of a
content-script-only DOM marker (see `lineMarkers.ts`'s own doc comment):
markers for a line outside the currently-rendered viewport don't appear
until that line's `.cm-line` node actually mounts, because there is no DOM
node to tag before then. In a 200+ line cell, this means a freshly-linted
error near the top (already mounted) marks immediately, while one further
down only marks once the user scrolls there (or clicks it, which scrolls
to it) — at which point `ContentApp.tsx`'s `MutationObserver`-driven
refresh (300ms debounce) picks up the newly-mounted line and paints it.
No fix needed or possible at the DOM-marker level: even the `LINE_GEOMETRY`
bridge fallback in item 4 above couldn't paint a marker onto a line
CodeMirror hasn't mounted yet. `buildLineElementMap`/`applyLineMarkers`
need no changes.
