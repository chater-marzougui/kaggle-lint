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

export const SCROLL_TO_CELL_LINE_REQUEST = 'KAGGLE_LINT_SCROLL_TO_CELL_LINE_REQUEST' as const;
export const SCROLL_TO_CELL_LINE_RESPONSE = 'KAGGLE_LINT_SCROLL_TO_CELL_LINE_RESPONSE' as const;

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
