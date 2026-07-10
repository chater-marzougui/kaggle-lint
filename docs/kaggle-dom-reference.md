# Kaggle Notebook DOM/CSS Reference

Live-confirmed facts about Kaggle's actual notebook markup and CodeMirror 6
setup, gathered during Milestone 8's Task 7 manual gate (2026-07-10) while
debugging the in-editor line-marker feature. Existing code (`KaggleDomParser.ts`,
`page/pageExtractor.ts`, `content/lineMarkers.ts`) already encodes these
facts; this doc exists so the next investigation starts from confirmed
DOM shape instead of re-guessing it. Update this file, don't treat it as
permanently authoritative — Kaggle can change its frontend at any time,
and every fact below was captured on one live notebook on one date.

## Where the notebook actually lives

The editable notebook renders inside an iframe at
`kkb-production.jupyter-proxy.kaggle.net`, not the outer `kaggle.com/code/...`
page. `window.jupyterapp` (a real JupyterLab `Application` instance) is
only present inside that iframe — this is why the content script's mount
gate matters (F32/M7) and why MAIN-world code (`pageExtractor.ts`) checks
for `jupyterapp` defensively rather than assuming it exists.

## Cell markup

```html
<div
  class="lm-Widget jp-Cell jp-MarkdownCell jp-Notebook-cell ..."
  data-windowed-list-index="0"
  data-uuid="76518410-cdcf-4b70-8e0a-c7e862a04455"
  id="76518410-cdcf-4b70-8e0a-c7e862a04455"
>
  ...
</div>
```

- `.jp-Cell` — every cell, code or markdown, in notebook order.
- `.jp-CodeCell` / `.jp-MarkdownCell` — cell-type subclasses.
- `data-uuid` — present and, in the one notebook checked, equal to the
  element's own `id`. Matching `model.id` (read via `window.jupyterapp` in
  MAIN world) against this attribute is the most reliable cell-to-element
  key when both are available.
- `data-windowed-list-index` — **the notebook-order index**, set by
  JupyterLab 4's windowed-list rendering. This is reliable; positional
  indexing into `document.querySelectorAll('.jp-Cell')` is **not** —
  confirmed live that the query's return order does not always match this
  index (a 13-cell lint pass got a DOM element for only 1 of 13 cells via
  naive positional indexing; switching to `data-windowed-list-index`
  fixed it). If you need "the Nth cell in notebook order," read this
  attribute; don't assume DOM query order.
- All 16 cells of a 16-cell notebook were present in
  `document.querySelectorAll('.jp-Cell')` in the case checked — cell-level
  virtualization did not remove cells from the DOM outright in this test;
  the bug was DOM order, not DOM absence. Don't assume this generalizes to
  much larger notebooks without re-checking.

## CodeMirror 6 structure

- `.cm-editor` → `.cm-content` → `.cm-line` (one per rendered line).
- **No line-number gutter exists.** `document.querySelector('.jp-CodeCell .cm-gutters')`
  and `.cm-lineNumbers` both return `null`. Confirmed twice (direct query,
  and grepping a full computed-stylesheet dump for `.cm-gutters` — zero
  hits). Any code that assumes a gutter for line-number mapping is wrong on
  this page, not just unproven.
- CM6 only mounts `.cm-line` DOM nodes for lines currently in or near the
  viewport (own internal virtualization, independent of the notebook's
  cell-level windowing above). A 200+ line cell's `.cm-line` count
  fluctuates with scroll position (previously confirmed 1–86 lines
  rendered for the same cell depending on scroll — see M2's notes).
- Editor-wide styling is theme-driven via CSS custom properties
  (`--jp-*`, `--kaggle-theme-*`) and at least one hardcoded
  `!important` override: `.jp-Notebook .cm-editor { background: ... !important; ... }`.
  Extension CSS injected onto `.cm-line` (e.g. severity-tint markers) needs
  enough specificity/alpha to read against whatever the active theme sets;
  don't assume a plain `background-color` on a low-specificity selector
  wins by default.

## The one reliable line → DOM technique: `domAtPos`

Since there is no gutter and CM6 virtualizes lines, the only technique
confirmed to reliably map a **document line number** to its live `.cm-line`
DOM node — including under virtualization, and regardless of what's
currently scrolled into view — is the real CM6 `EditorView`'s own API,
reached from MAIN world:

```js
const app = window.jupyterapp;
const widget = app.shell.currentWidget.content.widgets[cellIndex]; // or find by widget.model.id === uuid
const view = widget.editor.editor; // the live CM6 EditorView
const doc = view.state.doc;
const linePos = doc.line(lineNumber).from; // 1-based lineNumber
const domPos = view.domAtPos(linePos);
const lineEl = domPos.node.parentElement?.closest('.cm-line'); // or domPos.node itself if it's already an Element
```

`domAtPos` returns a node only if that position is currently mounted; if
the line isn't rendered yet (just scrolled to, or never rendered), retry
across a bounded number of `requestAnimationFrame` calls rather than
assuming it's available synchronously (confirmed: reading it in the same
tick as a scroll-triggering call only works when no scroll was actually
needed). This is the technique both `pageExtractor.ts`'s click-to-scroll
highlight (Milestone 7) and its in-editor lint markers (Milestone 8) use.

This only works in MAIN world — the isolated content script has no
equivalent signal (confirmed: no gutter, and the `cmView` DOM expando some
CM6 setups expose does not exist on Kaggle's build either, per
`pageExtractor.ts`'s own doc comments from Milestone 2).

## Practical implications for future work

- Don't reach for a gutter-based or DOM-query-position-based approach to
  map "document line N" or "notebook cell N" to a live element on this
  page — both were tried, and both were wrong on live Kaggle DOM despite
  being reasonable-looking assumptions from reading the CM6/JupyterLab
  source.
- Prefer, in order: `data-uuid` / `model.id` match → `data-windowed-list-index`
  → `domAtPos` (for line-level lookups) → raw DOM query order (last
  resort, unreliable on its own).
- Any new isolated-world DOM assumption about Kaggle's notebook markup
  should be spot-checked live before being trusted in production, the same
  way this milestone's own gutter assumption wasn't (see
  `docs/next_plans/milestone-8-user-experience/notes.md` for how that
  played out) — a plausible-looking selector is not a verified one.
