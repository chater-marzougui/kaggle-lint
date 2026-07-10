/**
 * Message-bridge protocol shared between the MAIN-world extractor
 * (pageExtractor.ts) and the isolated-world content script
 * (utils/KaggleDomParser.ts). Both worlds run in the same frame, so
 * window.postMessage is used instead of chrome.runtime messaging.
 */

export const EXTRACT_REQUEST = 'KAGGLE_LINT_EXTRACT_REQUEST' as const;
export const EXTRACT_RESPONSE = 'KAGGLE_LINT_EXTRACT_RESPONSE' as const;

export interface ExtractRequestMessage {
  type: typeof EXTRACT_REQUEST;
  requestId: string;
}

export interface PageExtractedCell {
  code: string;
  cellIndex: number;
  uuid: string | null;
}

export interface ExtractResponseMessage {
  type: typeof EXTRACT_RESPONSE;
  requestId: string;
  cells: PageExtractedCell[];
  // Optional so a stale-cached pageExtractor.js predating this field still
  // produces a valid message — the consumer (KaggleDomParser) treats a
  // missing source as the more conservative 'dom' (merge-only) path.
  source?: 'model' | 'dom';
}

export const SCROLL_TO_CELL_LINE_REQUEST =
  'KAGGLE_LINT_SCROLL_TO_CELL_LINE_REQUEST' as const;
export const SCROLL_TO_CELL_LINE_RESPONSE =
  'KAGGLE_LINT_SCROLL_TO_CELL_LINE_RESPONSE' as const;

export interface ScrollToCellLineRequestMessage {
  type: typeof SCROLL_TO_CELL_LINE_REQUEST;
  requestId: string;
  uuid: string | null;
  cellIndex: number;
  line: number;
}

export interface ScrollToCellLineResponseMessage {
  type: typeof SCROLL_TO_CELL_LINE_RESPONSE;
  requestId: string;
  ok: boolean;
}

// M8 Task 3 follow-up: live-probed against real Kaggle DOM, confirmed there
// is no line-number gutter at all (`.cm-gutters`/`.cm-lineNumbers` both
// absent), invalidating the isolated-world gutter-mapping this milestone's
// notes.md flagged as unvalidated. Per that doc's own documented fallback,
// marker application moves into MAIN world, which resolves a document line
// number to its live `.cm-line` DOM node via the real CM6 EditorView's
// domAtPos() — the same technique SCROLL_TO_CELL_LINE_REQUEST's highlight
// already uses successfully — instead of guessing from isolated-world DOM.
export const APPLY_LINE_MARKERS_REQUEST =
  'KAGGLE_LINT_APPLY_LINE_MARKERS_REQUEST' as const;
export const APPLY_LINE_MARKERS_RESPONSE =
  'KAGGLE_LINT_APPLY_LINE_MARKERS_RESPONSE' as const;

export interface LineMarkerTarget {
  uuid: string | null;
  cellIndex: number;
  cellLine: number;
  severity: 'error' | 'warning' | 'info';
  title: string;
}

export interface ApplyLineMarkersRequestMessage {
  type: typeof APPLY_LINE_MARKERS_REQUEST;
  requestId: string;
  // Empty array means "clear every marker" — applying always clears first.
  targets: LineMarkerTarget[];
}

export interface ApplyLineMarkersResponseMessage {
  type: typeof APPLY_LINE_MARKERS_RESPONSE;
  requestId: string;
  markedCount: number;
}
