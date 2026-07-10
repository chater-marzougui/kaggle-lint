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

## Task 7 live-gate result: gutter-mapping probe FAILED — correction below

**Correction to the entry originally written here:** an earlier pass of
this gate reported the gutter probe as confirmed correct, based on markers
visibly working once after the very first page load. Continued testing
the same session found markers stopped reappearing on any subsequent
relint or engine switch, which prompted re-opening the investigation.
Direct DevTools inspection then confirmed the gutter probe from item 1
above actually **fails**: `document.querySelector('.jp-CodeCell .cm-gutters')`
and `.cm-lineNumbers` are both `null` on this Kaggle build — there is no
line-number gutter at all, confirmed by also grepping the full computed
stylesheet dump for `.cm-gutters` (zero matches). The one working instance
was a coincidence of DOM ordering happening to line up for the specific
cell/line visible at that moment, not the gutter mechanism actually
functioning.

Per item 4's own pre-specified fallback, marker application has been moved
into MAIN world (`page/pageExtractor.ts`) via a new `APPLY_LINE_MARKERS`
bridge request/response pair in `page/bridgeProtocol.ts`, resolving a
document line number to its live `.cm-line` node with the real CM6
EditorView's `domAtPos()` — the same technique `scrollToCellLine`'s
highlight already used successfully. `lineMarkers.ts` is now a thin
request wrapper; `buildLineElementMap`'s gutter-reading code has been
deleted entirely (not adapted — there is nothing to adapt to, since the
DOM signal it depended on doesn't exist). `MarkerTarget` is keyed by
`uuid`/`cellIndex` rather than a DOM element reference.

A second, independent bug was found in the same investigation:
`KaggleDomParser.resolveElements()`'s positional fallback assumed
`document.querySelectorAll('.jp-Cell')` returns elements in notebook-index
order; live-confirmed it does not under Kaggle's windowed-notebook
rendering (only 1 of 13 code cells got an element attached in one capture).
Fixed by preferring the live `data-windowed-list-index` attribute
(confirmed present on real Kaggle cell elements) before the raw positional
fallback. This bug affected click-to-scroll's DOM fallback and the M7
cell-highlight, independent of the marker rearchitecture above.

The virtualization-laziness behavior described in the superseded text
above (a marker only appears once its line is mounted, backfilled via
`MutationObserver` + rescroll) remains real and expected — that part of
the original analysis was correct, just built on top of a gutter mechanism
that turned out not to exist.
