/**
 * In-editor severity markers (Milestone 8, Task 3 — the "flagship"
 * feature): tags the rendered `.cm-line` DOM elements directly from the
 * content script. Never touches CodeMirror state/effects — injecting
 * StateEffects from our bundle into the page's own CM6 instances is a
 * cross-instance trap, and the `cmView` expando that would be needed to
 * reach them doesn't exist on Kaggle's build anyway (see
 * page/pageExtractor.ts's doc comment on extractViaJupyterModel).
 *
 * The hard part is mapping a lint error's line number to the right
 * `.cm-line` element when a cell is virtualized: CodeMirror only mounts
 * `.cm-line` nodes for the visible viewport, and their position among
 * `.cm-content`'s children is relative to *that viewport*, not the
 * document — `children[line - 1]` is correct at the top of a short,
 * fully-rendered cell and wrong everywhere a marker actually matters.
 *
 * Fix: CM6's line-number gutter renders one `.cm-gutterElement` per
 * visible line, in the same order as `.cm-content`'s `.cm-line` children,
 * and a gutter element's *text* is always the real document line number —
 * that's the entire purpose of a line-number gutter, it has to stay
 * correct as you scroll. So this reads the gutter's line numbers, pairs
 * each one with the `.cm-line` at the same position, and looks the target
 * line up directly in that map — no reliance on "the Nth mounted line"
 * ever meaning "document line N." Live-probed per this milestone's
 * notes.md before trusting this in production.
 */

import type { Severity } from '@kaggle-lint/core';
import { createLogger } from '../utils/logger';

const logger = createLogger('LineMarkers');

export interface MarkerTarget {
  cellElement: Element;
  cellLine: number;
  severity: Severity;
  code?: string;
  msg: string;
}

const MARKER_CLASSES = [
  'kaggle-lint-line-error',
  'kaggle-lint-line-warning',
  'kaggle-lint-line-info',
] as const;

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function severityClass(severity: Severity): string {
  return `kaggle-lint-line-${severity}`;
}

/**
 * Maps document line number -> rendered `.cm-line` element for one cell,
 * using the line-number gutter as the source of truth for "which document
 * line is this DOM node." Returns an empty map if the cell has no gutter
 * or the gutter/content line counts don't match (not a code cell, gutter
 * disabled, or a live DOM shape this hasn't been probed against) — callers
 * must treat that as "can't mark this cell right now," not an error.
 */
function buildLineElementMap(cellElement: Element): Map<number, HTMLElement> {
  const map = new Map<number, HTMLElement>();
  const gutterElements = Array.from(
    cellElement.querySelectorAll('.cm-gutters .cm-lineNumbers .cm-gutterElement')
  );
  const lineElements = Array.from(cellElement.querySelectorAll('.cm-content > .cm-line'));

  if (gutterElements.length === 0 || gutterElements.length !== lineElements.length) {
    logger.log(
      `buildLineElementMap: bailing, gutter=${gutterElements.length} line=${lineElements.length}`
    );
    return map;
  }

  gutterElements.forEach((gutterEl, i) => {
    const text = gutterEl.textContent?.trim() ?? '';
    const lineNumber = Number.parseInt(text, 10);
    if (Number.isInteger(lineNumber) && lineNumber > 0) {
      map.set(lineNumber, lineElements[i] as HTMLElement);
    }
  });

  return map;
}

/**
 * Applies severity markers for every target whose cell is currently
 * rendered and whose line is currently mounted; clears every marker this
 * module has ever added first, notebook-wide (or scoped to `root`), so a
 * line whose error disappeared on the next lint doesn't keep a stale
 * marker — a per-cell "only clear cells present in the new targets"
 * optimization would miss exactly that case (a cell that HAD an error and
 * now has none isn't in `targets` at all). Errors for virtualized-out
 * cells/lines are silently skipped; they'll get marked once the user
 * scrolls them into view and a refresh pass re-runs this function.
 */
export function applyLineMarkers(targets: MarkerTarget[], root: ParentNode = document): void {
  clearAllLineMarkers(root);

  const mapByCell = new Map<Element, Map<number, HTMLElement>>();
  const bestSeverityByLine = new Map<HTMLElement, Severity>();
  const titlesByLine = new Map<HTMLElement, string[]>();
  let unresolved = 0;

  for (const target of targets) {
    let lineMap = mapByCell.get(target.cellElement);
    if (!lineMap) {
      lineMap = buildLineElementMap(target.cellElement);
      mapByCell.set(target.cellElement, lineMap);
    }
    const lineEl = lineMap.get(target.cellLine);
    if (!lineEl) {
      unresolved++;
      continue;
    }

    const current = bestSeverityByLine.get(lineEl);
    if (!current || SEVERITY_RANK[target.severity] < SEVERITY_RANK[current]) {
      bestSeverityByLine.set(lineEl, target.severity);
    }
    const codePart = target.code ? `${target.code}: ` : '';
    const titles = titlesByLine.get(lineEl) ?? [];
    titles.push(`${codePart}${target.msg}`);
    titlesByLine.set(lineEl, titles);
  }

  bestSeverityByLine.forEach((severity, lineEl) => {
    lineEl.classList.add(severityClass(severity));
  });
  titlesByLine.forEach((titles, lineEl) => {
    lineEl.setAttribute('title', titles.join('\n'));
  });

  logger.log(
    `applyLineMarkers: ${targets.length} targets, ${unresolved} unresolved, ${bestSeverityByLine.size} lines marked`
  );
}

/** Clears every marker this module has ever added, scoped to `root` (the whole document by default). Used on overlay hide/disable and at the start of every applyLineMarkers call. */
export function clearAllLineMarkers(root: ParentNode = document): void {
  const marked = root.querySelectorAll(
    '.cm-line.kaggle-lint-line-error, .cm-line.kaggle-lint-line-warning, .cm-line.kaggle-lint-line-info'
  );
  marked.forEach((el) => {
    el.classList.remove(...MARKER_CLASSES);
    el.removeAttribute('title');
  });
}
