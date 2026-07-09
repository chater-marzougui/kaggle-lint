# Notes — Milestone 2 (Reliable Code Extraction)

Per `docs/next_plans/README.md` rule 5: documenting a deviation caught after implementation rather than reopening the milestone plan itself.

## `clear()`-on-bridge removed (post-implementation correction)

The original implementation (see the TDD plan's Task 3 Step 2, itself following the milestone plan's own text) cleared `CodeMirrorManager`'s cell store whenever `KaggleDomParser.extractCells()` reported its result came from the MAIN-world bridge (`getLastExtractionSource() === 'bridge'`), on the theory that a bridge sweep is a full, authoritative list of every cell in the notebook — so it's safe to drop stale entries (e.g. cells the user deleted) before re-syncing.

That theory was wrong. `pageExtractor.ts`'s `extractAllCells()` (the MAIN-world side of the bridge) still walks `document.querySelectorAll('.jp-CodeCell .cm-editor')` — it gets full CodeMirror document text for editors that *are* mounted, but has no more visibility than the isolated-world DOM-scrape fallback into cells Kaggle hasn't mounted an editor for at all (i.e. scrolled far off-screen in a virtualized notebook). So on essentially every normal lint (bridge succeeds the vast majority of the time), `clear()` wiped the store's virtualized-out cells and the subsequent `syncCells(cells)` only re-added whatever was currently rendered — meaning the store never actually retained coverage for scrolled-away cells. That's the exact problem (F7) this milestone exists to fix, silently defeated on the normal operating path.

A whole-branch code review caught this. The fix (see the commit that added this note) removes the clear-on-bridge branch entirely — `runLinter` now always calls `codeMirrorManager.syncCells(cells)` (merge only), regardless of which extraction path ran. The accepted tradeoff: a cell the user deletes leaves a stale entry in the store until the page is reloaded, since DOM-based extraction can't distinguish "deleted" from "not currently rendered." A more sophisticated fix (querying the Jupyter notebook model for a true full cell list) was explicitly out of scope for this correction pass.

Two other Important-severity bugs were fixed in the same review pass, unrelated to the store-clearing design but found in the same milestone's code:

- The debounced auto re-lint `MutationObserver` fired on scroll, not just edits, because virtualized mount/unmount of `.cm-line` nodes is a `childList` mutation indistinguishable from a real edit. Fixed with a focus guard (`document.activeElement` must be inside `.cm-content`).
- `KaggleDomParser.extractCellsViaDomScrape`'s `cellIndex` counter skipped incrementing on markdown cells, so it diverged from `pageExtractor.ts`'s "index among all `.jp-Cell`" convention — corrupting cell sort order and reported cell numbers whenever both extraction paths wrote to the same notebook's store. Fixed by incrementing the index unconditionally once per cell.
